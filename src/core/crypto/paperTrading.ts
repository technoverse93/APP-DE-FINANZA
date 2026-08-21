/**
 * Billetera de papel: efectivo virtual y posición, derivados de la bitácora
 * de movimientos en vez de una columna que se actualiza aparte (mismo motivo
 * que el resumen del Libro Mayor: recalcular desde la fuente evita que se
 * desincronice). Costo promedio, no FIFO/LIFO: es el método estándar para un
 * simulador retail y el más simple de mostrarle a una persona.
 */

export type TipoMovimientoCripto = 'compra' | 'venta';

export interface MovimientoCripto {
  readonly tipo: TipoMovimientoCripto;
  readonly cantidad: number;
  readonly precioUnitario: number;
}

export interface EstadoBilletera {
  readonly efectivoDisponible: number;
  readonly cantidadMoneda: number;
  readonly costoPromedio: number;
}

function assertMovimientoValido(m: MovimientoCripto): void {
  if (!Number.isFinite(m.cantidad) || m.cantidad <= 0) {
    throw new RangeError('La cantidad de un movimiento debe ser positiva');
  }
  if (!Number.isFinite(m.precioUnitario) || m.precioUnitario <= 0) {
    throw new RangeError('El precio unitario de un movimiento debe ser positivo');
  }
}

/**
 * Reproduce la bitácora de movimientos en orden y devuelve el estado final
 * de la billetera. Una venta que exceda la posición disponible se recorta a
 * lo que hay: la bitácora puede traer movimientos ya validados en su
 * momento, pero esta función no asume que la app fue la única que la llenó.
 */
export function calcularEstadoBilletera(
  capitalInicial: number,
  movimientos: readonly MovimientoCripto[],
): EstadoBilletera {
  if (!Number.isFinite(capitalInicial) || capitalInicial < 0) {
    throw new RangeError('El capital inicial debe ser un número finito no negativo');
  }

  let efectivo = capitalInicial;
  let cantidad = 0;
  let costoTotal = 0; // costoPromedio * cantidad, se mantiene como total para no perder precisión

  for (const m of movimientos) {
    assertMovimientoValido(m);
    if (m.tipo === 'compra') {
      efectivo -= m.cantidad * m.precioUnitario;
      costoTotal += m.cantidad * m.precioUnitario;
      cantidad += m.cantidad;
    } else {
      const cantidadVendida = Math.min(m.cantidad, cantidad);
      const costoPromedioActual = cantidad > 0 ? costoTotal / cantidad : 0;
      efectivo += cantidadVendida * m.precioUnitario;
      costoTotal -= cantidadVendida * costoPromedioActual;
      cantidad -= cantidadVendida;
    }
  }

  return {
    efectivoDisponible: efectivo,
    cantidadMoneda: cantidad,
    costoPromedio: cantidad > 0 ? costoTotal / cantidad : 0,
  };
}

/** ¿Alcanza el efectivo disponible para esta compra? Pura validación, no ejecuta nada. */
export function puedeComprar(
  estado: EstadoBilletera,
  cantidad: number,
  precioUnitario: number,
): boolean {
  return cantidad > 0 && precioUnitario > 0 && cantidad * precioUnitario <= estado.efectivoDisponible;
}

/** ¿Hay suficiente posición para vender esta cantidad? */
export function puedeVender(estado: EstadoBilletera, cantidad: number): boolean {
  return cantidad > 0 && cantidad <= estado.cantidadMoneda;
}

/** Ganancia o pérdida no realizada de la posición abierta, a un precio dado. */
export function gananciaNoRealizada(estado: EstadoBilletera, precioActual: number): number {
  return (precioActual - estado.costoPromedio) * estado.cantidadMoneda;
}
