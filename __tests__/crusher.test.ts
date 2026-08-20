import {
  compararEscenarios,
  proyectarTrituradora,
  PERIODOS_POR_ANIO_POR_DEFECTO,
} from '../src/core/debt/crusher';

describe('proyectarTrituradora', () => {
  it('con tasa cero, amortiza linealmente sin generar interés', () => {
    const r = proyectarTrituradora({
      saldoInicial: 100_000,
      tasaAnualNominal: 0,
      abonoPorPeriodo: 25_000,
    });
    expect(r.totalInteresPagado).toBe(0);
    expect(r.periodosParaSaldar).toBe(4);
    expect(r.saldado).toBe(true);
    expect(r.totalAbonado).toBe(100_000);
  });

  it('el último período abona solo lo que falta, no el nominal completo', () => {
    const r = proyectarTrituradora({
      saldoInicial: 100_000,
      tasaAnualNominal: 0,
      abonoPorPeriodo: 30_000,
    });
    // 100000 -> 70000 -> 40000 -> 10000 -> 0 (el último abono real es 10000)
    expect(r.periodosParaSaldar).toBe(4);
    expect(r.periodos[3].abonoCapital).toBe(10_000);
    expect(r.totalAbonado).toBe(100_000);
  });

  it('con interés real, el saldo baja más lento que la resta simple', () => {
    const r = proyectarTrituradora({
      saldoInicial: 1_000_000,
      tasaAnualNominal: 0.24, // 24% anual -> 1% quincenal con 24 periodos/año
      abonoPorPeriodo: 50_000,
    });
    // Primer período: interés = 1,000,000 * 0.01 = 10,000; abono capital = 40,000
    expect(r.periodos[0].interes).toBe(10_000);
    expect(r.periodos[0].abonoCapital).toBe(40_000);
    expect(r.periodos[0].saldoFinal).toBe(960_000);
    expect(r.totalInteresPagado).toBeGreaterThan(0);
  });

  it('modela amortización negativa cuando el abono no cubre el interés', () => {
    const r = proyectarTrituradora({
      saldoInicial: 1_000_000,
      tasaAnualNominal: 0.24,
      abonoPorPeriodo: 5_000, // menos que el interés del primer período (10,000)
      maxPeriodos: 10,
    });
    expect(r.periodos[0].abonoCapital).toBeLessThan(0);
    expect(r.periodos[0].saldoFinal).toBeGreaterThan(r.periodos[0].saldoInicial);
    expect(r.saldado).toBe(false);
    expect(r.periodosParaSaldar).toBe(10);
  });

  it('usa 24 períodos por año por defecto (quincenal)', () => {
    const conDefault = proyectarTrituradora({
      saldoInicial: 1_000_000,
      tasaAnualNominal: 0.24,
      abonoPorPeriodo: 50_000,
    });
    const conExplicito = proyectarTrituradora({
      saldoInicial: 1_000_000,
      tasaAnualNominal: 0.24,
      abonoPorPeriodo: 50_000,
      periodosPorAnio: PERIODOS_POR_ANIO_POR_DEFECTO,
    });
    expect(conDefault).toEqual(conExplicito);
  });

  it('rechaza saldo negativo', () => {
    expect(() =>
      proyectarTrituradora({ saldoInicial: -1, tasaAnualNominal: 0.1, abonoPorPeriodo: 1000 }),
    ).toThrow(RangeError);
  });

  it('rechaza tasa negativa', () => {
    expect(() =>
      proyectarTrituradora({ saldoInicial: 1000, tasaAnualNominal: -0.1, abonoPorPeriodo: 100 }),
    ).toThrow(RangeError);
  });

  it('rechaza abono cero o negativo', () => {
    expect(() =>
      proyectarTrituradora({ saldoInicial: 1000, tasaAnualNominal: 0.1, abonoPorPeriodo: 0 }),
    ).toThrow(RangeError);
  });

  it('un saldo inicial de cero se salda de inmediato sin períodos', () => {
    const r = proyectarTrituradora({
      saldoInicial: 0,
      tasaAnualNominal: 0.2,
      abonoPorPeriodo: 1000,
    });
    expect(r.periodosParaSaldar).toBe(0);
    expect(r.saldado).toBe(true);
    expect(r.periodos).toEqual([]);
  });
});

describe('compararEscenarios', () => {
  it('un abono extra reduce tanto el interés total como los períodos', () => {
    const c = compararEscenarios({
      saldoInicial: 1_000_000,
      tasaAnualNominal: 0.24,
      abonoBase: 50_000,
      abonoExtra: 20_000,
    });
    expect(c.interesAhorrado).toBeGreaterThan(0);
    expect(c.periodosAhorrados).toBeGreaterThan(0);
    expect(c.conExtra.totalInteresPagado).toBeLessThan(c.base.totalInteresPagado);
    expect(c.conExtra.periodosParaSaldar).toBeLessThan(c.base.periodosParaSaldar);
  });

  it('sin abono extra, ambos escenarios son idénticos', () => {
    const c = compararEscenarios({
      saldoInicial: 500_000,
      tasaAnualNominal: 0.18,
      abonoBase: 40_000,
      abonoExtra: 0,
    });
    expect(c.interesAhorrado).toBe(0);
    expect(c.periodosAhorrados).toBe(0);
  });
});
