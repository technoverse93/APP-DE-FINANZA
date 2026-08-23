import {
  DIAS_AVISO_COLILLA,
  debePedirColilla,
  fechaAvisoColilla,
  proximoAvisoColilla,
} from '../src/core/payroll/colilla';
import { crMidnightUtc, nextPayday, paydaysForMonth } from '../src/core/payroll/schedule';

describe('fechaAvisoColilla', () => {
  it('avisa 2 días calendario antes de un pago que NO se movió', () => {
    // 13 de agosto de 2026 es jueves: no se mueve. Aviso el martes 11.
    const [quincena] = paydaysForMonth(2026, 7);
    expect(quincena.effectiveDay).toBe(13);
    expect(fechaAvisoColilla(quincena).getTime()).toBe(crMidnightUtc(2026, 7, 11).getTime());
  });

  it('cuenta los 2 días desde la fecha YA corrida, no desde el día nominal', () => {
    // Septiembre 2026: el 13 es domingo -> el pago real es el viernes 11.
    // El aviso debe ser el miércoles 9, no el 11 (que sería 2 días antes del
    // día nominal 13).
    const [quincena] = paydaysForMonth(2026, 8);
    expect(quincena.movedFromWeekend).toBe(true);
    expect(quincena.effectiveDay).toBe(11);
    expect(fechaAvisoColilla(quincena).getTime()).toBe(crMidnightUtc(2026, 8, 9).getTime());
  });

  it('con el 28 en sábado, el pago cae viernes 27 y el aviso miércoles 25', () => {
    // Febrero 2026: el 28 es sábado -> pago el viernes 27.
    const [, finDeMes] = paydaysForMonth(2026, 1);
    expect(finDeMes.effectiveDay).toBe(27);
    expect(fechaAvisoColilla(finDeMes).getTime()).toBe(crMidnightUtc(2026, 1, 25).getTime());
  });

  it('la distancia siempre es exactamente DIAS_AVISO_COLILLA días', () => {
    for (const mes of [0, 1, 5, 8, 11]) {
      for (const payday of paydaysForMonth(2026, mes)) {
        const dias = (payday.date.getTime() - fechaAvisoColilla(payday).getTime()) / 86_400_000;
        expect(dias).toBe(DIAS_AVISO_COLILLA);
      }
    }
  });
});

describe('debePedirColilla', () => {
  it('es falso 3 días antes del pago', () => {
    const payday = nextPayday(crMidnightUtc(2026, 7, 1));
    const tresDiasAntes = new Date(payday.date.getTime() - 3 * 86_400_000);
    expect(debePedirColilla(tresDiasAntes, payday)).toBe(false);
  });

  it('es cierto justo cuando se cumplen los 2 días', () => {
    const payday = nextPayday(crMidnightUtc(2026, 7, 1));
    expect(debePedirColilla(fechaAvisoColilla(payday), payday)).toBe(true);
  });

  it('sigue cierto el mismo día de pago', () => {
    const payday = nextPayday(crMidnightUtc(2026, 7, 1));
    expect(debePedirColilla(payday.date, payday)).toBe(true);
  });

  it('deja de pedirla una vez que el día de pago terminó', () => {
    const payday = nextPayday(crMidnightUtc(2026, 7, 1));
    const despues = new Date(payday.date.getTime() + 25 * 3_600_000);
    expect(debePedirColilla(despues, payday)).toBe(false);
  });
});

describe('proximoAvisoColilla', () => {
  it('devuelve el próximo pago con su fecha de aviso', () => {
    const ahora = crMidnightUtc(2026, 7, 1);
    const aviso = proximoAvisoColilla(ahora);
    expect(aviso.payday.nominalDay).toBe(13);
    expect(aviso.avisaEl.getTime()).toBe(fechaAvisoColilla(aviso.payday).getTime());
  });
});
