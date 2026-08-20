import {
  adjustForWeekend,
  colillaWindow,
  crMidnightUtc,
  isColillaInputEnabled,
  nextPayday,
  paydaysForMonth,
  previousPayday,
} from '../src/core/payroll/schedule';

describe('adjustForWeekend', () => {
  it('deja intactas las fechas entre semana', () => {
    // 13 de agosto de 2026 es jueves.
    expect(adjustForWeekend(2026, 7, 13)).toBe(13);
  });

  it('adelanta un día cuando cae sábado', () => {
    // 28 de febrero de 2026 es sábado -> viernes 27.
    expect(adjustForWeekend(2026, 1, 28)).toBe(27);
  });

  it('adelanta dos días cuando cae domingo', () => {
    // 13 de septiembre de 2026 es domingo -> viernes 11.
    expect(adjustForWeekend(2026, 8, 13)).toBe(11);
  });
});

describe('paydaysForMonth', () => {
  it('devuelve los dos pagos en orden cronológico', () => {
    const [primero, segundo] = paydaysForMonth(2026, 7);
    expect(primero.nominalDay).toBe(13);
    expect(segundo.nominalDay).toBe(28);
    expect(primero.date.getTime()).toBeLessThan(segundo.date.getTime());
  });

  it('marca los pagos que se movieron por fin de semana', () => {
    // Septiembre 2026: el 13 es domingo, el 28 es lunes.
    const [quincena, finDeMes] = paydaysForMonth(2026, 8);
    expect(quincena.movedFromWeekend).toBe(true);
    expect(quincena.effectiveDay).toBe(11);
    expect(finDeMes.movedFromWeekend).toBe(false);
    expect(finDeMes.effectiveDay).toBe(28);
  });

  it('clasifica el tipo de pago', () => {
    const [quincena, finDeMes] = paydaysForMonth(2026, 7);
    expect(quincena.kind).toBe('quincena');
    expect(finDeMes.kind).toBe('fin_de_mes');
  });
});

describe('nextPayday', () => {
  it('elige el 13 cuando aún no ha pasado', () => {
    const now = crMidnightUtc(2026, 7, 5);
    expect(nextPayday(now).effectiveDay).toBe(13);
  });

  it('elige el 28 cuando el 13 ya pasó', () => {
    const now = crMidnightUtc(2026, 7, 20);
    expect(nextPayday(now).effectiveDay).toBe(28);
  });

  it('salta al mes siguiente cuando el 28 ya pasó', () => {
    const now = crMidnightUtc(2026, 7, 30);
    const siguiente = nextPayday(now);
    expect(siguiente.date.getUTCMonth()).toBe(8); // septiembre
    expect(siguiente.effectiveDay).toBe(11); // el 13 cae domingo
  });

  it('sigue vigente durante el propio día de pago', () => {
    // 13 de agosto de 2026 a las 10:00 CR.
    const now = new Date(crMidnightUtc(2026, 7, 13).getTime() + 10 * 3_600_000);
    expect(nextPayday(now).effectiveDay).toBe(13);
  });

  it('cruza el fin de año correctamente', () => {
    const now = crMidnightUtc(2026, 11, 30);
    const siguiente = nextPayday(now);
    expect(siguiente.date.getUTCFullYear()).toBe(2027);
    expect(siguiente.date.getUTCMonth()).toBe(0);
  });
});

describe('previousPayday', () => {
  it('devuelve el pago inmediatamente anterior', () => {
    const now = crMidnightUtc(2026, 7, 20);
    expect(previousPayday(now).effectiveDay).toBe(13);
  });

  it('retrocede al mes anterior si hace falta', () => {
    const now = crMidnightUtc(2026, 7, 2);
    const anterior = previousPayday(now);
    expect(anterior.date.getUTCMonth()).toBe(6); // julio
    expect(anterior.effectiveDay).toBe(28);
  });
});

describe('ventana de la colilla', () => {
  it('abre exactamente 48 horas antes del pago', () => {
    const [quincena] = paydaysForMonth(2026, 7);
    const { opensAt } = colillaWindow(quincena);
    const horas = (quincena.date.getTime() - opensAt.getTime()) / 3_600_000;
    expect(horas).toBe(48);
  });

  it('se mide contra la fecha ya adelantada, no contra la nominal', () => {
    // El 13 de septiembre de 2026 es domingo: el pago se adelanta al viernes 11
    // y la ventana abre el miércoles 9, no el viernes 11.
    const [quincena] = paydaysForMonth(2026, 8);
    const { opensAt } = colillaWindow(quincena);
    expect(opensAt.getTime()).toBe(crMidnightUtc(2026, 8, 9).getTime());
  });

  it('está cerrada tres días antes del pago', () => {
    const [quincena] = paydaysForMonth(2026, 7);
    const now = new Date(quincena.date.getTime() - 72 * 3_600_000);
    expect(isColillaInputEnabled(now, quincena)).toBe(false);
  });

  it('está abierta justo al cumplirse las 48 horas', () => {
    const [quincena] = paydaysForMonth(2026, 7);
    const now = new Date(quincena.date.getTime() - 48 * 3_600_000);
    expect(isColillaInputEnabled(now, quincena)).toBe(true);
  });

  it('sigue abierta durante el día de pago', () => {
    const [quincena] = paydaysForMonth(2026, 7);
    const now = new Date(quincena.date.getTime() + 6 * 3_600_000);
    expect(isColillaInputEnabled(now, quincena)).toBe(true);
  });

  it('cierra cuando termina el día de pago', () => {
    const [quincena] = paydaysForMonth(2026, 7);
    const now = new Date(quincena.date.getTime() + 24 * 3_600_000);
    expect(isColillaInputEnabled(now, quincena)).toBe(false);
  });
});
