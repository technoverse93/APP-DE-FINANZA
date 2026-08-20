/**
 * Edge Function `market-data`.
 *
 * Trae cierres diarios reales desde Alpha Vantage y los guarda en
 * `market_quotes`. La clave de la API vive en Supabase Vault y nunca llega al
 * teléfono: el cliente solo lee la tabla ya cacheada, nunca llama a Alpha
 * Vantage directamente.
 *
 * Usa SPY (el ETF que replica el S&P 500) en vez de un ticker de índice
 * porque el endpoint gratuito de Alpha Vantage no expone `^GSPC` de forma
 * confiable; SPY sigue al S&P 500 casi 1:1 y es el proxy estándar de la
 * industria para "el S&P 500" cuando se necesita un instrumento cotizable.
 *
 * La ejecuta pg_cron cada 4 horas (ver la migración 0004), respetando el
 * límite de 25 llamadas/día del tier gratuito de Alpha Vantage.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const TICKER_POR_DEFECTO = 'SPY';
const FUENTE = 'alpha_vantage';

interface PeticionMarketData {
  readonly ticker?: string;
}

interface CierreDiario {
  readonly fecha: string;
  readonly cierre: number;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return json({ error: 'Se espera POST' }, 405);
  }

  const peticion: PeticionMarketData = await req.json().catch(() => ({}));
  const ticker = (peticion.ticker ?? TICKER_POR_DEFECTO).toUpperCase();

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: corrida } = await supabase
    .from('market_data_runs')
    .insert({ ticker })
    .select('id')
    .single();

  try {
    const apiKey = await leerClaveAlphaVantage(supabase);
    const cierres = await traerCierresDiarios(ticker, apiKey);

    const filas = cierres.map((c) => ({
      ticker,
      fecha: c.fecha,
      cierre: c.cierre,
      fuente: FUENTE,
    }));

    const { error: errorUpsert } = await supabase
      .from('market_quotes')
      .upsert(filas, { onConflict: 'ticker,fecha', ignoreDuplicates: true });
    if (errorUpsert) throw new Error(errorUpsert.message);

    await cerrarCorrida(supabase, corrida?.id, { cotizaciones: filas.length });
    return json({ ticker, cotizaciones: filas.length });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await cerrarCorrida(supabase, corrida?.id, { cotizaciones: 0, error: mensaje });
    return json({ error: mensaje }, 502);
  }
});

/**
 * Lee el secreto vía RPC a `public.leer_secreto_vault` (migración 0006), no
 * con `.schema('vault').from('decrypted_secrets')`: PostgREST no expone el
 * schema `vault` por la API, ni siquiera con la service role key, así que esa
 * consulta directa siempre falla en runtime aunque el secreto exista.
 */
async function leerClaveAlphaVantage(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('leer_secreto_vault', {
    p_nombre: 'alpha_vantage_api_key',
  });

  if (error || !data) {
    throw new Error(
      'No se pudo leer el secreto "alpha_vantage_api_key" desde Vault. Sin una clave real de ' +
        'Alpha Vantage no hay datos que traer: esta función nunca genera un cierre de reemplazo.',
    );
  }
  return data as string;
}

/**
 * Pide los cierres diarios reales a Alpha Vantage. `outputsize=compact` trae
 * los últimos ~100 días hábiles, suficiente para calcular volatilidad y
 * rendimiento anualizado sin acercarse al límite de payload.
 */
async function traerCierresDiarios(ticker: string, apiKey: string): Promise<CierreDiario[]> {
  const url = new URL('https://www.alphavantage.co/query');
  url.searchParams.set('function', 'TIME_SERIES_DAILY');
  url.searchParams.set('symbol', ticker);
  url.searchParams.set('outputsize', 'compact');
  url.searchParams.set('apikey', apiKey);

  const respuesta = await fetch(url);
  if (!respuesta.ok) {
    throw new Error(`Alpha Vantage respondió ${respuesta.status}`);
  }

  const cuerpo = await respuesta.json();

  // Alpha Vantage devuelve HTTP 200 incluso cuando rechaza la petición: el
  // límite de tasa o una clave inválida vienen como texto en "Note" o
  // "Information", no como un código de error HTTP. Sin esta comprobación,
  // esas respuestas se leerían como "0 cotizaciones nuevas" en silencio.
  if (cuerpo['Note'] || cuerpo['Information'] || cuerpo['Error Message']) {
    const detalle = cuerpo['Note'] ?? cuerpo['Information'] ?? cuerpo['Error Message'];
    throw new Error(`Alpha Vantage rechazó la petición: ${detalle}`);
  }

  const serie = cuerpo['Time Series (Daily)'] as Record<string, Record<string, string>> | undefined;
  if (!serie || Object.keys(serie).length === 0) {
    throw new Error('Alpha Vantage no devolvió una serie de precios reconocible');
  }

  return Object.entries(serie)
    .map(([fecha, valores]) => ({
      fecha,
      cierre: Number(valores['4. close']),
    }))
    .filter((c) => Number.isFinite(c.cierre) && c.cierre > 0);
}

async function cerrarCorrida(
  supabase: SupabaseClient,
  corridaId: string | undefined,
  resultado: { cotizaciones: number; error?: string },
): Promise<void> {
  if (!corridaId) return;
  await supabase
    .from('market_data_runs')
    .update({
      terminada_en: new Date().toISOString(),
      cotizaciones: resultado.cotizaciones,
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
