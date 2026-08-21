import {
  calcularEstadoBilletera,
  gananciaNoRealizada,
  puedeComprar,
  puedeVender,
} from '../src/core/crypto/paperTrading';

describe('calcularEstadoBilletera', () => {
  it('sin movimientos, el efectivo es el capital inicial y no hay posición', () => {
    const e = calcularEstadoBilletera(500_000, []);
    expect(e).toEqual({ efectivoDisponible: 500_000, cantidadMoneda: 0, costoPromedio: 0 });
  });

  it('una compra resta efectivo y suma posición al precio pagado', () => {
    const e = calcularEstadoBilletera(500_000, [
      { tipo: 'compra', cantidad: 0.01, precioUnitario: 40_000 },
    ]);
    expect(e.efectivoDisponible).toBe(500_000 - 400);
    expect(e.cantidadMoneda).toBeCloseTo(0.01, 10);
    expect(e.costoPromedio).toBe(40_000);
  });

  it('dos compras a distinto precio dan el costo promedio ponderado', () => {
    const e = calcularEstadoBilletera(1_000_000, [
      { tipo: 'compra', cantidad: 0.01, precioUnitario: 40_000 }, // 400
      { tipo: 'compra', cantidad: 0.01, precioUnitario: 60_000 }, // 600
    ]);
    expect(e.cantidadMoneda).toBeCloseTo(0.02, 10);
    // costo total 1000 / 0.02 = 50,000
    expect(e.costoPromedio).toBeCloseTo(50_000, 6);
  });

  it('una venta parcial devuelve efectivo sin cambiar el costo promedio restante', () => {
    const e = calcularEstadoBilletera(1_000_000, [
      { tipo: 'compra', cantidad: 0.02, precioUnitario: 50_000 }, // costo total 1000
      { tipo: 'venta', cantidad: 0.01, precioUnitario: 70_000 }, // vende la mitad a 70,000
    ]);
    expect(e.cantidadMoneda).toBeCloseTo(0.01, 10);
    // vendió 0.01 a 70,000 = 700 de efectivo recuperado
    expect(e.efectivoDisponible).toBeCloseTo(1_000_000 - 1_000 + 700, 6);
    // el costo promedio de lo que queda sigue siendo 50,000
    expect(e.costoPromedio).toBeCloseTo(50_000, 6);
  });

  it('vender más de lo que hay se recorta a la posición disponible', () => {
    const e = calcularEstadoBilletera(1_000_000, [
      { tipo: 'compra', cantidad: 0.01, precioUnitario: 50_000 },
      { tipo: 'venta', cantidad: 5, precioUnitario: 60_000 }, // mucho más de lo que hay
    ]);
    expect(e.cantidadMoneda).toBe(0);
    // solo se vendió la 0.01 real, a 60,000 = 600
    expect(e.efectivoDisponible).toBeCloseTo(1_000_000 - 500 + 600, 6);
  });

  it('rechaza capital inicial negativo', () => {
    expect(() => calcularEstadoBilletera(-1, [])).toThrow(RangeError);
  });

  it('rechaza un movimiento con cantidad no positiva', () => {
    expect(() =>
      calcularEstadoBilletera(1000, [{ tipo: 'compra', cantidad: 0, precioUnitario: 100 }]),
    ).toThrow(RangeError);
  });

  it('rechaza un movimiento con precio no positivo', () => {
    expect(() =>
      calcularEstadoBilletera(1000, [{ tipo: 'compra', cantidad: 1, precioUnitario: -5 }]),
    ).toThrow(RangeError);
  });
});

describe('puedeComprar', () => {
  it('permite comprar si el efectivo alcanza exactamente', () => {
    const estado = { efectivoDisponible: 1000, cantidadMoneda: 0, costoPromedio: 0 };
    expect(puedeComprar(estado, 0.02, 50_000)).toBe(true);
  });

  it('rechaza si el efectivo no alcanza', () => {
    const estado = { efectivoDisponible: 999, cantidadMoneda: 0, costoPromedio: 0 };
    expect(puedeComprar(estado, 0.02, 50_000)).toBe(false);
  });

  it('rechaza cantidad o precio no positivos', () => {
    const estado = { efectivoDisponible: 1_000_000, cantidadMoneda: 0, costoPromedio: 0 };
    expect(puedeComprar(estado, 0, 100)).toBe(false);
    expect(puedeComprar(estado, 1, 0)).toBe(false);
  });
});

describe('puedeVender', () => {
  it('permite vender hasta la posición completa', () => {
    const estado = { efectivoDisponible: 0, cantidadMoneda: 0.05, costoPromedio: 40_000 };
    expect(puedeVender(estado, 0.05)).toBe(true);
  });

  it('rechaza vender más de lo que hay', () => {
    const estado = { efectivoDisponible: 0, cantidadMoneda: 0.05, costoPromedio: 40_000 };
    expect(puedeVender(estado, 0.06)).toBe(false);
  });
});

describe('gananciaNoRealizada', () => {
  it('es positiva si el precio actual supera el costo promedio', () => {
    const estado = { efectivoDisponible: 0, cantidadMoneda: 0.01, costoPromedio: 40_000 };
    expect(gananciaNoRealizada(estado, 50_000)).toBeCloseTo(100, 6);
  });

  it('es negativa si el precio actual cayó bajo el costo promedio', () => {
    const estado = { efectivoDisponible: 0, cantidadMoneda: 0.01, costoPromedio: 40_000 };
    expect(gananciaNoRealizada(estado, 30_000)).toBeCloseTo(-100, 6);
  });

  it('es cero sin posición abierta', () => {
    const estado = { efectivoDisponible: 1000, cantidadMoneda: 0, costoPromedio: 0 };
    expect(gananciaNoRealizada(estado, 50_000)).toBe(0);
  });
});
