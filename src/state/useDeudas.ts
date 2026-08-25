import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Deuda {
  readonly id: string;
  readonly nombre: string;
  readonly saldoActual: number;
  /** Tasa nominal MENSUAL, ej. 0.02 para 2% mensual — así viene publicada en
   * un estado de cuenta costarricense. */
  readonly tasaMensual: number;
  /**
   * Cuota mínima por quincena, si la deuda tiene un plan fijo. `0` significa
   * que no hay cuota: son deudas que solo acumulan interés (por ejemplo un
   * alquiler atrasado), sin un pago mínimo pactado, y se pagan enteramente
   * con el porcentaje de remanente libre que el usuario elija destinarles.
   */
  readonly abonoObjetivo: number;
  /** Duración estimada del plan de cuota fija, en quincenas. Solo tiene
   * sentido cuando `abonoObjetivo` es mayor a cero. */
  readonly plazoQuincenas: number | null;
  /**
   * ¿El interés de esta deuda corre por día (mora) y no por quincena?
   *
   * No cambia el cálculo —la tasa sigue siendo mensual nominal— pero sí la
   * prioridad con que hay que atacarla: en una de estas, cada día de atraso
   * cuesta plata, así que la interfaz las señala aparte.
   */
  readonly interesMoratorioDiario: boolean;
  /** Fecha tope pactada del compromiso (YYYY-MM-DD), si existe. */
  readonly fechaLimite: string | null;
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
        .select(
          'id, nombre, saldo_actual, tasa_mensual, abono_objetivo, plazo_quincenas, interes_moratorio_diario, fecha_limite',
        )
        .order('creada_en', { ascending: true });
      if (e) throw e;
      setDeudas(
        (data ?? []).map((d) => ({
          id: d.id as string,
          nombre: d.nombre as string,
          saldoActual: Number(d.saldo_actual),
          tasaMensual: Number(d.tasa_mensual),
          abonoObjetivo: Number(d.abono_objetivo),
          plazoQuincenas: d.plazo_quincenas === null ? null : Number(d.plazo_quincenas),
          interesMoratorioDiario: Boolean(d.interes_moratorio_diario),
          fechaLimite: (d.fecha_limite as string | null) ?? null,
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
    async (deuda: {
      nombre: string;
      saldoActual: number;
      tasaMensual: number;
      /** 0 (u omitido) si la deuda no tiene cuota fija. */
      abonoObjetivo?: number;
      /** Solo cuando `abonoObjetivo` es mayor a cero. */
      plazoQuincenas?: number | null;
      interesMoratorioDiario?: boolean;
      fechaLimite?: string | null;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('No hay sesión activa: no se puede guardar la deuda');
        return null;
      }
      const { data, error: e } = await supabase
        .from('deudas')
        .insert({
          usuario_id: user.id,
          nombre: deuda.nombre,
          saldo_actual: deuda.saldoActual,
          tasa_mensual: deuda.tasaMensual,
          abono_objetivo: deuda.abonoObjetivo ?? 0,
          plazo_quincenas: deuda.abonoObjetivo ? (deuda.plazoQuincenas ?? null) : null,
          interes_moratorio_diario: deuda.interesMoratorioDiario ?? false,
          fecha_limite: deuda.fechaLimite ?? null,
        })
        .select('id')
        .single();
      if (e) {
        setError(e.message);
        return null;
      }
      await cargar();
      return data.id as string;
    },
    [cargar],
  );

  return { deudas, cargando, error, guardar, recargar: cargar };
}
