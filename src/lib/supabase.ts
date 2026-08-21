import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

/** Milisegundos máximos para cualquier petición a Supabase. */
const TIMEOUT_RED_MS = 15_000;

export class RedSinRespuestaError extends Error {
  constructor() {
    super(`La red no respondió en ${TIMEOUT_RED_MS / 1000} segundos`);
    this.name = 'RedSinRespuestaError';
  }
}

/**
 * Sin este timeout, una conexión que se cuelga (servidor caído a mitad de
 * TCP, un proxy que nunca cierra el túnel) deja cualquier pantalla que
 * dependa de Supabase girando el spinner para siempre: `fetch` no tiene
 * timeout propio y una promesa que nunca se resuelve nunca dispara el
 * `catch` del componente. Se detectó al ver `useMarketData` quedarse
 * cargando indefinidamente contra una red caída.
 */
const fetchConTimeout: typeof fetch = (input, init) => {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new RedSinRespuestaError()), TIMEOUT_RED_MS);
    fetch(input, init).then(
      (respuesta) => {
        clearTimeout(id);
        resolve(respuesta);
      },
      (error) => {
        clearTimeout(id);
        reject(error);
      },
    );
  });
};

const fetchConCandado: typeof fetch = (input, init) => {
  if (!desbloqueado) {
    return Promise.reject(new AppBloqueadaError());
  }
  return fetchConTimeout(input, init);
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Mensaje de configuración faltante, o null si todo está en orden.
 *
 * Deliberadamente esto NO lanza una excepción a nivel de módulo. Este archivo
 * se importa de forma estática desde `App.tsx` (vía BiometricGate), así que un
 * throw aquí se ejecuta antes de que React monte una sola pantalla: mata la
 * app entera en el arranque, sin ErrorBoundary que lo pueda atrapar, y en un
 * build release eso se ve como un cierre inmediato sin ningún mensaje. Si el
 * bundle se armó sin estas variables (por ejemplo, un build de CI sin los
 * secretos configurados), la app debe poder abrir igual y degradar solo las
 * funciones que dependen de Supabase.
 */
export const supabaseConfigError: string | null =
  !SUPABASE_URL || !SUPABASE_ANON_KEY
    ? 'Faltan EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY. Copiá .env.example a .env.'
    : null;

/**
 * Adaptador de almacenamiento de sesión sobre expo-secure-store en vez de
 * AsyncStorage. AsyncStorage guarda en texto plano (SharedPreferences en
 * Android, un plist en iOS); el JWT y el refresh token son credenciales de
 * acceso reales, así que quedan mejor en el Keystore/Keychore cifrado del
 * sistema operativo, que es lo que expo-secure-store usa por debajo. La
 * interfaz (getItem/setItem/removeItem async) es exactamente la que
 * `auth.storage` de supabase-js espera, así que no hace falta más adaptador.
 */
const almacenSeguro = {
  getItem: (clave: string) => SecureStore.getItemAsync(clave),
  setItem: (clave: string, valor: string) => SecureStore.setItemAsync(clave, valor),
  removeItem: (clave: string) => SecureStore.deleteItemAsync(clave),
};

class SupabaseNoConfiguradoError extends Error {
  constructor() {
    super(supabaseConfigError ?? 'Supabase no está configurado');
    this.name = 'SupabaseNoConfiguradoError';
  }
}

/**
 * Cliente sin operar: cualquier llamada rechaza en vez de crashear la app.
 *
 * Las consultas reales de supabase-js son cadenas encadenables donde cada
 * eslabón (`.from(...)`, `.select(...)`, `.eq(...)`) devuelve un builder que
 * solo se vuelve una promesa al await-earlo o llamar `.then`. El stub imita
 * exactamente esa forma: cada acceso a propiedad y cada llamada devuelven el
 * mismo proxy encadenable, y el rechazo solo ocurre en el punto donde algo
 * realmente espera el resultado (`then`/`catch`) — que es donde ya existe
 * manejo de errores en el resto del código. Devolver una promesa rechazada
 * "suelta" en un paso intermedio de la cadena (antes de que algo la espere)
 * la deja sin capturar y puede terminar el proceso.
 */
function crearClienteStub(): SupabaseClient {
  const crearError = () => new SupabaseNoConfiguradoError();
  const manejador: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.reject(crearError()).then(resolve, reject);
      }
      if (prop === 'catch') {
        return (onRejected?: (e: unknown) => unknown) =>
          Promise.reject(crearError()).catch(onRejected);
      }
      if (typeof prop === 'symbol' || prop === 'toJSON') return undefined;
      return proxy;
    },
    apply() {
      return proxy;
    },
  };
  const proxy = new Proxy(function stub() {}, manejador);
  return proxy as unknown as SupabaseClient;
}

export const supabase: SupabaseClient = supabaseConfigError
  ? crearClienteStub()
  : createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        storage: almacenSeguro,
        persistSession: true,
        autoRefreshToken: true,
        // No hay flujo de OAuth por navegador en esta app.
        detectSessionInUrl: false,
      },
      global: { fetch: fetchConCandado },
    });
