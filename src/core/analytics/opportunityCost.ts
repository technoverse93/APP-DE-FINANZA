/**
 * Costo de oportunidad de un gasto variable ("hormiga"): cuánto se habría
 * adelantado la fecha de libertad de la deuda prioritaria (mayor tasa) si
 * ese mismo monto se hubiera abonado a capital una sola vez, en vez de
 * gastarse.
 *
 * Reusa `proyectarTrituradora` en vez de `compararEscenarios`: este es un
 * abono único que reduce el saldo inicial, no uno recurrente cada quincena
 * (que es lo que modela `compararEscenarios`, pensado para "¿qué pasa si
 * pago más CADA quincena?", no para un gasto puntual de hoy).
 */

import { proyectarTrituradora, type ParametrosTrituradora } from '../debt/crusher';
import { formatearColones } from '../payroll/distribution';

export interface DeudaParaCostoOportunidad {
  readonly id: string;
  readonly nombre: string;
  readonly saldoActual: number;
  readonly tasaAnual: number;
  readonly abonoObjetivo: number;
}

export interface CostoOportunidad {
  readonly deudaId: string;
  readonly deudaNombre: string;
  readonly periodosAdelantados: number;
  readonly interesAhorrado: number;
  readonly mensaje: string;
}

function construirMensaje(
  monto: number,
  deudaNombre: string,
  periodos: number,
  interes: number,
): string {
  if (periodos <= 0) {
    return (
      `Gastaste ${formatearColones(monto)}. Frente a "${deudaNombre}" es un monto chico: ` +
      `abonarlo no habría adelantado la fecha en que quedás libre de esa deuda.`
    );
  }
  const meses = periodos / 2;
  const textoMeses = Number.isInteger(meses) ? String(meses) : meses.toFixed(1);
  return (
    `Gastaste ${formatearColones(monto)} hoy. Si lo hubieras abonado a "${deudaNombre}" en vez ` +
    `de gastarlo, quedarías libre de esa deuda ${periodos} quincenas antes (~${textoMeses} meses) ` +
    `y te ahorrarías ${formatearColones(interes)} en intereses.`
  );
}

/**
 * @returns null si no hay deudas, monto inválido, o la deuda prioritaria no
 * tiene abono objetivo configurado o ya está saldada (nada que proyectar).
 */
export function calcularCostoOportunidad(
  montoGasto: number,
  deudas: readonly DeudaParaCostoOportunidad[],
): CostoOportunidad | null {
  if (!Number.isFinite(montoGasto) || montoGasto <= 0 || deudas.length === 0) return null;

  const [prioritaria] = [...deudas].sort((a, b) => b.tasaAnual - a.tasaAnual);
  if (prioritaria.abonoObjetivo <= 0 || prioritaria.saldoActual <= 0) return null;

  const parametrosBase: Omit<ParametrosTrituradora, 'saldoInicial'> = {
    tasaAnualNominal: prioritaria.tasaAnual,
    abonoPorPeriodo: prioritaria.abonoObjetivo,
  };

  const base = proyectarTrituradora({ ...parametrosBase, saldoInicial: prioritaria.saldoActual });
  const conAbonoUnico = proyectarTrituradora({
    ...parametrosBase,
    saldoInicial: Math.max(0, prioritaria.saldoActual - montoGasto),
  });

  const periodosAdelantados = base.periodosParaSaldar - conAbonoUnico.periodosParaSaldar;
  const interesAhorrado = base.totalInteresPagado - conAbonoUnico.totalInteresPagado;

  return {
    deudaId: prioritaria.id,
    deudaNombre: prioritaria.nombre,
    periodosAdelantados,
    interesAhorrado,
    mensaje: construirMensaje(montoGasto, prioritaria.nombre, periodosAdelantados, interesAhorrado),
  };
}
