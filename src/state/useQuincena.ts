import { useMemo } from 'react';
import { nextPayday, type Payday } from '../core/payroll/schedule';

/**
 * Próximo día de pago.
 *
 * Antes este hook también leía y guardaba `gastos_fijos` (casa/comida/deuda
 * base): esa tabla aplicaba el monto completo a CADA quincena por igual, el
 * mismo bug que "Gastos fijos del mes" (`gastos_fijos_items`, con reparto de
 * verdad) vino a corregir. Las dos convivían y confundían — un mismo gasto
 * podía terminar cargado dos veces, una en cada sistema. Se retira acá
 * porque se confirmó en cero antes de quitarlo: no había ningún monto real
 * que migrar.
 */
export function useQuincena(ahora?: Date) {
  // Fija el "ahora" con useMemo para que su identidad no cambie en cada
  // render y no dispare recálculos de más.
  const momento = useMemo(() => ahora ?? new Date(), [ahora]);
  const payday = useMemo(() => nextPayday(momento), [momento]);

  return { payday };
}
