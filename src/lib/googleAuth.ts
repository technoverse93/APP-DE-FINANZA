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
    // Deliberadamente NO se fija responseType. El valor por defecto para una
    // app instalada es el flujo de código de autorización con PKCE, y ese es
    // el único que Google acepta para un cliente de tipo Android: el flujo
    // implícito (responseType: 'token') está prohibido para apps nativas
    // (RFC 8252), y pedirlo es lo que devolvía "Error 400: invalid_request".
    //
    // No hace falta backend para completarlo: el propio provider intercambia
    // el código por el token usando el code_verifier de PKCE y deja el
    // accessToken en `response.authentication`, igual que antes.
    // Sin esto, Google reutiliza en silencio la cuenta ya activa en el
    // navegador del teléfono — típicamente la principal, no la que está
    // agregada como "usuario de prueba" en la pantalla de consentimiento —
    // y no da forma de cambiarla. Con la app en modo "Testing", entrar con
    // una cuenta que no es de prueba es rechazado, así que el selector es
    // necesario para poder elegir la correcta.
    prompt: Prompt.SelectAccount,
  });
}
