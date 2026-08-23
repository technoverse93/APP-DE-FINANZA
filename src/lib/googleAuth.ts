import { Prompt } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

/**
 * Necesario para que el navegador del sistema, tras el login de Google,
 * pueda devolver el control a esta app (cierra la pestaña/hoja de auth y
 * resuelve la promesa de `promptAsync`). Sin esto, `promptAsync()` se queda
 * colgado después de que el usuario inicia sesión.
 */
WebBrowser.maybeCompleteAuthSession();

/**
 * Alcance de solo lectura de Gmail: la app únicamente lee correos para
 * detectar comprobantes bancarios, nunca envía ni borra nada.
 */
export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

export const googleAuthConfigurado = Boolean(ANDROID_CLIENT_ID);

/**
 * Hook de login con Google para leer Gmail. Devuelve `[request, response,
 * promptAsync]`, igual que cualquier hook de `expo-auth-session`:
 * `promptAsync()` abre el navegador del sistema con la pantalla de consentimiento
 * de Google; cuando `response?.type === 'success'`,
 * `response.authentication?.accessToken` es el token que usa `gmailSync`.
 *
 * Usa el tipo de cliente "Android" (no "Web"): Google lo valida por nombre
 * de paquete + huella SHA-1 del APK en vez de por una URL de redirect
 * registrada, así que no hace falta backend propio para el intercambio de
 * código. Ver docs/gmail-oauth.md para los pasos exactos de configuración en
 * Google Cloud Console (requiere acciones manuales del dueño del proyecto).
 */
export function useGoogleGmailAuth() {
  return Google.useAuthRequest({
    androidClientId: ANDROID_CLIENT_ID,
    scopes: [GMAIL_READONLY_SCOPE],
    // Token en vez de Authorization Code: no hay backend que intercambie el
    // código por un token, y el acceso es de un solo uso por sincronización
    // manual (no se persiste un refresh token en ningún lado).
    responseType: 'token',
    // Sin esto, Google reutiliza en silencio la cuenta que ya esté activa en
    // el navegador del teléfono (típicamente la principal, no la agregada
    // como "usuario de prueba" en la pantalla de consentimiento) y rechaza
    // el login con "Error 400: invalid_request" sin dar oportunidad de
    // elegir otra. Forzar el selector deja que el usuario elija la cuenta
    // correcta cada vez.
    prompt: Prompt.SelectAccount,
  });
}
