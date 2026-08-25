import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { guardarSesionNativa, limpiarSesionNativa } from '../../modules/entrada-rapida';
import { supabase } from '../lib/supabase';

/**
 * Espeja la sesión al lado nativo, para el widget y la ventana emergente.
 *
 * Se llama desde los dos caminos por los que la sesión puede cambiar (la
 * lectura inicial y `onAuthStateChange`) porque el widget tiene que poder
 * escribir a Supabase con la app cerrada, y ahí no hay forma de preguntarle
 * nada a JavaScript: el token tiene que estar ya en disco.
 *
 * `onAuthStateChange` también dispara en cada refresco automático de token, lo
 * que mantiene la copia nativa fresca sin ningún temporizador propio.
 */
function espejarSesion(sesion: Session | null): void {
  if (sesion?.access_token && sesion.refresh_token && sesion.user?.id) {
    guardarSesionNativa(sesion.access_token, sesion.refresh_token, sesion.user.id);
  } else {
    limpiarSesionNativa();
  }
}

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
          espejarSesion(data.session);
          setCargando(false);
        }
      })
      .catch(() => {
        if (vigente) setCargando(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSesion(nueva);
      espejarSesion(nueva);
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
