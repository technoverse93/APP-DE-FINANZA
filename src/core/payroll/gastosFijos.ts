/**
 * Gastos fijos con reparto entre quincenas.
 *
 * El modelo viejo (`gastos_fijos`: una fila con casa/comida/pases/deuda_base)
 * no permite decir CUÁNDO se paga cada cosa: aplicaba el monto completo a
 * cada quincena por igual. Un alquiler de 150.000 al mes no es 150.000 por
 * quincena, y a veces conviene correrlo a la quincena siguiente.
 *
 * Acá cada gasto es una fila propia con su regla de reparto:
 *
 *  - `mitades`: el monto mensual se parte entre las dos quincenas del mes.
 *    Con un monto impar, la quincena del 13 se lleva el colón de más para
 *    que la suma de las dos dé exactamente el monto mensual.
 *  - `quincena_fija`: todo el monto cae en una sola quincena del mes, la del
 *    día nominal indicado (13 o 28).
 *  - `diferido`: todo el monto cae en UNA fecha de pago concreta y en
 *    ninguna otra. Sirve para posponer ("pagalo en la quincena que viene" o
 *    "en la tercera a futuro"): la UI resuelve la fecha con
 *    `avanzarNPeriodos` y la guarda acá.
 *
 * La proyección multianual sale gratis de este diseño: la regla se evalúa
 * contra un `Payday` cualquiera, así que proyectar el año que viene es
 * recorrer los días de pago de ese año — no hay estado acumulado ni
 * "quincena actual" implícita.
 */

import { paydaysForMonth, type Payday } from './schedule';

export type ModoReparto = 'mitades' | 'quincena_fija' | 'diferido';

export interface GastoFijoItem {
  readonly id: string;
  readonly nombre: string;
  /** Monto total del mes, antes de repartir. */
  readonly montoMensual: number;
  readonly modo: ModoReparto;
  /** Solo para `quincena_fija`: en qué quincena del mes cae todo el monto. */
  readonly diaNominal?: 13 | 28;
  /** Solo para `diferido`: la única fecha de pago en que aplica (YYYY-MM-DD). */
  readonly fechaDiferida?: string;
  readonly activo: boolean;
}

/** Los colones no se manejan en fracciones. */
function aColones(valor: number): number {
  return Math.round(valor);
}

/** Fecha de pago en `YYYY-MM-DD`, la misma forma en que se guarda en Postgres. */
export function fechaPagoIso(payday: Payday): string {
  return payday.date.toISOString().slice(0, 10);
}

/**
 * Cuánto de este gasto corresponde pagar en una quincena concreta.
 *
 * Un gasto inactivo aporta 0 sin importar el modo: se conserva la fila para
 * no perder el historial, pero deja de pesar en el cálculo.
 */
export function montoEnQuincena(gasto: GastoFijoItem, payday: Payday): number {
  if (!gasto.activo || gasto.montoMensual <= 0) return 0;

  switch (gasto.modo) {
    case 'mitades': {
      const mitad = gasto.montoMensual / 2;
      // El 13 se lleva hacia arriba y el 28 hacia abajo, así la suma de las
      // dos quincenas da exactamente el monto mensual aunque sea impar.
      return payday.nominalDay === 13 ? Math.ceil(mitad) : Math.floor(mitad);
    }
    case 'quincena_fija':
      return payday.nominalDay === gasto.diaNominal ? aColones(gasto.montoMensual) : 0;
    case 'diferido':
      return fechaPagoIso(payday) === gasto.fechaDiferida ? aColones(gasto.montoMensual) : 0;
  }
}

/** Total de gastos fijos que caen en una quincena. */
export function totalEnQuincena(
  gastos: readonly GastoFijoItem[],
  payday: Payday,
): number {
  return gastos.reduce((suma, g) => suma + montoEnQuincena(g, payday), 0);
}

export interface QuincenaProyectada {
  readonly payday: Payday;
  readonly total: number;
}

/**
 * Proyecta el total de gastos fijos de cada quincena entre dos años
 * (inclusive), en orden cronológico.
 *
 * @throws {RangeError} si `anioHasta` es anterior a `anioDesde`.
 */
export function proyectarPorQuincena(
  gastos: readonly GastoFijoItem[],
  anioDesde: number,
  anioHasta: number,
): QuincenaProyectada[] {
  if (anioHasta < anioDesde) {
    throw new RangeError('El año final no puede ser anterior al inicial');
  }

  const proyeccion: QuincenaProyectada[] = [];
  for (let anio = anioDesde; anio <= anioHasta; anio++) {
    for (let mes = 0; mes < 12; mes++) {
      for (const payday of paydaysForMonth(anio, mes)) {
        proyeccion.push({ payday, total: totalEnQuincena(gastos, payday) });
      }
    }
  }
  return proyeccion;
}
