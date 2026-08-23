/**
 * Costo de transporte proyectado para un rango de fechas (una quincena).
 *
 * El costo diario no es un número fijo: es la suma de los tramos de la ruta
 * del día (Casa -> San José -> Coronado -> ...), que se arma en
 * `rutas_transporte` y se agrega con `useRutasTransporte`. Este módulo solo
 * multiplica ese total diario por los días hábiles del rango.
 *
 * "Días hábiles" acá excluye únicamente el domingo — a diferencia del
 * calendario de pago (`adjustForWeekend`), que también salta el sábado —
 * porque el usuario sí se transporta los sábados, solo no cobra ni recibe
 * la quincena ese día.
 */

function assertNoNegativo(valor: number, nombre: string): void {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new TypeError(`${nombre} debe ser un número finito`);
  }
  if (valor < 0) {
    throw new RangeError(`${nombre} no puede ser negativo`);
  }
}

/** Cuenta los días del rango [desde, hasta) que no caen domingo. */
export function diasHabilesTransporte(desde: Date, hasta: Date): number {
  if (hasta.getTime() < desde.getTime()) {
    throw new RangeError('"hasta" no puede ser anterior a "desde"');
  }

  const cursor = new Date(desde);
  cursor.setUTCHours(0, 0, 0, 0);
  const limite = new Date(hasta);
  limite.setUTCHours(0, 0, 0, 0);

  let dias = 0;
  while (cursor.getTime() < limite.getTime()) {
    if (cursor.getUTCDay() !== 0) dias += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dias;
}

/**
 * Proyecta el costo total de transporte del rango [desde, hasta): el costo
 * diario (suma de los tramos de la ruta) multiplicado por los días hábiles
 * (domingo excluido).
 */
export function calcularCostoTransporteProyectado(
  costoDiarioTotal: number,
  desde: Date,
  hasta: Date,
): number {
  assertNoNegativo(costoDiarioTotal, 'El costo diario de transporte');

  const dias = diasHabilesTransporte(desde, hasta);
  return Math.round(costoDiarioTotal * dias);
}
