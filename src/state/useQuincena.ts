import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  distribuirQuincena,
  type DistribucionQuincenal,
  type GastosFijos,
} from '../core/payroll/distribution';
import {
  colillaWindow,
  isColillaInputEnabled,
  nextPayday,
  type Payday,
} from '../core/payroll/schedule';
import { supabase } from '../lib/supabase';

const GASTOS_VACIOS: GastosFijos = { casa: 0, comida: 0, pases: 0, deudaBase: 0 };

interface EstadoQuincena {
  readonly payday: Payday;
  readonly ventanaAbierta: boolean;
  readonly abreEl: Date;
  readonly gastosFijos: GastosFijos;
  readonly distribucion: DistribucionQuincenal | null;
  readonly cargando: boolean;
  readonly error: string | null;
}

/**
 * Estado de la quincena en curso: próximo pago, si la ventana de la colilla
 * está abierta y la distribución resultante del monto ingresado.
 */
export function useQuincena(ahora?: Date) {
  const [gastosFijos, setGastosFijos] = useState<GastosFijos>(GASTOS_VACIOS);
  const [colilla, setColilla] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `ahora ?? new Date()` como valor por defecto de un parámetro se evalúa
  // en cada llamada: sin fijarlo acá, cada render de quien llama a
  // useQuincena() sin argumento produce un Date con identidad nueva, lo que
  // invalida los useMemo de abajo en cada render (Date no tiene igualdad por
  // valor) aunque el minuto real no haya cambiado. Memoizado con
  // dependencia `[ahora]`, que es `undefined` de forma estable entre
  // renders, el momento queda fijo mientras el componente esté montado.
  const momento = useMemo(() => ahora ?? new Date(), [ahora]);

  const payday = useMemo(() => nextPayday(momento), [momento]);
  const ventanaAbierta = useMemo(
    () => isColillaInputEnabled(momento, payday),
    [momento, payday],
  );
  const abreEl = useMemo(() => colillaWindow(payday).opensAt, [payday]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('gastos_fijos')
        .select('casa, comida, pases, deuda_base')
        .maybeSingle();
      if (e) throw e;
      if (data) {
        setGastosFijos({
          casa: Number(data.casa),
          comida: Number(data.comida),
          pases: Number(data.pases),
          deudaBase: Number(data.deuda_base),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los gastos fijos');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const distribucion = useMemo(
    () => (colilla === null ? null : distribuirQuincena({ colilla, gastosFijos })),
    [colilla, gastosFijos],
  );

  const estado: EstadoQuincena = {
    payday,
    ventanaAbierta,
    abreEl,
    gastosFijos,
    distribucion,
    cargando,
    error,
  };

  return { ...estado, colilla, setColilla, setGastosFijos, recargar: cargar };
}
