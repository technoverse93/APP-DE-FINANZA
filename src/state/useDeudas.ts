import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Deuda {
  readonly id: string;
  readonly nombre: string;
  readonly saldoActual: number;
  readonly tasaAnual: number;
  readonly abonoObjetivo: number;
}

/** Deudas reales (saldo + tasa) en `deudas`, para alimentar la Trituradora. */
export function useDeudas() {
  const [deudas, setDeudas] = useState<Deuda[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('deudas')
        .select('id, nombre, saldo_actual, tasa_anual, abono_objetivo')
        .order('creada_en', { ascending: true });
      if (e) throw e;
      setDeudas(
        (data ?? []).map((d) => ({
          id: d.id as string,
          nombre: d.nombre as string,
          saldoActual: Number(d.saldo_actual),
          tasaAnual: Number(d.tasa_anual),
          abonoObjetivo: Number(d.abono_objetivo),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las deudas');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = useCallback(
    async (deuda: { nombre: string; saldoActual: number; tasaAnual: number; abonoObjetivo: number }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('No hay sesión activa: no se puede guardar la deuda');
        return;
      }
      const { error: e } = await supabase.from('deudas').insert({
        usuario_id: user.id,
        nombre: deuda.nombre,
        saldo_actual: deuda.saldoActual,
        tasa_anual: deuda.tasaAnual,
        abono_objetivo: deuda.abonoObjetivo,
      });
      if (e) {
        setError(e.message);
        return;
      }
      await cargar();
    },
    [cargar],
  );

  return { deudas, cargando, error, guardar, recargar: cargar };
}
