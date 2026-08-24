import {
  fechaPagoIso,
  montoEnQuincena,
  proyectarPorQuincena,
  totalEnQuincena,
  type GastoFijoItem,
} from '../src/core/payroll/gastosFijos';
import { paydaysForMonth } from '../src/core/payroll/schedule';

/** Agosto 2026: el 13 es jueves y el 28 viernes, ninguno se mueve. */
const [Q13, Q28] = paydaysForMonth(2026, 7);

function gasto(parcial: Partial<GastoFijoItem>): GastoFijoItem {
  return {
    id: 'x',
    nombre: 'Casa',
    montoMensual: 150_000,
    modo: 'mitades',
    activo: true,
    ...parcial,
  };
}

describe('modo mitades', () => {
  it('parte el monto mensual entre las dos quincenas', () => {
    const g = gasto({ montoMensual: 150_000 });
    expect(montoEnQuincena(g, Q13)).toBe(75_000);
    expect(montoEnQuincena(g, Q28)).toBe(75_000);
  });

  it('con monto impar, las dos mitades suman exactamente el mensual', () => {
    const g = gasto({ montoMensual: 150_001 });
    expect(montoEnQuincena(g, Q13)).toBe(75_001);
    expect(montoEnQuincena(g, Q28)).toBe(75_000);
    expect(montoEnQuincena(g, Q13) + montoEnQuincena(g, Q28)).toBe(150_001);
  });
});

describe('modo quincena_fija', () => {
  it('cobra todo en la quincena elegida y nada en la otra', () => {
    const g = gasto({ modo: 'quincena_fija', diaNominal: 28 });
    expect(montoEnQuincena(g, Q13)).toBe(0);
    expect(montoEnQuincena(g, Q28)).toBe(150_000);
  });
});

describe('modo diferido', () => {
  it('cobra solo en la fecha de pago indicada', () => {
    const g = gasto({ modo: 'diferido', fechaDiferida: fechaPagoIso(Q28) });
    expect(montoEnQuincena(g, Q13)).toBe(0);
    expect(montoEnQuincena(g, Q28)).toBe(150_000);
  });

  it('no cobra en ninguna quincena de otro mes', () => {
    const g = gasto({ modo: 'diferido', fechaDiferida: fechaPagoIso(Q28) });
    for (const p of paydaysForMonth(2026, 8)) {
      expect(montoEnQuincena(g, p)).toBe(0);
    }
  });
});

describe('gastos inactivos', () => {
  it('no aportan nada sin importar el modo', () => {
    for (const modo of ['mitades', 'quincena_fija', 'diferido'] as const) {
      const g = gasto({ modo, activo: false, diaNominal: 13, fechaDiferida: fechaPagoIso(Q13) });
      expect(montoEnQuincena(g, Q13)).toBe(0);
    }
  });
});

describe('totalEnQuincena', () => {
  it('suma varios gastos con reglas distintas', () => {
    const gastos = [
      gasto({ id: 'casa', montoMensual: 150_000, modo: 'mitades' }),
      gasto({ id: 'luz', nombre: 'Luz', montoMensual: 20_000, modo: 'quincena_fija', diaNominal: 13 }),
      gasto({ id: 'x', nombre: 'Extra', montoMensual: 9_000, modo: 'diferido', fechaDiferida: fechaPagoIso(Q28) }),
    ];
    expect(totalEnQuincena(gastos, Q13)).toBe(75_000 + 20_000);
    expect(totalEnQuincena(gastos, Q28)).toBe(75_000 + 9_000);
  });

  it('sin gastos, el total es 0 (el remanente refleja todo el disponible)', () => {
    expect(totalEnQuincena([], Q13)).toBe(0);
  });
});

describe('proyectarPorQuincena', () => {
  it('cubre las 24 quincenas de un año', () => {
    expect(proyectarPorQuincena([], 2026, 2026)).toHaveLength(24);
  });

  it('proyecta este año y el siguiente de forma continua', () => {
    const p = proyectarPorQuincena([gasto({})], 2026, 2027);
    expect(p).toHaveLength(48);
    // Un gasto en mitades aporta lo mismo en toda quincena de cualquier año.
    expect(p.every((q) => q.total === 75_000)).toBe(true);
  });

  it('devuelve las quincenas en orden cronológico', () => {
    const p = proyectarPorQuincena([], 2026, 2027);
    for (let i = 1; i < p.length; i++) {
      expect(p[i].payday.date.getTime()).toBeGreaterThan(p[i - 1].payday.date.getTime());
    }
  });

  it('un diferido aporta en exactamente una quincena de toda la proyección', () => {
    const g = gasto({ modo: 'diferido', fechaDiferida: fechaPagoIso(Q28) });
    const conMonto = proyectarPorQuincena([g], 2026, 2027).filter((q) => q.total > 0);
    expect(conMonto).toHaveLength(1);
    expect(conMonto[0].total).toBe(150_000);
  });

  it('rechaza un rango de años invertido', () => {
    expect(() => proyectarPorQuincena([], 2027, 2026)).toThrow(RangeError);
  });
});

describe('venceEn', () => {
  it('sin vencimiento, aplica siempre', () => {
    const g = gasto({});
    expect(montoEnQuincena(g, Q13)).toBeGreaterThan(0);
    expect(montoEnQuincena(g, Q28)).toBeGreaterThan(0);
  });

  it('deja de aplicar en la primera quincena posterior al vencimiento', () => {
    const g = gasto({ venceEn: fechaPagoIso(Q13) });
    expect(montoEnQuincena(g, Q13)).toBeGreaterThan(0);
    expect(montoEnQuincena(g, Q28)).toBe(0);
  });

  it('la quincena del propio vencimiento todavía cuenta (inclusive)', () => {
    const g = gasto({ modo: 'quincena_fija', diaNominal: 28, venceEn: fechaPagoIso(Q28) });
    expect(montoEnQuincena(g, Q28)).toBeGreaterThan(0);
  });
});
