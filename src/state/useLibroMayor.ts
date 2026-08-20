import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export type TipoMovimientoLibro = 'gasto' | 'ingreso';

export interface MovimientoLibro {
  readonly id: string;
  readonly tipo: TipoMovimientoLibro;
  readonly monto: number;
  readonly descripcion: string;
  readonly fecha: string;
}

export interface ResumenLibroMayor {
  readonly totalGastos: number;
  readonly totalIngresos: number;
  readonly neto: number;
}

/**
 * Libro Mayor: gastos diarios e ingresos variables anotados a mano, en
 * `libro_mayor`. Se lee ordenado por fecha descendente y se calcula el
 * resumen en el cliente (memoizado): son sumas simples sobre una lista ya
 * paginada, no vale la pena un round-trip aparte a Postgres para eso.
 */
export function useLibroMayor() {
  const [movimientos, setMovimientos] = useState<MovimientoLibro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('libro_mayor')
        .select('id, tipo, monto, descripcion, fecha')
        .order('fecha', { ascending: false })
        .limit(200);
      if (e) throw e;
      setMovimientos(
        (data ?? []).map((m) => ({
          id: m.id as string,
          tipo: m.tipo as TipoMovimientoLibro,
          monto: Number(m.monto),
          descripcion: m.descripcion as string,
          fecha: m.fecha as string,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el libro mayor');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const agregar = useCallback(
    async (entrada: { tipo: TipoMovimientoLibro; monto: number; descripcion: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('No hay sesión activa: no se puede guardar el movimiento');
        return;
      }
      const { error: e } = await supabase.from('libro_mayor').insert({
        usuario_id: user.id,
        tipo: entrada.tipo,
        monto: entrada.monto,
        descripcion: entrada.descripcion,
      });
      if (e) {
        setError(e.message);
        return;
      }
      await cargar();
    },
    [cargar],
  );

  const resumen = useMemo<ResumenLibroMayor>(() => {
    let totalGastos = 0;
    let totalIngresos = 0;
    for (const m of movimientos) {
      if (m.tipo === 'gasto') totalGastos += m.monto;
      else totalIngresos += m.monto;
    }
    return { totalGastos, totalIngresos, neto: totalIngresos - totalGastos };
  }, [movimientos]);

  return { movimientos, resumen, cargando, error, agregar, recargar: cargar };
}
