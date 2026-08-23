/**
 * Colilla preconfirmada y su recordatorio.
 *
 * El ingreso disponible se calcula solo a partir del ingreso base
 * (`INGRESO_BASE_QUINCENAL`), pero el monto real depositado varía. Esta pieza
 * permite confirmar el monto exacto cuando el usuario ya lo conoce, y avisa
 * para que lo haga: exactamente 2 días calendario antes de la fecha REAL de
 * pago (la ya corrida al viernes si el 13/28 cayó fin de semana, ver
 * `adjustForWeekend` en schedule.ts).
 *
 * Ejemplos de la regla, con la fecha real ya ajustada:
 *   pago real viernes 12  -> aviso el miércoles 10
 *   pago real viernes 26  -> aviso el miércoles 24
 *   pago real martes 13   -> aviso el domingo 11
 *
 * El aviso se cuenta en días calendario, no hábiles: 2 días antes es 2 días
 * antes aunque caiga fin de semana.
 */

import { nextPayday, type Payday } from './schedule';

/** Días calendario de antelación del recordatorio de colilla. */
export const DIAS_AVISO_COLILLA = 2;

const MS_POR_DIA = 86_400_000;

export interface AvisoColilla {
  /** Día de pago real (ya corrido al viernes si aplicaba). */
  readonly payday: Payday;
  /** Momento exacto en que debe dispararse el aviso. */
  readonly avisaEl: Date;
}

/**
 * Fecha del recordatorio para un día de pago: exactamente
 * `DIAS_AVISO_COLILLA` días calendario antes de la fecha real de pago.
 */
export function fechaAvisoColilla(payday: Payday): Date {
  return new Date(payday.date.getTime() - DIAS_AVISO_COLILLA * MS_POR_DIA);
}

/**
 * Próximo aviso de colilla pendiente en el momento `ahora`.
 *
 * Si el aviso del próximo pago ya pasó (estamos dentro de los 2 días
 * previos), devuelve igual ese pago: el recordatorio sigue vigente hasta que
 * el pago ocurra, que es cuando confirmar el monto todavía sirve.
 */
export function proximoAvisoColilla(ahora: Date): AvisoColilla {
  const payday = nextPayday(ahora);
  return { payday, avisaEl: fechaAvisoColilla(payday) };
}

/**
 * ¿Corresponde pedir la confirmación de la colilla en el momento `ahora`?
 * Cierto desde que se cumple el aviso (2 días antes) hasta que termina el
 * día de pago.
 */
export function debePedirColilla(ahora: Date, payday: Payday = nextPayday(ahora)): boolean {
  const desde = fechaAvisoColilla(payday).getTime();
  const hasta = payday.date.getTime() + 24 * 3_600_000;
  return ahora.getTime() >= desde && ahora.getTime() < hasta;
}
