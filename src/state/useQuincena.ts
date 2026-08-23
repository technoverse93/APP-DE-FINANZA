import { useCallback, useEffect, useMemo, useState } from 'react';
import { type GastosFijos } from '../core/payroll/distribution';
import { nextPayday, type Payday } from '../core/payroll/schedule';
import { supabase } from '../lib/supabase';

const GASTOS_VACIOS: GastosFijos = { casa: 0, comida: 0, pases: 0, deudaBase: 0 };

interface EstadoQuincena {
  readonly payday: Payday;
  readonly gastosFijos: GastosFijos;
  readonly cargando: boolean;
  readonly error: string | null;
}

/**
 * Estado de la quincena en curso: próximo pago y gastos fijos guardados.
 *
 * El ingreso disponible y su distribución ya no dependen de una colilla
 * ingresada a mano: se calculan en `ResumenScreen` a partir del ingreso base,
 * el Libro Mayor y las rutas de transporte (ver
 * `core/payroll/ingresoDisponible.ts`). Este hook solo expone lo que sigue
 * siendo configuración persistida por el usuario.
 */
export function useQuincena(ahora?: Date) {
  const [gastosFijos, setGastosFijos] = useState<GastosFijos>(GASTOS_VACIOS);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ver el comentario equivalente en la versión anterior de este hook: fija
  // el "ahora" con useMemo para que su identidad no cambie en cada render.
  const momento = useMemo(() => ahora ?? new Date(), [ahora]);
  const payday = useMemo(() => nextPayday(momento), [momento]);

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

  const guardarGastosFijos = useCallback(async (siguiente: GastosFijos) => {
    setGastosFijos(siguiente);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('No hay sesión activa: no se pueden guardar los gastos fijos');
      return;
    }
    const { error: e } = await supabase.from('gastos_fijos').upsert(
      {
        usuario_id: user.id,
        casa: siguiente.casa,
        comida: siguiente.comida,
        pases: siguiente.pases,
        deuda_base: siguiente.deudaBase,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'usuario_id' },
    );
    if (e) setError(e.message);
  }, []);

  const estado: EstadoQuincena = { payday, gastosFijos, cargando, error };

  return { ...estado, guardarGastosFijos, recargar: cargar };
}
