/**
 * Interés compuesto con aportes periódicos.
 *
 * La tasa esperada SIEMPRE la calcula el llamador a partir de retornos reales
 * ya obtenidos de la API de mercado (ver `risk.ts`) — este módulo no trae
 * ningún valor por defecto ni supuesto de rendimiento histórico embebido,
 * porque cualquier número fijo acá terminaría usándose como si fuera un dato
 * de mercado real.
 */

export interface ProyeccionInput {
  /** Capital ya invertido, en colones. */
  readonly principalInicial: number;
  /** Aporte que se repite cada periodo (p. ej. cada quincena), en colones. */
  readonly aportePeriodico: number;
  /** Tasa de rendimiento anual esperada, como fracción (0.08 = 8%). */
  readonly tasaAnualEsperada: number;
  /** Cuántos periodos de aporte hay en un año (24 para quincenal). */
  readonly periodosPorAnio: number;
  /** Cuántos periodos hacia adelante se proyectan. */
  readonly numPeriodos: number;
}

export interface Proyeccion {
  readonly valorFinal: number;
  readonly totalAportado: number;
  readonly totalGanancia: number;
  /** Saldo proyectado al final de cada periodo, incluyendo el periodo 0 (el principal). */
  readonly serie: readonly number[];
}

/**
 * Convierte una tasa anual a la tasa equivalente de un periodo más corto,
 * compuesta correctamente: `(1+anual)^(1/n) - 1`, no `anual/n`. Dividir la
 * tasa anual entre los periodos subestima el efecto compuesto real.
 */
export function tasaPorPeriodo(tasaAnual: number, periodosPorAnio: number): number {
  if (periodosPorAnio <= 0) throw new RangeError('periodosPorAnio debe ser positivo');
  return Math.pow(1 + tasaAnual, 1 / periodosPorAnio) - 1;
}

/**
 * Proyecta el saldo con aportes al final de cada periodo (anualidad
 * ordinaria): `FV = P(1+r)^n + C·[((1+r)^n - 1) / r]`.
 */
export function proyectarInteresCompuesto(input: ProyeccionInput): Proyeccion {
  const { principalInicial, aportePeriodico, tasaAnualEsperada, periodosPorAnio, numPeriodos } =
    input;

  for (const [nombre, valor] of Object.entries({ principalInicial, aportePeriodico })) {
    if (!Number.isFinite(valor) || valor < 0) {
      throw new RangeError(`${nombre} debe ser un número finito no negativo`);
    }
  }
  if (!Number.isFinite(tasaAnualEsperada)) {
    throw new TypeError('tasaAnualEsperada debe ser un número finito');
  }
  if (!Number.isInteger(numPeriodos) || numPeriodos < 0) {
    throw new RangeError('numPeriodos debe ser un entero no negativo');
  }

  const r = tasaPorPeriodo(tasaAnualEsperada, periodosPorAnio);
  const serie: number[] = [principalInicial];
  let saldo = principalInicial;
  for (let i = 0; i < numPeriodos; i++) {
    saldo = saldo * (1 + r) + aportePeriodico;
    serie.push(saldo);
  }

  const totalAportado = principalInicial + aportePeriodico * numPeriodos;
  return {
    valorFinal: saldo,
    totalAportado,
    totalGanancia: saldo - totalAportado,
    serie,
  };
}
