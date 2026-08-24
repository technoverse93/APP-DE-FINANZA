/**
 * Simulador de escenarios "qué pasaría si".
 *
 * Responde la pregunta que no se puede contestar mirando la pantalla normal:
 * "si en vez de ganar 170.000 por quincena ganara 200.000, ¿cuánto cambia de
 * verdad?". La respuesta no es la diferencia de 30.000, porque la banda de
 * seguridad se lleva una parte antes de que nada llegue a la deuda: el
 * excedente sobre la banda es lo único que acelera el pago, y ese excedente
 * no crece de forma lineal con el ingreso.
 *
 * Todo esto se calcula sobre los motores que ya existen — `distribuirQuincena`
 * decide el reparto y `proyectarTrituradora` amortiza la deuda — así que un
 * escenario simulado y la quincena real pasan exactamente por las mismas
 * reglas. Si fueran dos cálculos distintos, el simulador prometería algo que
 * la app después no cumple.
 *
 * Es deliberadamente puro y sin persistencia: un escenario hipotético no se
 * guarda ni toca ninguna fila. Cambiar el número solo cambia lo que se ve.
 */

import { proyectarTrituradora, type ResultadoTrituradora } from '../debt/crusher';
import { distribuirQuincena, type DistribucionQuincenal, type GastosFijos } from './distribution';
import { calcularIngresoDisponible, INGRESO_BASE_QUINCENAL } from './ingresoDisponible';

/** Los gastos fijos ya vienen restados del ingreso disponible. */
const SIN_GASTOS_FIJOS: GastosFijos = { casa: 0, comida: 0, pases: 0, deudaBase: 0 };

export interface ContextoQuincena {
  /** Ingresos extra ya anotados en el período. */
  readonly ingresosExtra: number;
  readonly transporteProyectado: number;
  readonly gastosDiariosReales: number;
  readonly otrosGastosFijos: number;
}

/** Deuda contra la que se mide la aceleración del escenario. */
export interface DeudaSimulada {
  readonly saldoActual: number;
  /** Tasa nominal MENSUAL, ej. 0.02 para 2% mensual. */
  readonly tasaMensual: number;
  /** Abono por quincena que ya se hace hoy, sin contar el excedente. */
  readonly abonoObjetivo: number;
}

export interface EscenarioSimulado {
  /** Ingreso base usado en este escenario. */
  readonly ingresoBase: number;
  readonly ingresoDisponible: number;
  readonly distribucion: DistribucionQuincenal;
  /**
   * Proyección de la deuda si el excedente sobre la banda se destina
   * íntegro a capital, además del abono objetivo. `null` cuando no se pasó
   * ninguna deuda o cuando no hay abono positivo que proyectar.
   */
  readonly deuda: ResultadoTrituradora | null;
}

export interface ComparacionEscenario {
  readonly base: EscenarioSimulado;
  readonly simulado: EscenarioSimulado;
  /** Cuánto más (o menos) queda disponible en el escenario simulado. */
  readonly diferenciaIngresoDisponible: number;
  /**
   * Cuánto más va a capital. Es la cifra que importa y casi nunca coincide
   * con la diferencia de ingreso: la banda de seguridad absorbe primero.
   */
  readonly diferenciaAbonoCapital: number;
  /** Quincenas que se adelanta el fin de la deuda. Positivo = termina antes. */
  readonly quincenasAhorradas: number | null;
  /** Intereses que se dejan de pagar. Positivo = ahorro. */
  readonly interesAhorrado: number | null;
}

function simular(
  ingresoBase: number,
  contexto: ContextoQuincena,
  deuda: DeudaSimulada | null,
): EscenarioSimulado {
  const ingresoDisponible = calcularIngresoDisponible({
    ingresoBase,
    ingresosExtra: contexto.ingresosExtra,
    transporteProyectado: contexto.transporteProyectado,
    gastosDiariosReales: contexto.gastosDiariosReales,
    otrosGastosFijos: contexto.otrosGastosFijos,
  });

  const distribucion = distribuirQuincena({
    colilla: ingresoDisponible,
    gastosFijos: SIN_GASTOS_FIJOS,
  });

  let proyeccion: ResultadoTrituradora | null = null;
  if (deuda && deuda.saldoActual > 0) {
    // El excedente sobre la banda es lo único realmente libre: la reserva
    // tiene que quedar intacta para la quincena siguiente.
    const abonoTotal = deuda.abonoObjetivo + distribucion.abonoCapitalSugerido;
    if (abonoTotal > 0) {
      proyeccion = proyectarTrituradora({
        saldoInicial: deuda.saldoActual,
        tasaMensualNominal: deuda.tasaMensual,
        abonoPorPeriodo: abonoTotal,
      });
    }
  }

  return { ingresoBase, ingresoDisponible, distribucion, deuda: proyeccion };
}

export interface ParametrosComparacionEscenario {
  /** Ingreso base real de la quincena. Por defecto, el fijo de 170.000. */
  readonly ingresoBaseReal?: number;
  /** Ingreso base hipotético a evaluar. */
  readonly ingresoBaseSimulado: number;
  readonly contexto: ContextoQuincena;
  readonly deuda?: DeudaSimulada | null;
}

/**
 * Compara la quincena real contra una hipotética con otro ingreso base.
 *
 * @throws {TypeError} si el ingreso simulado no es un número finito.
 * @throws {RangeError} si el ingreso simulado es negativo.
 */
export function compararEscenarioIngreso({
  ingresoBaseReal = INGRESO_BASE_QUINCENAL,
  ingresoBaseSimulado,
  contexto,
  deuda = null,
}: ParametrosComparacionEscenario): ComparacionEscenario {
  if (typeof ingresoBaseSimulado !== 'number' || !Number.isFinite(ingresoBaseSimulado)) {
    throw new TypeError('El ingreso simulado debe ser un número finito');
  }
  if (ingresoBaseSimulado < 0) {
    throw new RangeError('El ingreso simulado no puede ser negativo');
  }

  const base = simular(ingresoBaseReal, contexto, deuda);
  const simulado = simular(ingresoBaseSimulado, contexto, deuda);

  // Solo tiene sentido comparar plazos si AMBOS escenarios llegan a saldar la
  // deuda. Si uno de los dos se corta en el tope de períodos sin saldarla,
  // restar sus períodos daría un "ahorro" inventado a partir de un número que
  // en realidad significa "no termina".
  const ambosSaldan = Boolean(base.deuda?.saldado && simulado.deuda?.saldado);

  return {
    base,
    simulado,
    diferenciaIngresoDisponible: simulado.ingresoDisponible - base.ingresoDisponible,
    diferenciaAbonoCapital:
      simulado.distribucion.abonoCapitalSugerido - base.distribucion.abonoCapitalSugerido,
    quincenasAhorradas: ambosSaldan
      ? base.deuda!.periodosParaSaldar - simulado.deuda!.periodosParaSaldar
      : null,
    interesAhorrado: ambosSaldan
      ? base.deuda!.totalInteresPagado - simulado.deuda!.totalInteresPagado
      : null,
  };
}
