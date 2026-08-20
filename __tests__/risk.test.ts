import {
  caidaMaxima,
  clasificarRiesgo,
  desviacionEstandar,
  rendimientoAnualizado,
  retornosDesdesPrecios,
  volatilidadAnualizada,
} from '../src/core/investment/risk';

describe('retornosDesdesPrecios', () => {
  it('calcula el retorno simple entre precios consecutivos', () => {
    expect(retornosDesdesPrecios([100, 110, 99])).toEqual([0.1, -0.1]);
  });

  it('rechaza series de menos de dos precios', () => {
    expect(() => retornosDesdesPrecios([100])).toThrow(RangeError);
  });

  it('rechaza precios no positivos', () => {
    expect(() => retornosDesdesPrecios([100, 0])).toThrow(RangeError);
  });
});

describe('desviacionEstandar', () => {
  it('es cero para retornos constantes', () => {
    expect(desviacionEstandar([0.01, 0.01, 0.01])).toBe(0);
  });

  it('calcula la desviación estándar muestral (n-1)', () => {
    // Media 0, valores [-0.02, 0.02]: varianza muestral = (0.02² + 0.02²)/1 = 0.0008
    const sd = desviacionEstandar([-0.02, 0.02]);
    expect(sd).toBeCloseTo(Math.sqrt(0.0008), 10);
  });

  it('rechaza menos de dos retornos', () => {
    expect(() => desviacionEstandar([0.01])).toThrow(RangeError);
  });
});

describe('volatilidadAnualizada', () => {
  it('escala la desviación estándar por sqrt(periodos por año)', () => {
    const retornos = [0.01, -0.01, 0.02, -0.02];
    const sd = desviacionEstandar(retornos);
    expect(volatilidadAnualizada(retornos, 24)).toBeCloseTo(sd * Math.sqrt(24), 10);
  });
});

describe('caidaMaxima', () => {
  it('es cero si los precios nunca bajan', () => {
    expect(caidaMaxima([100, 105, 110, 120])).toBe(0);
  });

  it('mide la peor caída desde cualquier pico, no solo el primero', () => {
    // Pico en 120, valle en 90: caída de -25%. La subida a 130 después no cuenta.
    expect(caidaMaxima([100, 120, 90, 130])).toBeCloseTo(-0.25, 10);
  });

  it('acumula caídas consecutivas contra el mismo pico', () => {
    expect(caidaMaxima([100, 90, 80])).toBeCloseTo(-0.2, 10);
  });
});

describe('rendimientoAnualizado', () => {
  it('anualiza un retorno constante por periodo', () => {
    // 1% cada quincena, 24 quincenas al año: (1.01)^24 - 1
    const r = rendimientoAnualizado([0.01, 0.01, 0.01], 24);
    expect(r).toBeCloseTo(Math.pow(1.01, 24) - 1, 10);
  });

  it('es negativo si los retornos promedian pérdida', () => {
    expect(rendimientoAnualizado([-0.01, -0.02], 24)).toBeLessThan(0);
  });
});

describe('clasificarRiesgo', () => {
  it('clasifica bajo, medio y alto según los umbrales documentados', () => {
    expect(clasificarRiesgo(0.1)).toBe('bajo');
    expect(clasificarRiesgo(0.2)).toBe('medio');
    expect(clasificarRiesgo(0.3)).toBe('alto');
  });

  it('los límites son consistentes: 0.15 ya es medio, 0.25 ya es alto', () => {
    expect(clasificarRiesgo(0.15)).toBe('medio');
    expect(clasificarRiesgo(0.25)).toBe('alto');
  });
});
