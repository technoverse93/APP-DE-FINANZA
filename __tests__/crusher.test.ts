import {
  compararEscenarios,
  proyectarTrituradora,
  priorizarAbonoExtra,
  proyectarConGamificacion,
  RemanenteInsuficienteError,
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

describe('priorizarAbonoExtra', () => {
  it('vuelca todo el extra a la deuda de mayor tasa cuando no alcanza para saldarla', () => {
    const asignaciones = priorizarAbonoExtra(150_000, [
      { id: 'a', saldoActual: 100_000, tasaAnual: 0.1, abonoObjetivo: 10_000 },
      { id: 'b', saldoActual: 500_000, tasaAnual: 0.3, abonoObjetivo: 20_000 },
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
      { id: 'a', saldoActual: 100_000, tasaAnual: 0.1, abonoObjetivo: 10_000 },
      { id: 'b', saldoActual: 50_000, tasaAnual: 0.3, abonoObjetivo: 20_000 },
    ]);
    const asigB = asignaciones.find((a) => a.deudaId === 'b')!;
    const asigA = asignaciones.find((a) => a.deudaId === 'a')!;
    expect(asigB.abonoExtraAsignado).toBe(50_000);
    expect(asigA.abonoExtraAsignado).toBe(100_000);
    expect(asigA.abonoTotal).toBe(110_000);
  });

  it('rechaza un extra no positivo', () => {
    expect(() =>
      priorizarAbonoExtra(0, [{ id: 'a', saldoActual: 1000, tasaAnual: 0.1, abonoObjetivo: 100 }]),
    ).toThrow(RemanenteInsuficienteError);
    expect(() => priorizarAbonoExtra(-500, [])).toThrow(RemanenteInsuficienteError);
  });

  it('con una lista vacía de deudas, no hay nada que asignar', () => {
    expect(priorizarAbonoExtra(10_000, [])).toEqual([]);
  });
});

describe('proyectarConGamificacion', () => {
  const fechaInicio = new Date(Date.UTC(2026, 7, 1, 12)); // 1 de agosto de 2026

  it('con abono extra que ahorra períodos, arma un mensaje positivo y fechas coherentes', () => {
    const p = proyectarConGamificacion(
      { saldoInicial: 1_000_000, tasaAnualNominal: 0.24, abonoBase: 50_000, abonoExtra: 20_000 },
      fechaInicio,
    );
    expect(p.comparacion.periodosAhorrados).toBeGreaterThan(0);
    expect(p.fechaSaldoBase).not.toBeNull();
    expect(p.fechaSaldoConExtra).not.toBeNull();
    expect(p.fechaSaldoConExtra!.getTime()).toBeLessThan(p.fechaSaldoBase!.getTime());
    expect(p.mensaje).toContain('Aceleraste tu libertad financiera');
  });

  it('sin abono extra, el mensaje indica que no hay aceleración y las fechas coinciden', () => {
    const p = proyectarConGamificacion(
      { saldoInicial: 500_000, tasaAnualNominal: 0.18, abonoBase: 40_000, abonoExtra: 0 },
      fechaInicio,
    );
    expect(p.mensaje).toContain('no adelanta');
    expect(p.fechaSaldoBase).toEqual(p.fechaSaldoConExtra);
  });

  it('si no se llega a saldar dentro del tope de períodos, la fecha queda en null', () => {
    const p = proyectarConGamificacion(
      {
        saldoInicial: 1_000_000,
        tasaAnualNominal: 0.24,
        abonoBase: 5_000, // no cubre ni el interés del primer período
        abonoExtra: 0,
        maxPeriodos: 5,
      },
      fechaInicio,
    );
    expect(p.fechaSaldoBase).toBeNull();
    expect(p.fechaSaldoConExtra).toBeNull();
  });
});
