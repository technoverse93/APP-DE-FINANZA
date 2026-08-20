/**
 * Motor de señales de trading: indicadores técnicos clásicos sobre precios
 * reales, combinados en una alerta de compra/venta con un porcentaje de
 * confianza. Es análisis algorítmico transparente (media móvil + RSI), no
 * una promesa de predicción real — por eso el resultado siempre trae el
 * detalle de qué lo generó. Nunca ejecuta nada: solo devuelve una sugerencia
 * para que la persona decida.
 */

export type Senal = 'compra' | 'venta' | 'mantener';

export interface ResultadoSenal {
  readonly senal: Senal;
  /** Confianza de 0 a 1, derivada de cuánto se alejan los indicadores del punto neutro. */
  readonly probabilidad: number;
  readonly rsi: number;
  readonly smaCorta: number;
  readonly smaLarga: number;
  readonly detalle: string;
}

function assertPrecios(precios: readonly number[], minimo: number): void {
  if (precios.length < minimo) {
    throw new RangeError(`Se necesitan al menos ${minimo} precios, se recibieron ${precios.length}`);
  }
  if (precios.some((p) => !Number.isFinite(p) || p <= 0)) {
    throw new RangeError('Todos los precios deben ser números finitos y positivos');
  }
}

/** Media móvil simple de los últimos `periodo` precios. */
export function sma(precios: readonly number[], periodo: number): number {
  if (periodo <= 0) throw new RangeError('El período debe ser positivo');
  assertPrecios(precios, periodo);
  const ventana = precios.slice(-periodo);
  return ventana.reduce((suma, p) => suma + p, 0) / periodo;
}

/**
 * RSI (Relative Strength Index) de Wilder sobre toda la serie recibida.
 * Devuelve un solo valor (el más reciente), en el rango 0-100.
 *
 * Usa el suavizado de Wilder (media móvil exponencial con factor 1/periodo),
 * el estándar de la industria, no un promedio simple de ganancias/pérdidas.
 */
export function rsi(precios: readonly number[], periodo = 14): number {
  if (periodo <= 0) throw new RangeError('El período debe ser positivo');
  assertPrecios(precios, periodo + 1);

  const cambios = precios.slice(1).map((p, i) => p - precios[i]);
  const primerBloque = cambios.slice(0, periodo);

  let gananciaProm = primerBloque.filter((c) => c > 0).reduce((s, c) => s + c, 0) / periodo;
  let perdidaProm = primerBloque.filter((c) => c < 0).reduce((s, c) => s - c, 0) / periodo;

  for (let i = periodo; i < cambios.length; i++) {
    const cambio = cambios[i];
    const ganancia = cambio > 0 ? cambio : 0;
    const perdida = cambio < 0 ? -cambio : 0;
    gananciaProm = (gananciaProm * (periodo - 1) + ganancia) / periodo;
    perdidaProm = (perdidaProm * (periodo - 1) + perdida) / periodo;
  }

  if (perdidaProm === 0) return gananciaProm === 0 ? 50 : 100;
  const fuerzaRelativa = gananciaProm / perdidaProm;
  return 100 - 100 / (1 + fuerzaRelativa);
}

const RSI_SOBRECOMPRA = 70;
const RSI_SOBREVENTA = 30;

/**
 * Combina cruce de medias móviles (tendencia) con RSI (momentum) en una sola
 * señal. La probabilidad no es una garantía estadística: es qué tan lejos
 * está el RSI del punto neutro (50) más si la tendencia de las medias
 * confirma la misma dirección, acotado a [0, 1].
 */
export function calcularSenal(
  precios: readonly number[],
  opciones: { readonly periodoCorto?: number; readonly periodoLargo?: number; readonly periodoRsi?: number } = {},
): ResultadoSenal {
  const periodoCorto = opciones.periodoCorto ?? 7;
  const periodoLargo = opciones.periodoLargo ?? 21;
  const periodoRsi = opciones.periodoRsi ?? 14;
  assertPrecios(precios, Math.max(periodoLargo, periodoRsi + 1));

  const smaCorta = sma(precios, periodoCorto);
  const smaLarga = sma(precios, periodoLargo);
  const valorRsi = rsi(precios, periodoRsi);

  const tendenciaAlcista = smaCorta > smaLarga;
  const rsiSobrevendido = valorRsi <= RSI_SOBREVENTA;
  const rsiSobrecomprado = valorRsi >= RSI_SOBRECOMPRA;

  // Distancia del RSI al punto neutro, normalizada a [0, 1].
  const fuerzaRsi = Math.abs(valorRsi - 50) / 50;
  // Cuánto se separan las medias entre sí, como fracción de la media larga.
  const fuerzaTendencia = Math.abs(smaCorta - smaLarga) / smaLarga;

  let senal: Senal = 'mantener';
  let probabilidad = fuerzaRsi * 0.5; // base: qué tan extremo está el momentum, aunque no haya acuerdo
  let detalle = `RSI en ${valorRsi.toFixed(1)}, sin señal clara de las medias móviles.`;

  if (rsiSobrevendido && tendenciaAlcista) {
    senal = 'compra';
    probabilidad = Math.min(1, fuerzaRsi + fuerzaTendencia);
    detalle = `RSI sobrevendido (${valorRsi.toFixed(1)}) y la media corta ya cruzó por encima de la larga.`;
  } else if (rsiSobrecomprado && !tendenciaAlcista) {
    senal = 'venta';
    probabilidad = Math.min(1, fuerzaRsi + fuerzaTendencia);
    detalle = `RSI sobrecomprado (${valorRsi.toFixed(1)}) y la media corta ya cruzó por debajo de la larga.`;
  } else if (rsiSobrevendido) {
    senal = 'compra';
    detalle = `RSI sobrevendido (${valorRsi.toFixed(1)}), pero la tendencia de las medias todavía no confirma.`;
  } else if (rsiSobrecomprado) {
    senal = 'venta';
    detalle = `RSI sobrecomprado (${valorRsi.toFixed(1)}), pero la tendencia de las medias todavía no confirma.`;
  }

  return {
    senal,
    probabilidad: Math.max(0, Math.min(1, probabilidad)),
    rsi: valorRsi,
    smaCorta,
    smaLarga,
    detalle,
  };
}
