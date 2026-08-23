import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface TransaccionBancaria {
  readonly id: string;
  readonly banco: string;
  readonly monto: number;
  readonly moneda: string;
  readonly descripcion: string;
  readonly ocurridoEn: string;
}

/**
 * Lectura de `transacciones`: los comprobantes que captura automáticamente
 * el sync de correo (IMAP hoy, Gmail más adelante), excluyendo siempre el
 * BAC desde el propio parser (`_shared/parse.ts`). Es de solo lectura: quien
 * inserta acá es la Edge Function de sync, nunca la UI.
 */
export function useTransacciones() {
  const [transacciones, setTransacciones] = useState<TransaccionBancaria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('transacciones')
        .select('id, banco, monto, moneda, descripcion, ocurrido_en')
        .order('ocurrido_en', { ascending: false })
        .limit(200);
      if (e) throw e;
      setTransacciones(
        (data ?? []).map((t) => ({
          id: t.id as string,
          banco: t.banco as string,
          monto: Number(t.monto),
          moneda: t.moneda as string,
          descripcion: t.descripcion as string,
          ocurridoEn: t.ocurrido_en as string,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las transacciones');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { transacciones, cargando, error, recargar: cargar };
}
