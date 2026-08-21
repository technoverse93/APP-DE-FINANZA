/**
 * Calendario de pagos de nómina.
 *
 * Reglas:
 *  - Se paga los días 13 y 28 de cada mes.
 *  - Si la fecha cae sábado o domingo, el pago se adelanta al viernes previo.
 *  - El input de la "colilla previa" se habilita exactamente 48 horas antes
 *    del inicio (00:00 hora de Costa Rica) del día de pago ya ajustado.
 *
 * Todo el cálculo se hace contra la hora de Costa Rica, que es UTC-6 fija y
 * no observa horario de verano. Trabajar con un offset fijo evita que el
 * resultado dependa de la zona horaria del dispositivo.
 */

/** Días nominales de pago, antes de ajustar por fin de semana. */
export const PAYDAY_DAYS = [13, 28] as const;

/** Costa Rica es UTC-6 todo el año. */
export const CR_UTC_OFFSET_HOURS = -6;

/** Horas de anticipación con las que se habilita el input de la colilla. */
export const COLILLA_LEAD_HOURS = 48;

const MS_PER_HOUR = 3_600_000;

export type PaydayKind = 'quincena' | 'fin_de_mes';

export interface Payday {
  /** Fecha efectiva de pago, ya adelantada si caía en fin de semana. */
  readonly date: Date;
  /** Día nominal del que proviene: 13 o 28. */
  readonly nominalDay: (typeof PAYDAY_DAYS)[number];
  /** Día del mes efectivo tras el ajuste. */
  readonly effectiveDay: number;
  /** true si hubo que adelantar la fecha por caer en fin de semana. */
  readonly movedFromWeekend: boolean;
  readonly kind: PaydayKind;
}

export interface ColillaWindow {
  /** Momento en que se habilita el ingreso de la colilla. */
  readonly opensAt: Date;
  /** Día de pago al que corresponde la ventana. */
  readonly payday: Payday;
}

/**
 * Instante UTC que corresponde a las 00:00 de Costa Rica de una fecha dada.
 * Las 00:00 en UTC-6 son las 06:00 UTC del mismo día calendario.
 */
export function crMidnightUtc(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, -CR_UTC_OFFSET_HOURS, 0, 0, 0));
}

/** Día de la semana (0 = domingo … 6 = sábado) de una fecha calendario. */
function dayOfWeek(year: number, monthIndex: number, day: number): number {
  return new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
}

/**
 * Adelanta al viernes previo si la fecha cae en fin de semana.
 * Sábado retrocede un día; domingo retrocede dos.
 */
export function adjustForWeekend(year: number, monthIndex: number, day: number): number {
  const dow = dayOfWeek(year, monthIndex, day);
  if (dow === 6) return day - 1; // sábado -> viernes
  if (dow === 0) return day - 2; // domingo -> viernes
  return day;
}

function buildPayday(
  year: number,
  monthIndex: number,
  nominalDay: (typeof PAYDAY_DAYS)[number],
): Payday {
  const effectiveDay = adjustForWeekend(year, monthIndex, nominalDay);
  return {
    date: crMidnightUtc(year, monthIndex, effectiveDay),
    nominalDay,
    effectiveDay,
    movedFromWeekend: effectiveDay !== nominalDay,
    kind: nominalDay === 13 ? 'quincena' : 'fin_de_mes',
  };
}

/** Los dos días de pago de un mes, en orden cronológico. */
export function paydaysForMonth(year: number, monthIndex: number): Payday[] {
  return PAYDAY_DAYS.map((d) => buildPayday(year, monthIndex, d)).sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}

/**
 * Próximo día de pago en el momento `now` (inclusive: si `now` cae dentro del
 * día de pago, ese mismo día sigue siendo el próximo).
 */
export function nextPayday(now: Date): Payday {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  const candidates = [
    ...paydaysForMonth(y, m - 1),
    ...paydaysForMonth(y, m),
    ...paydaysForMonth(y, m + 1),
  ];

  // Un día de pago sigue vigente hasta que termina (24 h después de las 00:00 CR).
  const found = candidates.find((p) => now.getTime() < p.date.getTime() + 24 * MS_PER_HOUR);
  if (!found) {
    throw new Error('No se pudo determinar el próximo día de pago');
  }
  return found;
}

/** Día de pago inmediatamente anterior a `now`. */
export function previousPayday(now: Date): Payday {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  const candidates = [
    ...paydaysForMonth(y, m - 1),
    ...paydaysForMonth(y, m),
    ...paydaysForMonth(y, m + 1),
  ].filter((p) => p.date.getTime() < now.getTime());

  const found = candidates[candidates.length - 1];
  if (!found) {
    throw new Error('No se pudo determinar el día de pago anterior');
  }
  return found;
}

/** Ventana de captura de la colilla para un día de pago. */
export function colillaWindow(payday: Payday): ColillaWindow {
  return {
    opensAt: new Date(payday.date.getTime() - COLILLA_LEAD_HOURS * MS_PER_HOUR),
    payday,
  };
}

/**
 * ¿Está habilitado el ingreso de la colilla en el momento `now`?
 * La ventana abre 48 h antes del día de pago y cierra cuando el día de pago
 * termina.
 */
export function isColillaInputEnabled(now: Date, payday: Payday = nextPayday(now)): boolean {
  const { opensAt } = colillaWindow(payday);
  const closesAt = new Date(payday.date.getTime() + 24 * MS_PER_HOUR);
  return now.getTime() >= opensAt.getTime() && now.getTime() < closesAt.getTime();
}

/** Milisegundos que faltan para que abra la ventana; 0 si ya está abierta. */
export function msUntilColillaWindow(now: Date, payday: Payday = nextPayday(now)): number {
  const { opensAt } = colillaWindow(payday);
  return Math.max(0, opensAt.getTime() - now.getTime());
}

/**
 * Fecha real del pago que queda `n` quincenas adelante de `desde` (n=1 es el
 * próximo pago). Sirve para convertir un conteo de períodos de la Trituradora
 * de Deudas (que cuenta quincenas, no meses) en una fecha calendario real,
 * reusando el mismo calendario 13/28 en vez de aproximar con "meses".
 *
 * n=0 devuelve `desde` tal cual: ya está saldada, no hay que avanzar nada.
 */
export function avanzarNPeriodos(desde: Date, n: number): Date {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError('n debe ser un entero no negativo');
  }
  if (n === 0) return desde;

  let payday = nextPayday(desde);
  for (let i = 1; i < n; i++) {
    const diaSiguiente = new Date(payday.date.getTime() + 24 * MS_PER_HOUR);
    payday = nextPayday(diaSiguiente);
  }
  return payday.date;
}
