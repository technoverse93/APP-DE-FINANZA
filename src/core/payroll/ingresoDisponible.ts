/**
 * Ingreso disponible de la quincena, según la fórmula predictiva:
 *
 *   Ingreso disponible = (Ingreso base + Ingresos extra del período)
 *                       - (Gasto de transporte proyectado + Gastos diarios
 *                          reales + Otros gastos fijos)
 *
 * Reemplaza la colilla ingresada a mano: en vez de esperar 48 h a que se
 * habilite el campo y transcribir el comprobante de pago real, el ingreso
 * disponible se deriva de lo que ya se anotó en la app (Libro Mayor,
 * transacciones bancarias capturadas, rutas de transporte) más el ingreso
 * base fijo. `distribuirQuincena` sigue decidiendo, sobre este número, cuánto
 * se reserva y cuánto se abona a capital — solo cambia de dónde sale el
 * monto de entrada.
 */

export const INGRESO_BASE_QUINCENAL = 170_000;

export interface ParametrosIngresoDisponible {
  /** Ingreso fijo de la quincena antes de cualquier ajuste. */
  readonly ingresoBase?: number;
  /** Ingresos extra anotados en el período (Libro Mayor, tipo "ingreso"). */
  readonly ingresosExtra: number;
  /** Gasto de transporte proyectado para el período (rutas × días hábiles). */
  readonly transporteProyectado: number;
  /** Gastos diarios reales del período (Libro Mayor + transacciones bancarias). */
  readonly gastosDiariosReales: number;
  /** Gastos fijos que no son transporte: casa, comida, deuda base. */
  readonly otrosGastosFijos: number;
}

function assertNoNegativo(valor: number, nombre: string): void {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new TypeError(`${nombre} debe ser un número finito`);
  }
  if (valor < 0) {
    throw new RangeError(`${nombre} no puede ser negativo`);
  }
}

export function calcularIngresoDisponible(parametros: ParametrosIngresoDisponible): number {
  const ingresoBase = parametros.ingresoBase ?? INGRESO_BASE_QUINCENAL;
  assertNoNegativo(ingresoBase, 'El ingreso base');
  assertNoNegativo(parametros.ingresosExtra, 'Los ingresos extra');
  assertNoNegativo(parametros.transporteProyectado, 'El transporte proyectado');
  assertNoNegativo(parametros.gastosDiariosReales, 'Los gastos diarios reales');
  assertNoNegativo(parametros.otrosGastosFijos, 'Los otros gastos fijos');

  return Math.round(
    ingresoBase +
      parametros.ingresosExtra -
      parametros.transporteProyectado -
      parametros.gastosDiariosReales -
      parametros.otrosGastosFijos,
  );
}
