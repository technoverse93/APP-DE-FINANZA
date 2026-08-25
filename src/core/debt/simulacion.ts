/**
 * Simulador de abono al capital.
 *
 * La Trituradora (`crusher.ts`) ya sabe proyectar UNA deuda bajo UN abono.
 * Lo que faltaba es la comparación: cuánto cambia el desenlace si además del
 * pago de siempre se le vuelca parte del remanente libre. Esa diferencia —
 * "esto te ahorra 6 quincenas y ₡48.000 de intereses" — es la única cifra que
 * de verdad justifica destinar el excedente a la deuda en vez de gastarlo, y
 * calcularla exige proyectar DOS escenarios y restarlos, no uno solo.
 *
 * El escenario base no es "no pagar nada": es lo que ya va a pasar sin hacer
 * nada distinto, o sea la cuota fija pactada. Para una deuda sin cuota (un
 * alquiler atrasado que solo acumula mora) el base sí es "no abonar nada", y
 * ahí la comparación no es contra un plazo finito sino contra una deuda que
 * crece sola — por eso `baseSeSalda` se reporta aparte en vez de devolver un
 * ahorro de plazo que no significaría nada.
 */

import { proyectarTrituradora, PERIODOS_POR_MES_POR_DEFECTO } from './crusher';
import type { ResultadoTrituradora } from './crusher';

/** Días que se le asignan a un mes para prorratear una tasa mensual. */
export const DIAS_POR_MES = 30;

/** Los colones no se manejan en fracciones: se redondea a la unidad. */
function aColones(valor: number): number {
  return Math.round(valor);
}

/**
 * Interés que corre en UN día sobre el saldo.
 *
 * Para las deudas marcadas como de mora diaria es la cifra que hace tangible
 * el costo de posponer: no "2% mensual" en abstracto, sino lo que cuesta
 * dejarla parada un día más.
 */
export function interesDiario(saldoActual: number, tasaMensualNominal: number): number {
  if (saldoActual <= 0 || tasaMensualNominal <= 0) return 0;
  return aColones((saldoActual * tasaMensualNominal) / DIAS_POR_MES);
}

export interface EscenarioSimulado {
  /** Abono total por quincena en este escenario. */
  readonly abonoPorPeriodo: number;
  readonly resultado: ResultadoTrituradora;
}

export interface ComparacionAbono {
  /** Lo que pasa sin hacer nada distinto: solo la cuota fija (0 si no hay). */
  readonly base: EscenarioSimulado | null;
  /** Lo que pasa si además se le vuelca el abono extra elegido. */
  readonly conAbono: EscenarioSimulado;
  /** Extra por quincena que se está simulando, ya redondeado. */
  readonly abonoExtra: number;
  /** ¿El escenario base llega a saldar? Si no, el ahorro de plazo no aplica. */
  readonly baseSeSalda: boolean;
  /** Quincenas que se recortan del plazo. 0 si el base no se salda. */
  readonly quincenasAhorradas: number;
  /** Meses equivalentes a `quincenasAhorradas`, con un decimal. */
  readonly mesesAhorrados: number;
  /** Porcentaje del plazo original que se recorta (0–100). */
  readonly porcentajePlazoReducido: number;
  /** Intereses que se dejan de pagar. 0 si el base no se salda. */
  readonly interesAhorrado: number;
  /** Interés de un día al saldo actual: el costo de no hacer nada hoy. */
  readonly interesDiarioActual: number;
}

export interface EntradaSimulacion {
  readonly saldoActual: number;
  readonly tasaMensualNominal: number;
  /** Cuota fija pactada por quincena. 0 si la deuda no tiene. */
  readonly abonoObjetivo: number;
  /** Extra por quincena que se quiere simular encima de la cuota. */
  readonly abonoExtra: number;
  readonly periodosPorMes?: number;
}

/**
 * Compara "seguir igual" contra "abonar el extra", y devuelve la diferencia
 * ya masticada para mostrarla.
 *
 * Devuelve `null` cuando no hay nada que simular: sin saldo no hay deuda, y
 * sin cuota ni extra no hay ningún pago del cual proyectar un desenlace.
 */
export function simularAbonoExtra(entrada: EntradaSimulacion): ComparacionAbono | null {
  const periodosPorMes = entrada.periodosPorMes ?? PERIODOS_POR_MES_POR_DEFECTO;
  const cuota = Math.max(0, aColones(entrada.abonoObjetivo));
  const extra = Math.max(0, aColones(entrada.abonoExtra));
  const abonoTotal = cuota + extra;

  if (entrada.saldoActual <= 0 || abonoTotal <= 0) return null;

  const conAbonoResultado = proyectarTrituradora({
    saldoInicial: entrada.saldoActual,
    tasaMensualNominal: entrada.tasaMensualNominal,
    abonoPorPeriodo: abonoTotal,
    periodosPorMes,
  });
  const conAbono: EscenarioSimulado = {
    abonoPorPeriodo: abonoTotal,
    resultado: conAbonoResultado,
  };

  const interesDiarioActual = interesDiario(entrada.saldoActual, entrada.tasaMensualNominal);

  // Sin cuota fija no hay escenario base que proyectar: "no abonar nada" no
  // es una proyección, es una deuda que crece sola. Se reporta como base
  // ausente para que la pantalla lo diga con esas palabras.
  if (cuota <= 0) {
    return {
      base: null,
      conAbono,
      abonoExtra: extra,
      baseSeSalda: false,
      quincenasAhorradas: 0,
      mesesAhorrados: 0,
      porcentajePlazoReducido: 0,
      interesAhorrado: 0,
      interesDiarioActual,
    };
  }

  const baseResultado = proyectarTrituradora({
    saldoInicial: entrada.saldoActual,
    tasaMensualNominal: entrada.tasaMensualNominal,
    abonoPorPeriodo: cuota,
    periodosPorMes,
  });
  const base: EscenarioSimulado = { abonoPorPeriodo: cuota, resultado: baseResultado };

  // Si con la sola cuota la deuda nunca se salda (la mora crece más rápido de
  // lo que se abona), el "plazo original" es el tope de la proyección, no un
  // plazo real: restarle el nuevo daría un ahorro inventado.
  if (!baseResultado.saldado) {
    return {
      base,
      conAbono,
      abonoExtra: extra,
      baseSeSalda: false,
      quincenasAhorradas: 0,
      mesesAhorrados: 0,
      porcentajePlazoReducido: 0,
      interesAhorrado: 0,
      interesDiarioActual,
    };
  }

  const quincenasAhorradas = Math.max(
    0,
    baseResultado.periodosParaSaldar - conAbonoResultado.periodosParaSaldar,
  );
  const interesAhorrado = Math.max(
    0,
    baseResultado.totalInteresPagado - conAbonoResultado.totalInteresPagado,
  );
  const porcentajePlazoReducido =
    baseResultado.periodosParaSaldar > 0
      ? Math.round((quincenasAhorradas / baseResultado.periodosParaSaldar) * 100)
      : 0;

  return {
    base,
    conAbono,
    abonoExtra: extra,
    baseSeSalda: true,
    quincenasAhorradas,
    mesesAhorrados: Math.round((quincenasAhorradas / periodosPorMes) * 10) / 10,
    porcentajePlazoReducido,
    interesAhorrado,
    interesDiarioActual,
  };
}
