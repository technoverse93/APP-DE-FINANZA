import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export type TipoMovimientoLibro = 'gasto' | 'ingreso';

export interface MovimientoLibro {
  readonly id: string;
  readonly tipo: TipoMovimientoLibro;
  readonly monto: number;
  readonly descripcion: string;
  readonly fecha: string;
  /** Ej. "Ventas", "Reparaciones de hardware"; opcional. */
  readonly categoria: string | null;
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
        .select('id, tipo, monto, descripcion, fecha, categoria')
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
          categoria: (m.categoria as string | null) ?? null,
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

  /**
   * Anota un movimiento con UI optimista.
   *
   * Antes esto insertaba y después recargaba las 200 filas del libro para
   * recién ahí repintar: contra la red del teléfono eso son varios segundos
   * en los que el gasto que se acaba de anotar no aparece por ningún lado y
   * el remanente sigue mostrando la cifra vieja. Para un gasto hormiga que se
   * anota parado en la fila del súper, esa espera es la diferencia entre usar
   * la app y no usarla.
   *
   * Ahora la fila se pinta de una y la escritura viaja en segundo plano. Como
   * todos los totales de la app (remanente, disponible, distribución) se
   * derivan de esta lista, pintar acá actualiza la pantalla entera al
   * instante. Si la escritura falla, la fila se retira y se avisa: es
   * preferible a dejar en pantalla un movimiento que la base nunca guardó.
   */
  const agregar = useCallback(
    async (entrada: {
      tipo: TipoMovimientoLibro;
      monto: number;
      descripcion: string;
      categoria?: string | null;
    }) => {
      // Prefijo reconocible: nada que venga de Postgres puede colisionar con
      // esto, así que la reconciliación y el descarte son inequívocos.
      const idTemporal = `optimista-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimista: MovimientoLibro = {
        id: idTemporal,
        tipo: entrada.tipo,
        monto: entrada.monto,
        descripcion: entrada.descripcion,
        // `fecha` es un DATE en la base, con default CURRENT_DATE: se imita
        // el mismo formato para que la fila optimista caiga en la ventana de
        // la quincena en curso igual que la definitiva.
        fecha: new Date().toISOString().slice(0, 10),
        categoria: entrada.categoria ?? null,
      };

      setError(null);
      setMovimientos((previos) => [optimista, ...previos]);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error('No hay sesión activa: no se puede guardar el movimiento');

        const { data, error: e } = await supabase
          .from('libro_mayor')
          .insert({
            usuario_id: user.id,
            tipo: entrada.tipo,
            monto: entrada.monto,
            descripcion: entrada.descripcion,
            categoria: entrada.categoria ?? null,
          })
          .select('id, tipo, monto, descripcion, fecha, categoria')
          .single();
        if (e) throw e;

        // Se reemplaza en el sitio en vez de recargar todo: la fila real trae
        // el id y la fecha que puso Postgres, que es lo único que la
        // optimista tenía inventado.
        setMovimientos((previos) =>
          previos.map((m) =>
            m.id === idTemporal
              ? {
                  id: data.id as string,
                  tipo: data.tipo as TipoMovimientoLibro,
                  monto: Number(data.monto),
                  descripcion: data.descripcion as string,
                  fecha: data.fecha as string,
                  categoria: (data.categoria as string | null) ?? null,
                }
              : m,
          ),
        );
      } catch (e) {
        setMovimientos((previos) => previos.filter((m) => m.id !== idTemporal));
        setError(e instanceof Error ? e.message : 'No se pudo guardar el movimiento');
      }
    },
    [],
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
