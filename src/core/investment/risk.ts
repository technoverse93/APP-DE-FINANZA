/**
 * Métricas de riesgo calculadas exclusivamente sobre precios reales.
 *
 * Ninguna función acá inventa ni rellena datos de mercado: todas reciben la
 * serie de precios ya obtenida de la API financiera (ver
 * `supabase/functions/market-data`) y solo hacen aritmética sobre eso. Si la
 * serie está vacía o incompleta, se lanza en vez de devolver un número
 * inventado — la pantalla de inversión debe mostrar "sin datos", nunca un
 * riesgo o rendimiento ficticio.
 */

export type NivelRiesgo = 'bajo' | 'medio' | 'alto';

/** Retorno simple entre cada par de precios consecutivos: (p_t - p_{t-1}) / p_{t-1}. */
export function retornosDesdesPrecios(precios: readonly number[]): number[] {
  if (precios.length < 2) {
    throw new RangeError('Se necesitan al menos dos precios para calcular retornos');
  }
  if (precios.some((p) => p <= 0)) {
    throw new RangeError('Los precios deben ser positivos');
  }
  const retornos: number[] = [];
  for (let i = 1; i < precios.length; i++) {
    retornos.push((precios[i] - precios[i - 1]) / precios[i - 1]);
  }
  return retornos;
}

function media(valores: readonly number[]): number {
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

/** Desviación estándar muestral (n-1) de los retornos. */
export function desviacionEstandar(retornos: readonly number[]): number {
  if (retornos.length < 2) {
    throw new RangeError('Se necesitan al menos dos retornos para la desviación estándar');
  }
  const m = media(retornos);
  const sumaCuadrados = retornos.reduce((acc, r) => acc + (r - m) ** 2, 0);
  return Math.sqrt(sumaCuadrados / (retornos.length - 1));
}

/**
 * Volatilidad anualizada: desviación estándar de los retornos por periodo,
 * escalada por `sqrt(periodosPorAnio)` — la regla estándar para anualizar
 * volatilidad bajo el supuesto de retornos independientes.
 */
export function volatilidadAnualizada(
  retornos: readonly number[],
  periodosPorAnio: number,
): number {
  return desviacionEstandar(retornos) * Math.sqrt(periodosPorAnio);
}

/** Máxima caída porcentual desde un pico hasta el valle posterior más bajo. */
export function caidaMaxima(precios: readonly number[]): number {
  if (precios.length < 2) {
    throw new RangeError('Se necesitan al menos dos precios para la caída máxima');
  }
  let pico = precios[0];
  let peorCaida = 0;
  for (const precio of precios) {
    if (precio > pico) pico = precio;
    const caida = (precio - pico) / pico;
    if (caida < peorCaida) peorCaida = caida;
  }
  return peorCaida;
}

/**
 * Rendimiento promedio anualizado a partir de retornos periódicos:
 * `(1 + media)^periodosPorAnio - 1`.
 */
export function rendimientoAnualizado(
  retornos: readonly number[],
  periodosPorAnio: number,
): number {
  return Math.pow(1 + media(retornos), periodosPorAnio) - 1;
}

/**
 * Bandas de volatilidad anualizada para clasificar el riesgo. Los cortes
 * (15% / 25%) siguen la volatilidad histórica típica de un índice amplio
 * como el S&P 500 (~15-20%) como referencia de "riesgo medio"; por debajo es
 * más conservador que el mercado amplio, por encima es más concentrado o
 * volátil que un índice diversificado.
 */
const UMBRAL_RIESGO_BAJO = 0.15;
const UMBRAL_RIESGO_ALTO = 0.25;

export function clasificarRiesgo(volatilidadAnual: number): NivelRiesgo {
  if (volatilidadAnual < UMBRAL_RIESGO_BAJO) return 'bajo';
  if (volatilidadAnual < UMBRAL_RIESGO_ALTO) return 'medio';
  return 'alto';
}
