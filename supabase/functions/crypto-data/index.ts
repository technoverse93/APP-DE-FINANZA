/**
 * Edge Function `crypto-data`.
 *
 * Trae velas OHLC reales desde la API pública de CoinGecko (sin API key, sin
 * suscripción — exactamente lo que pedía el requerimiento) y las guarda en
 * `crypto_precios`. El cliente nunca llama a CoinGecko directamente, solo lee
 * la tabla ya cacheada, igual que con las acciones en `market-data`.
 *
 * La ejecuta pg_cron cada 15 minutos (ver la migración 0010): el cripto
 * cotiza 24/7, así que amerita un refresco más frecuente que las acciones.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MONEDA_POR_DEFECTO = 'bitcoin';
const FUENTE = 'coingecko';
/** Días de historia por vela que pide CoinGecko en /ohlc; a 30 días la API
 * pública devuelve velas de 4 horas, suficiente historial para RSI/medias. */
const DIAS_HISTORIA = 30;

interface PeticionCryptoData {
  readonly moneda?: string;
}

interface VelaOhlc {
  readonly momento: string;
  readonly apertura: number;
  readonly maximo: number;
  readonly minimo: number;
  readonly cierre: number;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return json({ error: 'Se espera POST' }, 405);
  }

  const peticion: PeticionCryptoData = await req.json().catch(() => ({}));
  const moneda = (peticion.moneda ?? MONEDA_POR_DEFECTO).toLowerCase();

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: corrida } = await supabase
    .from('crypto_data_runs')
    .insert({ moneda })
    .select('id')
    .single();

  try {
    const velas = await traerVelasOhlc(moneda);

    const filas = velas.map((v) => ({
      moneda,
      momento: v.momento,
      apertura: v.apertura,
      maximo: v.maximo,
      minimo: v.minimo,
      cierre: v.cierre,
      fuente: FUENTE,
    }));

    const { error: errorUpsert } = await supabase
      .from('crypto_precios')
      .upsert(filas, { onConflict: 'moneda,momento', ignoreDuplicates: true });
    if (errorUpsert) throw new Error(errorUpsert.message);

    await cerrarCorrida(supabase, corrida?.id, { velas: filas.length });
    return json({ moneda, velas: filas.length });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await cerrarCorrida(supabase, corrida?.id, { velas: 0, error: mensaje });
    return json({ error: mensaje }, 502);
  }
});

/**
 * Pide velas OHLC reales a CoinGecko. El endpoint público no exige API key;
 * a diferencia de Alpha Vantage, sí devuelve códigos de error HTTP normales
 * (429 al pasar el límite de tasa, 404 si la moneda no existe), así que basta
 * con revisar `response.ok`.
 */
async function traerVelasOhlc(moneda: string): Promise<VelaOhlc[]> {
  const url = new URL(`https://api.coingecko.com/api/v3/coins/${moneda}/ohlc`);
  url.searchParams.set('vs_currency', 'usd');
  url.searchParams.set('days', String(DIAS_HISTORIA));

  const respuesta = await fetch(url);
  if (!respuesta.ok) {
    throw new Error(`CoinGecko respondió ${respuesta.status} para la moneda "${moneda}"`);
  }

  const cuerpo = await respuesta.json();
  if (!Array.isArray(cuerpo) || cuerpo.length === 0) {
    throw new Error('CoinGecko no devolvió velas reconocibles');
  }

  return cuerpo
    .map((vela: unknown) => {
      if (!Array.isArray(vela) || vela.length < 5) return null;
      const [marcaTiempo, apertura, maximo, minimo, cierre] = vela as number[];
      return {
        momento: new Date(marcaTiempo).toISOString(),
        apertura,
        maximo,
        minimo,
        cierre,
      };
    })
    .filter(
      (v): v is VelaOhlc =>
        v !== null &&
        [v.apertura, v.maximo, v.minimo, v.cierre].every((n) => Number.isFinite(n) && n > 0),
    );
}

async function cerrarCorrida(
  supabase: SupabaseClient,
  corridaId: string | undefined,
  resultado: { velas: number; error?: string },
): Promise<void> {
  if (!corridaId) return;
  await supabase
    .from('crypto_data_runs')
    .update({
      terminada_en: new Date().toISOString(),
      velas: resultado.velas,
      error: resultado.error ?? null,
    })
    .eq('id', corridaId);
}

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
