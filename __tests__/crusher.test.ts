import {
  proyectarTrituradora,
  proyectarPorPorcentajeRemanente,
  priorizarAbonoExtra,
  RemanenteInsuficienteError,
  PERIODOS_POR_MES_POR_DEFECTO,
} from '../src/core/debt/crusher';

describe('proyectarTrituradora', () => {
  it('con tasa cero, amortiza linealmente sin generar interés', () => {
    const r = proyectarTrituradora({
      saldoInicial: 100_000,
      tasaMensualNominal: 0,
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
      tasaMensualNominal: 0,
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
      tasaMensualNominal: 0.02, // 2% mensual -> 1% quincenal con 2 periodos/mes
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
      tasaMensualNominal: 0.02,
      abonoPorPeriodo: 5_000, // menos que el interés del primer período (10,000)
      maxPeriodos: 10,
    });
    expect(r.periodos[0].abonoCapital).toBeLessThan(0);
    expect(r.periodos[0].saldoFinal).toBeGreaterThan(r.periodos[0].saldoInicial);
    expect(r.saldado).toBe(false);
    expect(r.periodosParaSaldar).toBe(10);
  });

  it('usa 2 períodos por mes por defecto (quincenal)', () => {
    const conDefault = proyectarTrituradora({
      saldoInicial: 1_000_000,
      tasaMensualNominal: 0.02,
      abonoPorPeriodo: 50_000,
    });
    const conExplicito = proyectarTrituradora({
      saldoInicial: 1_000_000,
      tasaMensualNominal: 0.02,
      abonoPorPeriodo: 50_000,
      periodosPorMes: PERIODOS_POR_MES_POR_DEFECTO,
    });
    expect(conDefault).toEqual(conExplicito);
  });

  it('rechaza saldo negativo', () => {
    expect(() =>
      proyectarTrituradora({ saldoInicial: -1, tasaMensualNominal: 0.02, abonoPorPeriodo: 1000 }),
    ).toThrow(RangeError);
  });

  it('rechaza tasa negativa', () => {
    expect(() =>
      proyectarTrituradora({ saldoInicial: 1000, tasaMensualNominal: -0.02, abonoPorPeriodo: 100 }),
    ).toThrow(RangeError);
  });

  it('rechaza abono cero o negativo', () => {
    expect(() =>
      proyectarTrituradora({ saldoInicial: 1000, tasaMensualNominal: 0.02, abonoPorPeriodo: 0 }),
    ).toThrow(RangeError);
  });

  it('un saldo inicial de cero se salda de inmediato sin períodos', () => {
    const r = proyectarTrituradora({
      saldoInicial: 0,
      tasaMensualNominal: 0.02,
      abonoPorPeriodo: 1000,
    });
    expect(r.periodosParaSaldar).toBe(0);
    expect(r.saldado).toBe(true);
    expect(r.periodos).toEqual([]);
  });
});

describe('priorizarAbonoExtra', () => {
  it('vuelca todo el extra a la deuda de mayor tasa cuando no alcanza para saldarla', () => {
    const asignaciones = priorizarAbonoExtra(150_000, [
      { id: 'a', saldoActual: 100_000, tasaMensual: 0.008, abonoObjetivo: 10_000 },
      { id: 'b', saldoActual: 500_000, tasaMensual: 0.025, abonoObjetivo: 20_000 },
    ]);
    const asigB = asignaciones.find((a) => a.deudaId === 'b')!;
    const asigA = asignaciones.find((a) => a.deudaId === 'a')!;
    expect(asigB.abonoExtraAsignado).toBe(150_000);
    expect(asigB.abonoTotal).toBe(170_000);
    expect(asigA.abonoExtraAsignado).toBe(0);
    expect(asigA.abonoTotal).toBe(10_000);
  });

  it('si la deuda de mayor tasa se salda con el extra, el resto pasa a la siguiente', () => {
    const asignaciones = priorizarAbonoExtra(150_000, [
      { id: 'a', saldoActual: 100_000, tasaMensual: 0.008, abonoObjetivo: 10_000 },
      { id: 'b', saldoActual: 50_000, tasaMensual: 0.025, abonoObjetivo: 20_000 },
    ]);
    const asigB = asignaciones.find((a) => a.deudaId === 'b')!;
    const asigA = asignaciones.find((a) => a.deudaId === 'a')!;
    expect(asigB.abonoExtraAsignado).toBe(50_000);
    expect(asigA.abonoExtraAsignado).toBe(100_000);
    expect(asigA.abonoTotal).toBe(110_000);
  });

  it('rechaza un extra no positivo', () => {
    expect(() =>
      priorizarAbonoExtra(0, [{ id: 'a', saldoActual: 1000, tasaMensual: 0.008, abonoObjetivo: 100 }]),
    ).toThrow(RemanenteInsuficienteError);
    expect(() => priorizarAbonoExtra(-500, [])).toThrow(RemanenteInsuficienteError);
  });

  it('con una lista vacía de deudas, no hay nada que asignar', () => {
    expect(priorizarAbonoExtra(10_000, [])).toEqual([]);
  });
});

describe('proyectarPorPorcentajeRemanente', () => {
  it('el abono por período es el remanente libre por el porcentaje elegido', () => {
    const p = proyectarPorPorcentajeRemanente(1_000_000, 0.02, 100_000, 50, new Date());
    expect(p?.abonoPorPeriodo).toBe(50_000);
    expect(p?.porcentaje).toBe(50);
  });

  it('recalcula el abono al cambiar el porcentaje, sin ninguna cuota fija de por medio', () => {
    const con25 = proyectarPorPorcentajeRemanente(1_000_000, 0.02, 100_000, 25, new Date());
    const con75 = proyectarPorPorcentajeRemanente(1_000_000, 0.02, 100_000, 75, new Date());
    expect(con25?.abonoPorPeriodo).toBe(25_000);
    expect(con75?.abonoPorPeriodo).toBe(75_000);
    expect(con75!.resultado.periodosParaSaldar).toBeLessThan(con25!.resultado.periodosParaSaldar);
  });

  it('con remanente libre en cero, no hay proyección que mostrar', () => {
    expect(proyectarPorPorcentajeRemanente(1_000_000, 0.02, 0, 50, new Date())).toBeNull();
  });

  it('con un remanente negativo (déficit), se trata como cero', () => {
    expect(proyectarPorPorcentajeRemanente(1_000_000, 0.02, -20_000, 50, new Date())).toBeNull();
  });

  it('con porcentaje cero o negativo, no hay proyección que mostrar', () => {
    expect(proyectarPorPorcentajeRemanente(1_000_000, 0.02, 100_000, 0, new Date())).toBeNull();
    expect(proyectarPorPorcentajeRemanente(1_000_000, 0.02, 100_000, -10, new Date())).toBeNull();
  });

  it('trae la fecha real de saldo cero cuando el abono alcanza a saldar', () => {
    const fechaInicio = new Date(Date.UTC(2026, 7, 1, 12));
    const p = proyectarPorPorcentajeRemanente(100_000, 0, 50_000, 100, fechaInicio);
    expect(p?.resultado.saldado).toBe(true);
    expect(p?.fechaSaldoCero).not.toBeNull();
  });

  it('si el abono no cubre ni el interés, la fecha de saldo cero queda en null', () => {
    const p = proyectarPorPorcentajeRemanente(5_000_000, 0.6, 1_000, 100, new Date());
    expect(p?.resultado.saldado).toBe(false);
    expect(p?.fechaSaldoCero).toBeNull();
  });
});
