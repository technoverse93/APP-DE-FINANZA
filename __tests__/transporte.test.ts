import { calcularCostoTransporteProyectado, diasHabilesTransporte } from '../src/core/payroll/transporte';

describe('diasHabilesTransporte', () => {
  it('cuenta los 15 días de una quincena excluyendo los domingos', () => {
    // 2026-08-13 es jueves; el rango [13, 28) tiene 15 días y dos domingos (16 y 23).
    const desde = new Date(Date.UTC(2026, 7, 13));
    const hasta = new Date(Date.UTC(2026, 7, 28));
    expect(diasHabilesTransporte(desde, hasta)).toBe(13);
  });

  it('no excluye el sábado', () => {
    // Lunes a sábado de la misma semana: 6 días, ningún domingo.
    const desde = new Date(Date.UTC(2026, 7, 10)); // lunes
    const hasta = new Date(Date.UTC(2026, 7, 16)); // domingo (exclusivo)
    expect(diasHabilesTransporte(desde, hasta)).toBe(6);
  });

  it('devuelve 0 para un rango vacío', () => {
    const fecha = new Date(Date.UTC(2026, 7, 13));
    expect(diasHabilesTransporte(fecha, fecha)).toBe(0);
  });

  it('lanza RangeError si "hasta" es anterior a "desde"', () => {
    const desde = new Date(Date.UTC(2026, 7, 13));
    const hasta = new Date(Date.UTC(2026, 7, 1));
    expect(() => diasHabilesTransporte(desde, hasta)).toThrow(RangeError);
  });
});

describe('calcularCostoTransporteProyectado', () => {
  it('multiplica el costo diario × días hábiles', () => {
    const desde = new Date(Date.UTC(2026, 7, 13));
    const hasta = new Date(Date.UTC(2026, 7, 28)); // 13 días hábiles (ver arriba)
    expect(calcularCostoTransporteProyectado(1_000, desde, hasta)).toBe(1_000 * 13);
  });

  it('rechaza un costo diario negativo', () => {
    const fecha = new Date(Date.UTC(2026, 7, 13));
    expect(() => calcularCostoTransporteProyectado(-500, fecha, fecha)).toThrow(RangeError);
  });
});
