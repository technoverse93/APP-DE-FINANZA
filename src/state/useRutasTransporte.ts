import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface TramoTransporte {
  readonly id: string;
  readonly origen: string;
  readonly destino: string;
  readonly precio: number;
}

/**
 * Ruta de transporte diaria: una lista de tramos (Casa -> San José ->
 * Coronado -> ...) en `rutas_transporte`, cuya suma es el costo diario que
 * `core/payroll/transporte.ts` proyecta contra los días hábiles de la
 * quincena. Reemplaza el campo plano `gastos_fijos.pases`.
 */
export function useRutasTransporte() {
  const [tramos, setTramos] = useState<TramoTransporte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('rutas_transporte')
        .select('id, origen, destino, precio')
        .order('orden', { ascending: true });
      if (e) throw e;
      setTramos(
        (data ?? []).map((t) => ({
          id: t.id as string,
          origen: t.origen as string,
          destino: t.destino as string,
          precio: Number(t.precio),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las rutas de transporte');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const agregar = useCallback(
    async (tramo: { origen: string; destino: string; precio: number }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('No hay sesión activa: no se puede guardar el tramo');
        return;
      }
      const { error: e } = await supabase.from('rutas_transporte').insert({
        usuario_id: user.id,
        origen: tramo.origen,
        destino: tramo.destino,
        precio: tramo.precio,
        orden: tramos.length,
      });
      if (e) {
        setError(e.message);
        return;
      }
      await cargar();
    },
    [cargar, tramos.length],
  );

  const eliminar = useCallback(
    async (id: string) => {
      const { error: e } = await supabase.from('rutas_transporte').delete().eq('id', id);
      if (e) {
        setError(e.message);
        return;
      }
      await cargar();
    },
    [cargar],
  );

  const costoDiarioTotal = useMemo(
    () => tramos.reduce((suma, t) => suma + t.precio, 0),
    [tramos],
  );

  return { tramos, costoDiarioTotal, cargando, error, agregar, eliminar, recargar: cargar };
}
