import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/**
 * Sesión de Supabase.
 *
 * Sin esto la app no podía guardar NADA: cada hook llamaba a
 * `supabase.auth.getUser()`, recibía null y abortaba, y las políticas RLS
 * (`auth.uid() = usuario_id`) devolvían cero filas en cada lectura. La base
 * quedó literalmente vacía — cero usuarios y cero filas en todas las tablas —
 * hasta que se agregó esta pieza.
 *
 * La sesión persiste en expo-secure-store (ver `lib/supabase.ts`), así que
 * solo hay que iniciarla una vez: al reabrir la app, supabase-js la restaura
 * y la refresca sola.
 */
export function useSesion() {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vigente = true;

    // La sesión guardada puede tardar en leerse del almacenamiento seguro,
    // así que primero se consulta y recién después se deja de mostrar el
    // estado de carga — si no, la pantalla de login parpadearía en cada
    // arranque aunque el usuario ya estuviera dentro.
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (vigente) {
          setSesion(data.session);
          setCargando(false);
        }
      })
      .catch(() => {
        if (vigente) setCargando(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSesion(nueva);
    });

    return () => {
      vigente = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const cerrarSesion = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { sesion, cargando, cerrarSesion };
}
