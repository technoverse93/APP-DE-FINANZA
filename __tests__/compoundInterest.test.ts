import {
  proyectarInteresCompuesto,
  tasaPorPeriodo,
} from '../src/core/investment/compoundInterest';

describe('tasaPorPeriodo', () => {
  it('compone correctamente: doce periodos mensuales reproducen la tasa anual', () => {
    const mensual = tasaPorPeriodo(0.12, 12);
    const anualReconstruida = Math.pow(1 + mensual, 12) - 1;
    expect(anualReconstruida).toBeCloseTo(0.12, 10);
  });

  it('no es lo mismo que dividir la tasa anual entre los periodos', () => {
    const mensual = tasaPorPeriodo(0.12, 12);
    expect(mensual).toBeLessThan(0.12 / 12);
  });

  it('rechaza periodos no positivos', () => {
    expect(() => tasaPorPeriodo(0.1, 0)).toThrow(RangeError);
  });
});

describe('proyectarInteresCompuesto', () => {
  it('sin aportes, reproduce el interés compuesto simple', () => {
    // ₡100,000 al 10% anual durante 1 año, un solo periodo (anual).
    const r = proyectarInteresCompuesto({
      principalInicial: 100_000,
      aportePeriodico: 0,
      tasaAnualEsperada: 0.1,
      periodosPorAnio: 1,
      numPeriodos: 1,
    });
    expect(r.valorFinal).toBeCloseTo(110_000, 6);
    expect(r.totalAportado).toBe(100_000);
    expect(r.totalGanancia).toBeCloseTo(10_000, 6);
  });

  it('sin principal, con un solo aporte no gana nada (se acaba de poner)', () => {
    const r = proyectarInteresCompuesto({
      principalInicial: 0,
      aportePeriodico: 50_000,
      tasaAnualEsperada: 0.1,
      periodosPorAnio: 24,
      numPeriodos: 1,
    });
    expect(r.valorFinal).toBeCloseTo(50_000, 6);
    expect(r.totalGanancia).toBeCloseTo(0, 6);
  });

  it('la serie tiene numPeriodos + 1 puntos, empezando en el principal', () => {
    const r = proyectarInteresCompuesto({
      principalInicial: 200_000,
      aportePeriodico: 75_000,
      tasaAnualEsperada: 0.08,
      periodosPorAnio: 24,
      numPeriodos: 24,
    });
    expect(r.serie).toHaveLength(25);
    expect(r.serie[0]).toBe(200_000);
    expect(r.serie[r.serie.length - 1]).toBeCloseTo(r.valorFinal, 6);
  });

  it('el total aportado es principal más aportes, sin contar ganancia', () => {
    const r = proyectarInteresCompuesto({
      principalInicial: 200_000,
      aportePeriodico: 75_000,
      tasaAnualEsperada: 0.08,
      periodosPorAnio: 24,
      numPeriodos: 24,
    });
    expect(r.totalAportado).toBe(200_000 + 75_000 * 24);
    expect(r.valorFinal).toBeGreaterThan(r.totalAportado);
  });

  it('con tasa cero, el valor final es exactamente principal más aportes', () => {
    const r = proyectarInteresCompuesto({
      principalInicial: 100_000,
      aportePeriodico: 10_000,
      tasaAnualEsperada: 0,
      periodosPorAnio: 24,
      numPeriodos: 10,
    });
    expect(r.valorFinal).toBe(200_000);
    expect(r.totalGanancia).toBe(0);
  });

  it('con cero periodos, el valor final es el principal', () => {
    const r = proyectarInteresCompuesto({
      principalInicial: 300_000,
      aportePeriodico: 20_000,
      tasaAnualEsperada: 0.1,
      periodosPorAnio: 24,
      numPeriodos: 0,
    });
    expect(r.valorFinal).toBe(300_000);
    expect(r.serie).toEqual([300_000]);
  });

  it('rechaza principal o aporte negativo', () => {
    expect(() =>
      proyectarInteresCompuesto({
        principalInicial: -1,
        aportePeriodico: 0,
        tasaAnualEsperada: 0.1,
        periodosPorAnio: 24,
        numPeriodos: 1,
      }),
    ).toThrow(RangeError);
  });

  it('rechaza numPeriodos no entero', () => {
    expect(() =>
      proyectarInteresCompuesto({
        principalInicial: 0,
        aportePeriodico: 0,
        tasaAnualEsperada: 0.1,
        periodosPorAnio: 24,
        numPeriodos: 1.5,
      }),
    ).toThrow(RangeError);
  });
});
