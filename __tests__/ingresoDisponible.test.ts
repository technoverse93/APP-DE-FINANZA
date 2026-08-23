import {
  calcularIngresoDisponible,
  INGRESO_BASE_QUINCENAL,
} from '../src/core/payroll/ingresoDisponible';

describe('calcularIngresoDisponible', () => {
  it('con todo en cero, devuelve el ingreso base', () => {
    const r = calcularIngresoDisponible({
      ingresosExtra: 0,
      transporteProyectado: 0,
      gastosDiariosReales: 0,
      otrosGastosFijos: 0,
    });
    expect(r).toBe(INGRESO_BASE_QUINCENAL);
  });

  it('suma los ingresos extra y resta transporte, gastos reales y otros fijos', () => {
    const r = calcularIngresoDisponible({
      ingresosExtra: 50_000,
      transporteProyectado: 20_000,
      gastosDiariosReales: 30_000,
      otrosGastosFijos: 100_000,
    });
    expect(r).toBe(170_000 + 50_000 - 20_000 - 30_000 - 100_000);
  });

  it('puede dar negativo cuando los gastos superan el ingreso: no lanza', () => {
    const r = calcularIngresoDisponible({
      ingresosExtra: 0,
      transporteProyectado: 50_000,
      gastosDiariosReales: 80_000,
      otrosGastosFijos: 100_000,
    });
    expect(r).toBeLessThan(0);
  });

  it('permite reemplazar el ingreso base por defecto', () => {
    const r = calcularIngresoDisponible({
      ingresoBase: 200_000,
      ingresosExtra: 0,
      transporteProyectado: 0,
      gastosDiariosReales: 0,
      otrosGastosFijos: 0,
    });
    expect(r).toBe(200_000);
  });

  it('rechaza componentes negativos de entrada', () => {
    const base = {
      ingresosExtra: 0,
      transporteProyectado: 0,
      gastosDiariosReales: 0,
      otrosGastosFijos: 0,
    };
    expect(() => calcularIngresoDisponible({ ...base, ingresosExtra: -1 })).toThrow(RangeError);
    expect(() => calcularIngresoDisponible({ ...base, otrosGastosFijos: -1 })).toThrow(RangeError);
  });
});
