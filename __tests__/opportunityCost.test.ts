import { calcularCostoOportunidad } from '../src/core/analytics/opportunityCost';

const DEUDA_CARA = {
  id: 'cara',
  nombre: 'Tarjeta',
  saldoActual: 1_000_000,
  tasaAnual: 0.36,
  abonoObjetivo: 50_000,
};

const DEUDA_BARATA = {
  id: 'barata',
  nombre: 'Préstamo personal',
  saldoActual: 1_000_000,
  tasaAnual: 0.12,
  abonoObjetivo: 50_000,
};

describe('calcularCostoOportunidad', () => {
  it('devuelve null sin deudas', () => {
    expect(calcularCostoOportunidad(5_000, [])).toBeNull();
  });

  it('devuelve null con un monto inválido', () => {
    expect(calcularCostoOportunidad(0, [DEUDA_CARA])).toBeNull();
    expect(calcularCostoOportunidad(-100, [DEUDA_CARA])).toBeNull();
  });

  it('devuelve null si la deuda prioritaria no tiene abono objetivo', () => {
    const sinAbono = { ...DEUDA_CARA, abonoObjetivo: 0 };
    expect(calcularCostoOportunidad(5_000, [sinAbono])).toBeNull();
  });

  it('elige la deuda de mayor tasa entre varias como prioritaria', () => {
    const resultado = calcularCostoOportunidad(200_000, [DEUDA_BARATA, DEUDA_CARA]);
    expect(resultado?.deudaId).toBe('cara');
  });

  it('un monto chico frente al saldo no adelanta ninguna quincena', () => {
    const resultado = calcularCostoOportunidad(100, [DEUDA_CARA]);
    expect(resultado).not.toBeNull();
    expect(resultado?.periodosAdelantados).toBe(0);
    expect(resultado?.mensaje).toMatch(/monto chico/);
  });

  it('un monto significativo adelanta períodos y ahorra interés', () => {
    const resultado = calcularCostoOportunidad(300_000, [DEUDA_CARA]);
    expect(resultado).not.toBeNull();
    expect(resultado?.periodosAdelantados).toBeGreaterThan(0);
    expect(resultado?.interesAhorrado).toBeGreaterThan(0);
    expect(resultado?.mensaje).toMatch(/quincenas antes/);
  });
});
