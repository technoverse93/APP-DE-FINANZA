import { interesDiario, simularAbonoExtra } from '../src/core/debt/simulacion';

describe('interesDiario', () => {
  it('prorratea la tasa mensual entre 30 días', () => {
    // 300.000 al 3% mensual = 9.000 al mes = 300 por día.
    expect(interesDiario(300_000, 0.03)).toBe(300);
  });

  it('con saldo o tasa en cero, no corre interés', () => {
    expect(interesDiario(0, 0.5)).toBe(0);
    expect(interesDiario(300_000, 0)).toBe(0);
  });
});

describe('simularAbonoExtra', () => {
  it('sin saldo no hay nada que simular', () => {
    expect(
      simularAbonoExtra({
        saldoActual: 0,
        tasaMensualNominal: 0.02,
        abonoObjetivo: 10_000,
        abonoExtra: 5_000,
      }),
    ).toBeNull();
  });

  it('sin cuota ni extra tampoco hay nada que proyectar', () => {
    expect(
      simularAbonoExtra({
        saldoActual: 100_000,
        tasaMensualNominal: 0.02,
        abonoObjetivo: 0,
        abonoExtra: 0,
      }),
    ).toBeNull();
  });

  it('el abono extra se suma sobre la cuota, no la reemplaza', () => {
    const c = simularAbonoExtra({
      saldoActual: 100_000,
      tasaMensualNominal: 0,
      abonoObjetivo: 10_000,
      abonoExtra: 15_000,
    })!;
    expect(c.base?.abonoPorPeriodo).toBe(10_000);
    expect(c.conAbono.abonoPorPeriodo).toBe(25_000);
  });

  it('reporta las quincenas y el porcentaje de plazo que se recortan', () => {
    // Sin interés: 100.000 a 10.000/quincena son 10 quincenas; a 25.000 son 4.
    const c = simularAbonoExtra({
      saldoActual: 100_000,
      tasaMensualNominal: 0,
      abonoObjetivo: 10_000,
      abonoExtra: 15_000,
    })!;
    expect(c.baseSeSalda).toBe(true);
    expect(c.base!.resultado.periodosParaSaldar).toBe(10);
    expect(c.conAbono.resultado.periodosParaSaldar).toBe(4);
    expect(c.quincenasAhorradas).toBe(6);
    expect(c.porcentajePlazoReducido).toBe(60);
    expect(c.mesesAhorrados).toBe(3);
  });

  it('con interés real, el ahorro de intereses es positivo', () => {
    const c = simularAbonoExtra({
      saldoActual: 500_000,
      tasaMensualNominal: 0.04,
      abonoObjetivo: 25_000,
      abonoExtra: 25_000,
    })!;
    expect(c.baseSeSalda).toBe(true);
    expect(c.interesAhorrado).toBeGreaterThan(0);
    expect(c.conAbono.resultado.totalInteresPagado).toBeLessThan(
      c.base!.resultado.totalInteresPagado,
    );
  });

  it('sin cuota fija no hay escenario base: la deuda no se paga sola', () => {
    // El alquiler atrasado real: 300.000 al 55,86% mensual, sin cuota pactada.
    const c = simularAbonoExtra({
      saldoActual: 300_000,
      tasaMensualNominal: 0.5586,
      abonoObjetivo: 0,
      abonoExtra: 50_000,
    })!;
    expect(c.base).toBeNull();
    expect(c.baseSeSalda).toBe(false);
    expect(c.quincenasAhorradas).toBe(0);
    expect(c.porcentajePlazoReducido).toBe(0);
    // Aun sin base contra qué comparar, el costo de un día se sigue diciendo.
    expect(c.interesDiarioActual).toBe(5_586);
  });

  it('si con la sola cuota la deuda nunca se salda, no inventa un ahorro de plazo', () => {
    // La mora crece más rápido de lo que abona la cuota pactada.
    const c = simularAbonoExtra({
      saldoActual: 1_000_000,
      tasaMensualNominal: 0.6,
      abonoObjetivo: 1_000,
      abonoExtra: 500,
    })!;
    expect(c.base).not.toBeNull();
    expect(c.base!.resultado.saldado).toBe(false);
    expect(c.baseSeSalda).toBe(false);
    expect(c.quincenasAhorradas).toBe(0);
    expect(c.interesAhorrado).toBe(0);
  });

  it('el préstamo real (98.000 a 14.000/quincena, 7 cuotas) se acorta al sumarle remanente', () => {
    // El saldo de 98.000 es 14.000 × 7: ya trae los intereses adentro, así
    // que la tasa va en cero. Cargarle ADEMÁS un porcentaje mensual contaría
    // el interés dos veces y haría ver el préstamo como impagable.
    const c = simularAbonoExtra({
      saldoActual: 98_000,
      tasaMensualNominal: 0,
      abonoObjetivo: 14_000,
      abonoExtra: 14_000,
    })!;
    expect(c.baseSeSalda).toBe(true);
    expect(c.base!.resultado.periodosParaSaldar).toBe(7);
    expect(c.conAbono.resultado.periodosParaSaldar).toBe(4);
    expect(c.quincenasAhorradas).toBe(3);
  });
});
