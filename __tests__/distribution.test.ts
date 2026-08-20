import {
  DEFAULT_SAFETY_BAND,
  distribuirQuincena,
  formatearColones,
  GastosFijos,
  SAFETY_MAX,
  SAFETY_MIN,
  totalGastosFijos,
} from '../src/core/payroll/distribution';

const gastos: GastosFijos = {
  casa: 150_000,
  comida: 90_000,
  pases: 30_000,
  deudaBase: 80_000,
};

const TOTAL_FIJOS = 350_000;

describe('totalGastosFijos', () => {
  it('suma las cuatro categorías', () => {
    expect(totalGastosFijos(gastos)).toBe(TOTAL_FIJOS);
  });
});

describe('distribuirQuincena', () => {
  it('resta los gastos fijos de la colilla', () => {
    const r = distribuirQuincena({ colilla: 600_000, gastosFijos: gastos });
    expect(r.totalGastosFijos).toBe(TOTAL_FIJOS);
    expect(r.remanente).toBe(250_000);
  });

  it('abona a capital solo el excedente sobre el techo de la banda', () => {
    // Remanente 250.000 - techo 175.000 = 75.000
    const r = distribuirQuincena({ colilla: 600_000, gastosFijos: gastos });
    expect(r.estado).toBe('holgado');
    expect(r.reserva).toBe(SAFETY_MAX);
    expect(r.abonoCapitalSugerido).toBe(75_000);
  });

  it('ofrece el rango entre conservar el techo y conservar el piso', () => {
    const r = distribuirQuincena({ colilla: 600_000, gastosFijos: gastos });
    expect(r.abonoCapitalRango).toEqual({ min: 75_000, max: 80_000 });
    // La diferencia del rango es exactamente el ancho de la banda.
    expect(r.abonoCapitalRango.max - r.abonoCapitalRango.min).toBe(SAFETY_MAX - SAFETY_MIN);
  });

  it('nunca deja la reserva por debajo del piso cuando hay holgura', () => {
    const r = distribuirQuincena({ colilla: 600_000, gastosFijos: gastos });
    expect(r.reserva).toBeGreaterThanOrEqual(SAFETY_MIN);
  });

  it('conserva todo el remanente sin abonar cuando cae dentro de la banda', () => {
    // Remanente exacto de 172.000, dentro de 170.000-175.000.
    const r = distribuirQuincena({ colilla: TOTAL_FIJOS + 172_000, gastosFijos: gastos });
    expect(r.estado).toBe('ajustado');
    expect(r.remanente).toBe(172_000);
    expect(r.reserva).toBe(172_000);
    expect(r.abonoCapitalSugerido).toBe(0);
  });

  it('trata el piso de la banda como parte de la banda', () => {
    const r = distribuirQuincena({ colilla: TOTAL_FIJOS + SAFETY_MIN, gastosFijos: gastos });
    expect(r.estado).toBe('ajustado');
    expect(r.faltante).toBe(0);
    expect(r.abonoCapitalSugerido).toBe(0);
  });

  it('trata el techo de la banda como parte de la banda', () => {
    const r = distribuirQuincena({ colilla: TOTAL_FIJOS + SAFETY_MAX, gastosFijos: gastos });
    expect(r.estado).toBe('ajustado');
    expect(r.reserva).toBe(SAFETY_MAX);
    expect(r.abonoCapitalSugerido).toBe(0);
  });

  it('abona un colón apenas se supera el techo', () => {
    const r = distribuirQuincena({ colilla: TOTAL_FIJOS + SAFETY_MAX + 1, gastosFijos: gastos });
    expect(r.estado).toBe('holgado');
    expect(r.abonoCapitalSugerido).toBe(1);
  });

  it('reporta déficit y cuánto falta cuando no se alcanza el piso', () => {
    const r = distribuirQuincena({ colilla: TOTAL_FIJOS + 120_000, gastosFijos: gastos });
    expect(r.estado).toBe('deficit');
    expect(r.remanente).toBe(120_000);
    expect(r.faltante).toBe(SAFETY_MIN - 120_000);
    expect(r.abonoCapitalSugerido).toBe(0);
    expect(r.reserva).toBe(120_000);
  });

  it('nunca sugiere abonar en déficit', () => {
    const r = distribuirQuincena({ colilla: 400_000, gastosFijos: gastos });
    expect(r.estado).toBe('deficit');
    expect(r.abonoCapitalRango).toEqual({ min: 0, max: 0 });
  });

  it('maneja una colilla menor que los gastos fijos sin reserva negativa', () => {
    const r = distribuirQuincena({ colilla: 200_000, gastosFijos: gastos });
    expect(r.remanente).toBe(-150_000);
    expect(r.reserva).toBe(0);
    expect(r.faltante).toBe(SAFETY_MIN + 150_000);
  });

  it('la reserva más el abono nunca exceden el remanente', () => {
    for (const colilla of [400_000, 520_000, 525_000, 530_000, 600_000, 1_200_000]) {
      const r = distribuirQuincena({ colilla, gastosFijos: gastos });
      expect(r.reserva + r.abonoCapitalSugerido).toBeLessThanOrEqual(Math.max(r.remanente, 0));
    }
  });

  it('redondea a colones enteros', () => {
    const r = distribuirQuincena({
      colilla: 600_000.4,
      gastosFijos: { ...gastos, casa: 150_000.3 },
    });
    expect(Number.isInteger(r.remanente)).toBe(true);
    expect(Number.isInteger(r.abonoCapitalSugerido)).toBe(true);
  });

  it('acepta una banda personalizada', () => {
    const r = distribuirQuincena({
      colilla: 600_000,
      gastosFijos: gastos,
      banda: { min: 100_000, max: 100_000 },
    });
    expect(r.reserva).toBe(100_000);
    expect(r.abonoCapitalSugerido).toBe(150_000);
  });

  it('usa la banda de 170.000-175.000 por defecto', () => {
    expect(DEFAULT_SAFETY_BAND).toEqual({ min: 170_000, max: 175_000 });
  });

  it('rechaza montos negativos', () => {
    expect(() => distribuirQuincena({ colilla: -1, gastosFijos: gastos })).toThrow(RangeError);
    expect(() =>
      distribuirQuincena({ colilla: 600_000, gastosFijos: { ...gastos, casa: -1 } }),
    ).toThrow(RangeError);
  });

  it('rechaza valores no finitos', () => {
    expect(() => distribuirQuincena({ colilla: NaN, gastosFijos: gastos })).toThrow(TypeError);
  });

  it('rechaza una banda invertida', () => {
    expect(() =>
      distribuirQuincena({ colilla: 600_000, gastosFijos: gastos, banda: { min: 200, max: 100 } }),
    ).toThrow(RangeError);
  });
});

describe('formatearColones', () => {
  it('antepone el símbolo y agrupa miles', () => {
    expect(formatearColones(175_000)).toBe('₡175,000');
  });

  it('mantiene el signo en negativos', () => {
    expect(formatearColones(-5_000)).toBe('-₡5,000');
  });
});
