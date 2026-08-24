import { compararEscenarioIngreso, type ContextoQuincena } from '../src/core/payroll/simulador';
import { INGRESO_BASE_QUINCENAL } from '../src/core/payroll/ingresoDisponible';

/** Quincena sin gastos: el ingreso base llega entero al reparto. */
const SIN_GASTOS: ContextoQuincena = {
  ingresosExtra: 0,
  transporteProyectado: 0,
  gastosDiariosReales: 0,
  otrosGastosFijos: 0,
};

describe('compararEscenarioIngreso', () => {
  it('usa el ingreso base fijo como escenario real por defecto', () => {
    const c = compararEscenarioIngreso({
      ingresoBaseSimulado: 200_000,
      contexto: SIN_GASTOS,
    });
    expect(c.base.ingresoBase).toBe(INGRESO_BASE_QUINCENAL);
    expect(c.base.ingresoDisponible).toBe(170_000);
    expect(c.simulado.ingresoDisponible).toBe(200_000);
    expect(c.diferenciaIngresoDisponible).toBe(30_000);
  });

  it('el abono a capital NO crece igual que el ingreso: la banda absorbe primero', () => {
    // Con 170.000 el remanente cae dentro de la banda (170.000–175.000), así
    // que no hay nada para capital. Con 200.000 solo el excedente sobre el
    // techo de la banda va a capital: 200.000 − 175.000 = 25.000, no 30.000.
    const c = compararEscenarioIngreso({
      ingresoBaseSimulado: 200_000,
      contexto: SIN_GASTOS,
    });
    expect(c.base.distribucion.abonoCapitalSugerido).toBe(0);
    expect(c.simulado.distribucion.abonoCapitalSugerido).toBe(25_000);
    expect(c.diferenciaAbonoCapital).toBe(25_000);
    expect(c.diferenciaAbonoCapital).toBeLessThan(c.diferenciaIngresoDisponible);
  });

  it('resta los gastos del contexto en ambos escenarios por igual', () => {
    const contexto: ContextoQuincena = {
      ingresosExtra: 10_000,
      transporteProyectado: 20_000,
      gastosDiariosReales: 15_000,
      otrosGastosFijos: 5_000,
    };
    const c = compararEscenarioIngreso({ ingresoBaseSimulado: 200_000, contexto });
    // 170.000 + 10.000 − 20.000 − 15.000 − 5.000 = 140.000
    expect(c.base.ingresoDisponible).toBe(140_000);
    expect(c.simulado.ingresoDisponible).toBe(170_000);
    // La diferencia de ingreso base se conserva intacta.
    expect(c.diferenciaIngresoDisponible).toBe(30_000);
  });

  it('acelera la deuda: más ingreso salda en menos quincenas y ahorra intereses', () => {
    const deuda = { saldoActual: 500_000, tasaAnual: 0.24, abonoObjetivo: 50_000 };
    const c = compararEscenarioIngreso({
      ingresoBaseSimulado: 250_000,
      contexto: SIN_GASTOS,
      deuda,
    });
    expect(c.simulado.deuda?.saldado).toBe(true);
    expect(c.quincenasAhorradas).not.toBeNull();
    expect(c.quincenasAhorradas!).toBeGreaterThan(0);
    expect(c.interesAhorrado!).toBeGreaterThan(0);
  });

  it('un ingreso menor al real da diferencias negativas, no un error', () => {
    const c = compararEscenarioIngreso({
      ingresoBaseSimulado: 150_000,
      contexto: SIN_GASTOS,
    });
    expect(c.diferenciaIngresoDisponible).toBe(-20_000);
    expect(c.simulado.distribucion.estado).toBe('deficit');
  });

  it('no compara plazos si alguno de los dos escenarios no llega a saldar', () => {
    // Abono que no cubre ni el interés: la deuda crece y nunca se salda, así
    // que restar períodos daría un ahorro inventado.
    const deuda = { saldoActual: 5_000_000, tasaAnual: 0.6, abonoObjetivo: 1_000 };
    const c = compararEscenarioIngreso({
      ingresoBaseSimulado: 171_000,
      contexto: SIN_GASTOS,
      deuda,
    });
    expect(c.base.deuda?.saldado).toBe(false);
    expect(c.quincenasAhorradas).toBeNull();
    expect(c.interesAhorrado).toBeNull();
  });

  it('sin deuda, la proyección queda en null pero el reparto se calcula igual', () => {
    const c = compararEscenarioIngreso({
      ingresoBaseSimulado: 200_000,
      contexto: SIN_GASTOS,
    });
    expect(c.simulado.deuda).toBeNull();
    expect(c.simulado.distribucion.reserva).toBe(175_000);
  });

  it('rechaza un ingreso simulado inválido', () => {
    expect(() =>
      compararEscenarioIngreso({ ingresoBaseSimulado: Number.NaN, contexto: SIN_GASTOS }),
    ).toThrow(TypeError);
    expect(() =>
      compararEscenarioIngreso({ ingresoBaseSimulado: -1, contexto: SIN_GASTOS }),
    ).toThrow(RangeError);
  });
});
