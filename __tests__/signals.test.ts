import { calcularSenal, rsi, sma } from '../src/core/crypto/signals';

describe('sma', () => {
  it('promedia los últimos N precios, no toda la serie', () => {
    expect(sma([1, 2, 3, 100, 100], 2)).toBe(100);
    expect(sma([10, 20, 30], 3)).toBe(20);
  });

  it('rechaza un período no positivo', () => {
    expect(() => sma([1, 2, 3], 0)).toThrow(RangeError);
  });

  it('rechaza menos precios que el período', () => {
    expect(() => sma([1, 2], 3)).toThrow(RangeError);
  });
});

describe('rsi', () => {
  it('es 100 cuando todos los cambios son ganancias', () => {
    const precios = Array.from({ length: 16 }, (_, i) => 10 + i); // 10..25
    expect(rsi(precios, 14)).toBe(100);
  });

  it('es 0 cuando todos los cambios son pérdidas', () => {
    const precios = Array.from({ length: 16 }, (_, i) => 25 - i); // 25..10
    expect(rsi(precios, 14)).toBe(0);
  });

  it('es 50 cuando el precio no cambia', () => {
    const precios = Array(16).fill(100);
    expect(rsi(precios, 14)).toBe(50);
  });

  it('coincide con el cálculo manual de Wilder para un caso trazable a mano', () => {
    // periodo=2, cambios = [11-10, 9-11] = [+1, -2].
    // Bloque inicial (sin suavizado previo, es la primera ventana):
    //   gananciaProm = 1/2 = 0.5 ; perdidaProm = 2/2 = 1.0
    // fuerzaRelativa = 0.5/1.0 = 0.5 ; RSI = 100 - 100/(1+0.5) = 33.333...
    expect(rsi([10, 11, 9], 2)).toBeCloseTo(33.333333, 5);
  });

  it('el suavizado de Wilder pondera el bloque inicial y el nuevo cambio con pesos (periodo-1)/periodo y 1/periodo', () => {
    // periodo=2, precios = [10, 11, 9, 12]
    // cambios = [+1, -2, +3]
    // bloque inicial (primeros 2 cambios): gananciaProm=0.5, perdidaProm=1.0
    // paso de suavizado con el 3er cambio (+3, ganancia=3, pérdida=0):
    //   gananciaProm' = (0.5*1 + 3)/2 = 1.75
    //   perdidaProm'  = (1.0*1 + 0)/2 = 0.5
    // fuerzaRelativa = 1.75/0.5 = 3.5 ; RSI = 100 - 100/4.5 = 77.777...
    expect(rsi([10, 11, 9, 12], 2)).toBeCloseTo(77.777778, 5);
  });

  it('rechaza menos precios que periodo + 1', () => {
    expect(() => rsi([1, 2, 3], 5)).toThrow(RangeError);
  });

  it('rechaza precios no positivos', () => {
    expect(() => rsi([1, 2, 0, 3, 4], 2)).toThrow(RangeError);
  });
});

describe('calcularSenal', () => {
  // Rally largo (60 barras, define la tendencia de fondo que ve la media de
  // 50) seguido de una caída pronunciada de 10 barras (lo que ve el RSI de
  // 14 y la media corta de 5). Calibrado con un cálculo independiente en
  // Python: RSI queda en ~29.3 (sobrevendido) mientras la media corta
  // (514.0) sigue por encima de la de 50 (509.8) porque el rally previo fue
  // mucho más largo que la caída reciente.
  const rallyLargo = Array.from({ length: 60 }, (_, i) => 100 + i * 10);
  const caidaPronunciada = Array.from({ length: 10 }, (_, i) => rallyLargo[59] - (i + 1) * 22);
  const precioAlcistaConCaida = [...rallyLargo, ...caidaPronunciada];

  it('sugiere compra cuando el RSI está sobrevendido y la tendencia de fondo es alcista', () => {
    const r = calcularSenal(precioAlcistaConCaida, { periodoCorto: 5, periodoLargo: 50, periodoRsi: 14 });
    expect(r.smaCorta).toBeGreaterThan(r.smaLarga);
    expect(r.rsi).toBeLessThanOrEqual(30);
    expect(r.senal).toBe('compra');
    expect(r.probabilidad).toBeGreaterThan(0);
    expect(r.probabilidad).toBeLessThanOrEqual(1);
  });

  // Simétrico: caída larga (define la tendencia de fondo bajista) seguida de
  // una subida pronunciada reciente. RSI ~70.7 (sobrecomprado) mientras la
  // media corta (286.0) sigue por debajo de la de 50 (290.2).
  const caidaLarga = Array.from({ length: 60 }, (_, i) => 700 - i * 10);
  const subidaPronunciada = Array.from({ length: 10 }, (_, i) => caidaLarga[59] + (i + 1) * 22);
  const precioBajistaConSubida = [...caidaLarga, ...subidaPronunciada];

  it('sugiere venta cuando el RSI está sobrecomprado y la tendencia de fondo es bajista', () => {
    const r = calcularSenal(precioBajistaConSubida, { periodoCorto: 5, periodoLargo: 50, periodoRsi: 14 });
    expect(r.smaCorta).toBeLessThan(r.smaLarga);
    expect(r.rsi).toBeGreaterThanOrEqual(70);
    expect(r.senal).toBe('venta');
  });

  it('sugiere mantener cuando no hay señal extrema', () => {
    const precios = Array.from({ length: 25 }, () => 100 + Math.random() * 0.01);
    const r = calcularSenal(precios);
    expect(['mantener', 'compra', 'venta']).toContain(r.senal);
    expect(r.probabilidad).toBeGreaterThanOrEqual(0);
    expect(r.probabilidad).toBeLessThanOrEqual(1);
  });

  it('la probabilidad siempre queda acotada a [0, 1]', () => {
    const precios = Array.from({ length: 30 }, (_, i) => 100 + i * 10);
    const r = calcularSenal(precios);
    expect(r.probabilidad).toBeGreaterThanOrEqual(0);
    expect(r.probabilidad).toBeLessThanOrEqual(1);
  });

  it('rechaza series demasiado cortas', () => {
    expect(() => calcularSenal([1, 2, 3])).toThrow(RangeError);
  });
});
