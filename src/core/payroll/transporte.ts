/**
 * Costo de transporte proyectado para un rango de fechas (una quincena).
 *
 * Fórmula: (cantidad de pases diarios × costo por pase) × días hábiles del
 * rango. "Días hábiles" acá excluye únicamente el domingo — a diferencia del
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
 * Proyecta el costo total de transporte del rango [desde, hasta), asumiendo
 * la misma cantidad de pases todos los días hábiles (domingo excluido).
 */
export function calcularCostoPasesProyectado(
  cantidadPasesDiarios: number,
  costoPorPase: number,
  desde: Date,
  hasta: Date,
): number {
  assertNoNegativo(cantidadPasesDiarios, 'La cantidad de pases diarios');
  assertNoNegativo(costoPorPase, 'El costo por pase');

  const dias = diasHabilesTransporte(desde, hasta);
  return Math.round(cantidadPasesDiarios * costoPorPase * dias);
}
