import { useCallback, useEffect, useState } from 'react';
import type { Payday } from '../core/payroll/schedule';
import { supabase } from '../lib/supabase';

/** Fecha en formato `YYYY-MM-DD` (columna `date` de Postgres). */
function aFechaIso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/**
 * Colilla confirmada para un día de pago concreto.
 *
 * `monto` es null mientras el usuario no haya confirmado nada para esa
 * quincena: en ese caso el cálculo usa el ingreso base fijo, igual que antes
 * de que existiera esta pieza. Confirmar es siempre opcional.
 */
export function useColilla(payday: Payday) {
  const [monto, setMonto] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fechaPago = aFechaIso(payday.date);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('colillas_confirmadas')
        .select('monto')
        .eq('fecha_pago', fechaPago)
        .maybeSingle();
      if (e) throw e;
      setMonto(data ? Number(data.monto) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la colilla confirmada');
    } finally {
      setCargando(false);
    }
  }, [fechaPago]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const confirmar = useCallback(
    async (nuevoMonto: number) => {
      // Optimista: la pantalla refleja el monto nuevo de inmediato y el
      // cálculo del remanente se rehace sin esperar el round-trip.
      setMonto(nuevoMonto);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('No hay sesión activa: no se puede confirmar la colilla');
        return;
      }
      const { error: e } = await supabase.from('colillas_confirmadas').upsert(
        { usuario_id: user.id, fecha_pago: fechaPago, monto: nuevoMonto },
        { onConflict: 'usuario_id,fecha_pago' },
      );
      if (e) setError(e.message);
    },
    [fechaPago],
  );

  return { monto, cargando, error, confirmar, recargar: cargar };
}
