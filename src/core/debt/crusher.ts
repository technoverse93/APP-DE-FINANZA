/**
 * Trituradora de deudas: amortización quincenal y ahorro de intereses.
 *
 * El calendario de pagos (13 y 28, adelantado a viernes) y la resta de
 * gastos fijos contra el ingreso base ya existen en `core/payroll` — este
 * módulo no los repite. Lo que faltaba es el modelo de deuda en sí: saldo
 * más tasa de interés, proyectado período a período, para poder comparar
 * "qué pasa si abono más" contra el escenario base.
 *
 * La tasa se maneja en términos MENSUALES, no anuales: es como viene
 * publicada en un estado de cuenta costarricense ("2% mensual sobre saldos"),
 * así que pedirla anual obligaba a multiplicar por 12 antes de escribirla, un
 * paso extra que además invita a errores de dedo.
 */

import { avanzarNPeriodos } from '../payroll/schedule';
import { formatearColones } from '../payroll/distribution';

/** Períodos de pago al mes con el calendario de 13 y 28: siempre dos. */
export const PERIODOS_POR_MES_POR_DEFECTO = 2;

/** Tope de seguridad: si el abono no alcanza a cubrir el interés, la deuda
 * nunca se salda y hay que cortar la proyección en vez de iterar para siempre. */
export const MAX_PERIODOS_POR_DEFECTO = 240; // 10 años a razón quincenal

export interface ParametrosTrituradora {
  readonly saldoInicial: number;
  /** Tasa nominal MENSUAL, ej. 0.02 para 2% mensual. */
  readonly tasaMensualNominal: number;
  /** Pago periódico total (interés + capital). */
  readonly abonoPorPeriodo: number;
  readonly periodosPorMes?: number;
  readonly maxPeriodos?: number;
}

export interface PeriodoTrituradora {
  readonly periodo: number;
  readonly saldoInicial: number;
  readonly interes: number;
  /** Puede ser negativo: significa que el abono no cubrió ni el interés. */
  readonly abonoCapital: number;
  readonly saldoFinal: number;
}

export interface ResultadoTrituradora {
  readonly periodos: readonly PeriodoTrituradora[];
  readonly totalInteresPagado: number;
  readonly totalAbonado: number;
  readonly periodosParaSaldar: number;
  /** false si llegó al tope de períodos sin llegar a saldo cero. */
  readonly saldado: boolean;
}

function assertParametrosValidos(p: ParametrosTrituradora): void {
  const campos: [string, number][] = [
    ['saldoInicial', p.saldoInicial],
    ['tasaMensualNominal', p.tasaMensualNominal],
    ['abonoPorPeriodo', p.abonoPorPeriodo],
  ];
  for (const [nombre, valor] of campos) {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      throw new TypeError(`${nombre} debe ser un número finito`);
    }
  }
  if (p.saldoInicial < 0) throw new RangeError('El saldo inicial no puede ser negativo');
  if (p.tasaMensualNominal < 0) throw new RangeError('La tasa mensual no puede ser negativa');
  if (p.abonoPorPeriodo <= 0) {
    throw new RangeError('El abono por período debe ser positivo');
  }
  if (p.periodosPorMes !== undefined && p.periodosPorMes <= 0) {
    throw new RangeError('periodosPorMes debe ser positivo');
  }
  if (p.maxPeriodos !== undefined && p.maxPeriodos <= 0) {
    throw new RangeError('maxPeriodos debe ser positivo');
  }
}

/** Los colones no se manejan en fracciones: se redondea a la unidad. */
function aColones(valor: number): number {
  return Math.round(valor);
}

/**
 * Proyecta la deuda período a período hasta saldarla o hasta el tope de
 * seguridad. Modela la amortización negativa de verdad: si el abono no cubre
 * el interés del período, el saldo crece en vez de congelarse, porque eso es
 * lo que pasa en la realidad y es exactamente la señal de alerta que importa
 * mostrar ("este abono no alcanza, la deuda va a crecer").
 */
export function proyectarTrituradora(parametros: ParametrosTrituradora): ResultadoTrituradora {
  assertParametrosValidos(parametros);
  const periodosPorMes = parametros.periodosPorMes ?? PERIODOS_POR_MES_POR_DEFECTO;
  const maxPeriodos = parametros.maxPeriodos ?? MAX_PERIODOS_POR_DEFECTO;
  const tasaPorPeriodo = parametros.tasaMensualNominal / periodosPorMes;

  const periodos: PeriodoTrituradora[] = [];
  let saldo = parametros.saldoInicial;
  let totalInteres = 0;
  let totalAbonado = 0;
  let numero = 0;

  while (saldo > 0 && numero < maxPeriodos) {
    numero += 1;
    const saldoInicioPeriodo = saldo;
    const interes = aColones(saldoInicioPeriodo * tasaPorPeriodo);
    // El abono nunca amortiza más capital del que queda pendiente.
    const abonoCapital = Math.min(
      aColones(parametros.abonoPorPeriodo) - interes,
      saldoInicioPeriodo,
    );
    const saldoFinal = Math.max(0, aColones(saldoInicioPeriodo - abonoCapital));
    // El abono realmente aplicado en el último período puede ser menor al
    // nominal si alcanzaba para saldar y sobraba.
    const abonoAplicado = interes + (saldoInicioPeriodo - saldoFinal);

    periodos.push({
      periodo: numero,
      saldoInicial: saldoInicioPeriodo,
      interes,
      abonoCapital: saldoInicioPeriodo - saldoFinal,
      saldoFinal,
    });

    totalInteres += interes;
    totalAbonado += abonoAplicado;
    saldo = saldoFinal;
  }

  return {
    periodos,
    totalInteresPagado: aColones(totalInteres),
    totalAbonado: aColones(totalAbonado),
    periodosParaSaldar: numero,
    saldado: saldo === 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Priorización entre varias deudas (método avalancha)                        */
/* -------------------------------------------------------------------------- */

export class RemanenteInsuficienteError extends Error {
  constructor() {
    super('No hay abono extra disponible para repartir entre las deudas');
    this.name = 'RemanenteInsuficienteError';
  }
}

export interface DeudaParaPriorizar {
  readonly id: string;
  readonly saldoActual: number;
  readonly tasaMensual: number;
  readonly abonoObjetivo: number;
}

export interface AsignacionAbono {
  readonly deudaId: string;
  /** Abono objetivo más lo que le tocó del extra, ya redondeado a colones. */
  readonly abonoTotal: number;
  readonly abonoExtraAsignado: number;
}

/**
 * Reparte un abono extra entre varias deudas por el método de "avalancha":
 * todo el extra va primero a la deuda de mayor tasa de interés (es
 * matemáticamente el uso de mayor impacto de cualquier colón adicional),
 * hasta saldarla; lo que sobra se vuelca a la siguiente de mayor tasa, y así
 * sucesivamente. Cada deuda sigue recibiendo su `abonoObjetivo` de base,
 * este reparto es solo sobre el excedente.
 *
 * @throws {RemanenteInsuficienteError} si no hay abono extra que repartir.
 */
export function priorizarAbonoExtra(
  abonoExtraDisponible: number,
  deudas: readonly DeudaParaPriorizar[],
): readonly AsignacionAbono[] {
  if (!Number.isFinite(abonoExtraDisponible) || abonoExtraDisponible <= 0) {
    throw new RemanenteInsuficienteError();
  }

  const ordenadas = [...deudas].sort((a, b) => b.tasaMensual - a.tasaMensual);
  let restante = abonoExtraDisponible;

  return ordenadas.map((deuda) => {
    const extra = Math.max(0, Math.min(restante, deuda.saldoActual));
    restante -= extra;
    return {
      deudaId: deuda.id,
      abonoTotal: aColones(deuda.abonoObjetivo + extra),
      abonoExtraAsignado: aColones(extra),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Proyección dirigida por remanente libre (sin cuota mínima fija)            */
/* -------------------------------------------------------------------------- */

export interface ProyeccionPorPorcentaje {
  readonly porcentaje: number;
  readonly abonoPorPeriodo: number;
  readonly resultado: ResultadoTrituradora;
  readonly fechaSaldoCero: Date | null;
}

/**
 * Proyecta la deuda cuando el abono por período NO es una cuota fija
 * predefinida, sino un porcentaje del remanente libre real de la quincena
 * (lo que sobra por encima de la banda de seguridad, ver
 * `core/payroll/distribution.ts`). Es el modelo "qué pasa si destino el 50%
 * de mi remanente a esta deuda", que se recalcula solo cuando cambia el
 * remanente real o el porcentaje elegido — no hay ningún mínimo mensual
 * grabado en la deuda que este cálculo tenga que respetar.
 *
 * Un remanente libre de cero o negativo (la quincena está ajustada o en
 * déficit) no tiene nada que asignar: se devuelve sin proyección en vez de
 * forzar `proyectarTrituradora` con un abono de cero, que lanzaría un error
 * en vez de decir con claridad "hoy no hay remanente".
 */
export function proyectarPorPorcentajeRemanente(
  saldoInicial: number,
  tasaMensualNominal: number,
  remanenteLibre: number,
  porcentaje: number,
  fechaInicio: Date,
): ProyeccionPorPorcentaje | null {
  if (!Number.isFinite(porcentaje) || porcentaje <= 0) return null;
  const abonoPorPeriodo = aColones(Math.max(0, remanenteLibre) * (porcentaje / 100));
  if (abonoPorPeriodo <= 0) return null;

  const resultado = proyectarTrituradora({ saldoInicial, tasaMensualNominal, abonoPorPeriodo });
  return {
    porcentaje,
    abonoPorPeriodo,
    resultado,
    fechaSaldoCero: resultado.saldado
      ? avanzarNPeriodos(fechaInicio, resultado.periodosParaSaldar)
      : null,
  };
}
