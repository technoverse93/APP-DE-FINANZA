/**
 * Edge Function `binance-order`.
 *
 * Envía una orden de mercado real (compra o venta) a la API de Binance, en
 * Modo Real. Es la única función de todo el módulo de cripto que mueve
 * algo real: se invoca exclusivamente cuando el usuario toca "Comprar" o
 * "Vender" en la pantalla — nunca desde un cron ni desde el motor de
 * señales. Ese motor (src/core/crypto/signals.ts) solo sugiere; esta
 * función es la que ejecuta, y solo lo hace por una acción explícita del
 * usuario en el momento.
 *
 * Por defecto trabaja contra la Testnet pública de Binance
 * (testnet.binance.vision), que usa fondos ficticios sobre la misma API
 * real: permite validar firma de peticiones, símbolo y redondeo de
 * cantidades sin arriesgar dinero. Pasar a 'mainnet' es una elección
 * explícita del dueño (columna crypto_config.entorno_real), nunca el valor
 * por defecto.
 *
 * Las claves de API (par distinto para testnet y para mainnet) viven en
 * Supabase Vault, nunca en el teléfono ni en este repositorio:
 *   - binance_testnet_api_key / binance_testnet_api_secret
 *   - binance_api_key / binance_api_secret
 *
 * En mainnet, además, la petición a Binance sale a través de un proxy HTTP
 * propio (un servidor con IP fija, fuera de Supabase) en vez de salir
 * directo. Esto no es una preferencia: Supabase Edge Functions no tienen
 * una IP de salida fija (corren en una red global de Deno Deploy), y
 * Binance exige restringir la key a IPs conocidas en cuanto se habilita
 * cualquier permiso más allá de solo lectura — sin eso, Binance borra la
 * key sola. El proxy nunca ve la API key ni el secret: la firma HMAC ya
 * viaja armada en la URL: el proxy solo reenvía bytes a api.binance.com.
 * Su dirección vive en Vault como `binance_proxy_url`
 * (`http://usuario:password@IP:PUERTO`).
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Entorno = 'testnet' | 'mainnet';
type Lado = 'compra' | 'venta';

const BASE_URL: Record<Entorno, string> = {
  testnet: 'https://testnet.binance.vision',
  mainnet: 'https://api.binance.com',
};

const NOMBRE_SECRETO_API_KEY: Record<Entorno, string> = {
  testnet: 'binance_testnet_api_key',
  mainnet: 'binance_api_key',
};

const NOMBRE_SECRETO_API_SECRET: Record<Entorno, string> = {
  testnet: 'binance_testnet_api_secret',
  mainnet: 'binance_api_secret',
};

/**
 * `moneda` es el id de CoinGecko que ya usa el resto del módulo de cripto
 * (crypto_precios, crypto_config). Binance usa su propio símbolo de mercado;
 * este mapa es deliberadamente corto: agregar una moneda nueva es agregar
 * una línea acá, no inventar una regla general de conversión que Binance no
 * garantiza (no todos los pares cotizan igual en todos los exchanges).
 */
const SIMBOLO_BINANCE: Record<string, string> = {
  bitcoin: 'BTCUSDT',
  ethereum: 'ETHUSDT',
};

interface PeticionOrden {
  readonly entorno?: Entorno;
  readonly moneda?: string;
  readonly lado?: Lado;
  readonly cantidad?: number;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return json({ error: 'Se espera POST' }, 405);
  }

  const usuario = await identificarUsuario(req.headers.get('Authorization'));
  if (!usuario) {
    return json({ error: 'No autenticado' }, 401);
  }

  const peticion: PeticionOrden = await req.json().catch(() => ({}));
  const entorno: Entorno = peticion.entorno === 'mainnet' ? 'mainnet' : 'testnet';
  const moneda = peticion.moneda ?? 'bitcoin';
  const lado = peticion.lado;
  const cantidad = peticion.cantidad;

  const simbolo = SIMBOLO_BINANCE[moneda];
  if (!simbolo) {
    return json({ error: `"${moneda}" no tiene un símbolo de Binance configurado` }, 400);
  }
  if (lado !== 'compra' && lado !== 'venta') {
    return json({ error: 'lado debe ser "compra" o "venta"' }, 400);
  }
  if (!Number.isFinite(cantidad) || (cantidad as number) <= 0) {
    return json({ error: 'cantidad debe ser un número positivo' }, 400);
  }

  const servicio = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const { apiKey, apiSecret } = await leerCredencialesBinance(servicio, entorno);
    const proxyUrl = entorno === 'mainnet' ? await leerSecreto(servicio, 'binance_proxy_url') : null;
    const resultado = await enviarOrdenBinance({
      entorno,
      simbolo,
      lado: lado as Lado,
      cantidad: cantidad as number,
      apiKey,
      apiSecret,
      proxyUrl,
    });

    await servicio.from('crypto_ordenes_reales').insert({
      usuario_id: usuario.id,
      entorno,
      simbolo_exchange: simbolo,
      lado,
      cantidad_solicitada: cantidad,
      cantidad_ejecutada: resultado.cantidadEjecutada,
      precio_promedio: resultado.precioPromedio,
      orden_id_exchange: resultado.ordenId,
    });

    // La ejecución real (cantidad y precio efectivos de Binance, no lo
    // pedido) es lo que alimenta la billetera de Modo Real en la app —
    // igual que en Simulación, pero acá el número sale del exchange, nunca
    // de lo que el usuario tecleó.
    if (resultado.cantidadEjecutada > 0 && resultado.precioPromedio !== null) {
      await servicio.from('crypto_movimientos').insert({
        usuario_id: usuario.id,
        modo: 'real',
        moneda,
        tipo: lado,
        cantidad: resultado.cantidadEjecutada,
        precio_unitario: resultado.precioPromedio,
      });
    }

    return json({
      cantidadEjecutada: resultado.cantidadEjecutada,
      precioPromedio: resultado.precioPromedio,
      ordenId: resultado.ordenId,
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await servicio.from('crypto_ordenes_reales').insert({
      usuario_id: usuario.id,
      entorno,
      simbolo_exchange: simbolo,
      lado,
      cantidad_solicitada: cantidad,
      cantidad_ejecutada: 0,
      error: mensaje,
    });
    return json({ error: mensaje }, 502);
  }
});

/** Identifica al usuario a partir del JWT de la petición, sin usar la
 * service role para eso: así la orden siempre queda atribuida a quien de
 * verdad la tocó en la app, no a un valor que el cliente podría mandar. */
async function identificarUsuario(
  authHeader: string | null,
): Promise<{ id: string } | null> {
  if (!authHeader) return null;
  const cliente = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await cliente.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id };
}

async function leerCredencialesBinance(
  servicio: SupabaseClient,
  entorno: Entorno,
): Promise<{ apiKey: string; apiSecret: string }> {
  const [apiKey, apiSecret] = await Promise.all([
    leerSecreto(servicio, NOMBRE_SECRETO_API_KEY[entorno]),
    leerSecreto(servicio, NOMBRE_SECRETO_API_SECRET[entorno]),
  ]);
  return { apiKey, apiSecret };
}

async function leerSecreto(servicio: SupabaseClient, nombre: string): Promise<string> {
  const { data, error } = await servicio.rpc('leer_secreto_vault', { p_nombre: nombre });
  if (error || !data) {
    throw new Error(
      `No se pudo leer el secreto "${nombre}" desde Vault. Sin las claves reales de Binance ` +
        'para este entorno no hay orden que enviar: esta función nunca simula una ejecución.',
    );
  }
  return data as string;
}

interface ResultadoOrden {
  readonly cantidadEjecutada: number;
  readonly precioPromedio: number | null;
  readonly ordenId: number | null;
}

/**
 * Firma y envía la orden de mercado a Binance. El endpoint de Binance exige
 * HMAC-SHA256 sobre el query string completo, con la clave secreta de la
 * cuenta — esto es lo que Binance documenta como requisito de sus
 * endpoints firmados (SIGNED), no una convención propia de esta función.
 */
async function enviarOrdenBinance(params: {
  entorno: Entorno;
  simbolo: string;
  lado: Lado;
  cantidad: number;
  apiKey: string;
  apiSecret: string;
  /** Proxy con IP fija para mainnet (ver comentario del encabezado). null en testnet. */
  proxyUrl: string | null;
}): Promise<ResultadoOrden> {
  const query = new URLSearchParams({
    symbol: params.simbolo,
    side: params.lado === 'compra' ? 'BUY' : 'SELL',
    type: 'MARKET',
    quantity: String(params.cantidad),
    timestamp: String(Date.now()),
    recvWindow: '5000',
  });

  const firma = await firmarHmacSha256(query.toString(), params.apiSecret);
  query.set('signature', firma);

  const url = `${BASE_URL[params.entorno]}/api/v3/order?${query.toString()}`;
  const cliente = params.proxyUrl
    ? Deno.createHttpClient({ proxy: { url: params.proxyUrl } })
    : undefined;
  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'X-MBX-APIKEY': params.apiKey },
    client: cliente,
  });

  const cuerpo = await respuesta.json();
  if (!respuesta.ok) {
    const detalle = cuerpo?.msg ?? `Binance respondió ${respuesta.status}`;
    throw new Error(`Binance rechazó la orden: ${detalle}`);
  }

  const cantidadEjecutada = Number(cuerpo.executedQty ?? 0);
  const cummQuote = Number(cuerpo.cummulativeQuoteQty ?? 0);
  const precioPromedio = cantidadEjecutada > 0 ? cummQuote / cantidadEjecutada : null;

  return {
    cantidadEjecutada,
    precioPromedio,
    ordenId: typeof cuerpo.orderId === 'number' ? cuerpo.orderId : null,
  };
}

async function firmarHmacSha256(mensaje: string, secreto: string): Promise<string> {
  const codificador = new TextEncoder();
  const clave = await crypto.subtle.importKey(
    'raw',
    codificador.encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const firma = await crypto.subtle.sign('HMAC', clave, codificador.encode(mensaje));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
