import { useCallback, useEffect, useState } from 'react';
import type { GastoFijoItem, ModoReparto } from '../core/payroll/gastosFijos';
import { supabase } from '../lib/supabase';

export interface EntradaGastoFijo {
  readonly nombre: string;
  readonly montoMensual: number;
  readonly modo: ModoReparto;
  readonly diaNominal?: 13 | 28;
  readonly fechaDiferida?: string;
  /** Última quincena en que aplica (YYYY-MM-DD). Sin vencimiento si se omite. */
  readonly venceEn?: string;
  /** Deuda que generó este gasto, si es la cuota fija de un plan a plazo. */
  readonly deudaId?: string;
}

/**
 * Convierte la entrada de la UI a las columnas de la tabla, dejando en null
 * los campos que el modo elegido no usa. La restricción `reparto_coherente`
 * de la migración 0016 rechaza cualquier combinación incoherente, así que
 * esto no es solo cosmético: mandar un `dia_nominal` junto a `mitades`
 * haría fallar el insert.
 */
function aFila(entrada: EntradaGastoFijo, usuarioId: string) {
  return {
    usuario_id: usuarioId,
    nombre: entrada.nombre,
    monto_mensual: entrada.montoMensual,
    modo: entrada.modo,
    dia_nominal: entrada.modo === 'quincena_fija' ? (entrada.diaNominal ?? 13) : null,
    fecha_diferida: entrada.modo === 'diferido' ? (entrada.fechaDiferida ?? null) : null,
    vence_en: entrada.venceEn ?? null,
    deuda_id: entrada.deudaId ?? null,
  };
}

/** CRUD completo de gastos fijos, con su regla de reparto entre quincenas. */
export function useGastosFijosItems() {
  const [gastos, setGastos] = useState<GastoFijoItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('gastos_fijos_items')
        .select('id, nombre, monto_mensual, modo, dia_nominal, fecha_diferida, vence_en, deuda_id, activo')
        .order('creado_en', { ascending: true });
      if (e) throw e;
      setGastos(
        (data ?? []).map((g) => ({
          id: g.id as string,
          nombre: g.nombre as string,
          montoMensual: Number(g.monto_mensual),
          modo: g.modo as ModoReparto,
          diaNominal: (g.dia_nominal as 13 | 28 | null) ?? undefined,
          fechaDiferida: (g.fecha_diferida as string | null) ?? undefined,
          venceEn: (g.vence_en as string | null) ?? undefined,
          deudaId: (g.deuda_id as string | null) ?? undefined,
          activo: g.activo as boolean,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los gastos fijos');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const crear = useCallback(
    async (entrada: EntradaGastoFijo) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('No hay sesión activa: no se puede guardar el gasto fijo');
        return;
      }
      const { error: e } = await supabase.from('gastos_fijos_items').insert(aFila(entrada, user.id));
      if (e) {
        setError(e.message);
        return;
      }
      await cargar();
    },
    [cargar],
  );

  const actualizar = useCallback(
    async (id: string, entrada: EntradaGastoFijo) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('No hay sesión activa: no se puede actualizar el gasto fijo');
        return;
      }
      const { error: e } = await supabase
        .from('gastos_fijos_items')
        .update({ ...aFila(entrada, user.id), actualizado_en: new Date().toISOString() })
        .eq('id', id);
      if (e) {
        setError(e.message);
        return;
      }
      await cargar();
    },
    [cargar],
  );

  const eliminar = useCallback(
    async (id: string) => {
      const { error: e } = await supabase.from('gastos_fijos_items').delete().eq('id', id);
      if (e) {
        setError(e.message);
        return;
      }
      await cargar();
    },
    [cargar],
  );

  return { gastos, cargando, error, crear, actualizar, eliminar, recargar: cargar };
}
