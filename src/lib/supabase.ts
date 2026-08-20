import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase con candado de transporte.
 *
 * El bloqueo biométrico no se limita a ocultar la interfaz: mientras la app
 * está bloqueada, `fetch` rechaza toda petición. Como el cliente de Supabase
 * canaliza absolutamente todo su tráfico (PostgREST, Auth, Storage, Realtime
 * por HTTP) a través del `fetch` que se le inyecta, interceptarlo ahí garantiza
 * que ninguna consulta escape aunque una pantalla se monte por error.
 */

let desbloqueado = false;

export class AppBloqueadaError extends Error {
  constructor() {
    super('La aplicación está bloqueada: se requiere autenticación biométrica');
    this.name = 'AppBloqueadaError';
  }
}

/** Habilita el tráfico hacia Supabase. Solo lo llama la puerta biométrica. */
export function desbloquearRed(): void {
  desbloqueado = true;
}

/** Corta el tráfico. Se invoca al mandar la app a segundo plano. */
export function bloquearRed(): void {
  desbloqueado = false;
}

export function redDesbloqueada(): boolean {
  return desbloqueado;
}

const fetchConCandado: typeof fetch = (input, init) => {
  if (!desbloqueado) {
    return Promise.reject(new AppBloqueadaError());
  }
  return fetch(input, init);
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Faltan EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY. Copiá .env.example a .env.',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // No hay flujo de OAuth por navegador en esta app.
    detectSessionInUrl: false,
  },
  global: { fetch: fetchConCandado },
});
