/**
 * Trituradora de deudas: amortización quincenal y ahorro de intereses.
 *
 * El calendario de pagos (13 y 28, adelantado a viernes) y la resta de
 * gastos fijos contra el ingreso base ya existen en `core/payroll` — este
 * módulo no los repite. Lo que faltaba es el modelo de deuda en sí: saldo
 * más tasa de interés, proyectado período a período, para poder comparar
 * "qué pasa si abono más" contra el escenario base.
 */

import { avanzarNPeriodos } from '../payroll/schedule';
import { formatearColones } from '../payroll/distribution';

/** Períodos de pago al año con el calendario de 13 y 28 (2 por mes). */
export const PERIODOS_POR_ANIO_POR_DEFECTO = 24;

/** Tope de seguridad: si el abono no alcanza a cubrir el interés, la deuda
 * nunca se salda y hay que cortar la proyección en vez de iterar para siempre. */
export const MAX_PERIODOS_POR_DEFECTO = 240; // 10 años a razón quincenal

export interface ParametrosTrituradora {
  readonly saldoInicial: number;
  /** Tasa nominal anual, ej. 0.24 para 24% anual. */
  readonly tasaAnualNominal: number;
  /** Pago periódico total (interés + capital). */
  readonly abonoPorPeriodo: number;
  readonly periodosPorAnio?: number;
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
    ['tasaAnualNominal', p.tasaAnualNominal],
    ['abonoPorPeriodo', p.abonoPorPeriodo],
  ];
  for (const [nombre, valor] of campos) {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      throw new TypeError(`${nombre} debe ser un número finito`);
    }
  }
  if (p.saldoInicial < 0) throw new RangeError('El saldo inicial no puede ser negativo');
  if (p.tasaAnualNominal < 0) throw new RangeError('La tasa anual no puede ser negativa');
  if (p.abonoPorPeriodo <= 0) {
    throw new RangeError('El abono por período debe ser positivo');
  }
  if (p.periodosPorAnio !== undefined && p.periodosPorAnio <= 0) {
    throw new RangeError('periodosPorAnio debe ser positivo');
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
  const periodosPorAnio = parametros.periodosPorAnio ?? PERIODOS_POR_ANIO_POR_DEFECTO;
  const maxPeriodos = parametros.maxPeriodos ?? MAX_PERIODOS_POR_DEFECTO;
  const tasaPorPeriodo = parametros.tasaAnualNominal / periodosPorAnio;

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

export interface ParametrosComparacion {
  readonly saldoInicial: number;
  readonly tasaAnualNominal: number;
  readonly abonoBase: number;
  readonly abonoExtra: number;
  readonly periodosPorAnio?: number;
  readonly maxPeriodos?: number;
}

export interface ComparacionEscenarios {
  readonly base: ResultadoTrituradora;
  readonly conExtra: ResultadoTrituradora;
  /** Positivo si el abono extra ahorra intereses frente al escenario base. */
  readonly interesAhorrado: number;
  /** Positivo si el abono extra salda la deuda en menos períodos. */
  readonly periodosAhorrados: number;
}

/**
 * Compara el escenario de abono normal contra sumarle un abono extra, para
 * responder la pregunta que importa: "¿cuánto interés me ahorro y cuánto
 * antes termino si abono de más?"
 */
export function compararEscenarios(parametros: ParametrosComparacion): ComparacionEscenarios {
  const base = proyectarTrituradora({
    saldoInicial: parametros.saldoInicial,
    tasaAnualNominal: parametros.tasaAnualNominal,
    abonoPorPeriodo: parametros.abonoBase,
    periodosPorAnio: parametros.periodosPorAnio,
    maxPeriodos: parametros.maxPeriodos,
  });
  const conExtra = proyectarTrituradora({
    saldoInicial: parametros.saldoInicial,
    tasaAnualNominal: parametros.tasaAnualNominal,
    abonoPorPeriodo: parametros.abonoBase + parametros.abonoExtra,
    periodosPorAnio: parametros.periodosPorAnio,
    maxPeriodos: parametros.maxPeriodos,
  });

  return {
    base,
    conExtra,
    interesAhorrado: base.totalInteresPagado - conExtra.totalInteresPagado,
    periodosAhorrados: base.periodosParaSaldar - conExtra.periodosParaSaldar,
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
  readonly tasaAnual: number;
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

  const ordenadas = [...deudas].sort((a, b) => b.tasaAnual - a.tasaAnual);
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
/* Proyección con fecha real y mensaje de progreso                            */
/* -------------------------------------------------------------------------- */

export interface ProyeccionGamificada {
  readonly comparacion: ComparacionEscenarios;
  /** Fecha real del pago en que queda saldada, o null si no se saldó dentro
   * del tope de períodos (proyectar una fecha ahí sería una falsa precisión). */
  readonly fechaSaldoBase: Date | null;
  readonly fechaSaldoConExtra: Date | null;
  readonly mensaje: string;
}

function construirMensajeGamificado(periodosAhorrados: number, interesAhorrado: number): string {
  if (periodosAhorrados <= 0) {
    return 'Este abono extra no adelanta la fecha en que quedás libre de esta deuda.';
  }
  const meses = periodosAhorrados / 2;
  const textoMeses = Number.isInteger(meses) ? String(meses) : meses.toFixed(1);
  return (
    `Aceleraste tu libertad financiera en ${periodosAhorrados} quincenas (~${textoMeses} meses) ` +
    `y te ahorrás ${formatearColones(interesAhorrado)} en intereses.`
  );
}

/**
 * Envuelve `compararEscenarios` con la fecha calendario real de cada
 * escenario (reusando el calendario 13/28 de `core/payroll/schedule`, no una
 * aproximación en meses) y un mensaje dinámico para la pantalla.
 */
export function proyectarConGamificacion(
  parametros: ParametrosComparacion,
  fechaInicio: Date,
): ProyeccionGamificada {
  const comparacion = compararEscenarios(parametros);
  return {
    comparacion,
    fechaSaldoBase: comparacion.base.saldado
      ? avanzarNPeriodos(fechaInicio, comparacion.base.periodosParaSaldar)
      : null,
    fechaSaldoConExtra: comparacion.conExtra.saldado
      ? avanzarNPeriodos(fechaInicio, comparacion.conExtra.periodosParaSaldar)
      : null,
    mensaje: construirMensajeGamificado(comparacion.periodosAhorrados, comparacion.interesAhorrado),
  };
}
