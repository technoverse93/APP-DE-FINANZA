import { supabase } from './supabase';

export interface ResumenGmailSync {
  readonly mensajesVistos: number;
  readonly insertadas: number;
  readonly descartadasBac: number;
}

/**
 * Invoca la Edge Function `gmail-sync` con el access token de Gmail que
 * acaba de devolver `useGoogleGmailAuth().promptAsync()`. `supabase-js`
 * agrega el JWT del usuario ya logueado en el header Authorization solo:
 * la función lo usa para identificar a quién pertenecen las transacciones
 * que inserta.
 */
export async function sincronizarGmail(googleAccessToken: string): Promise<ResumenGmailSync> {
  const { data, error } = await supabase.functions.invoke('gmail-sync', {
    body: { googleAccessToken },
  });
  if (error) throw error;
  return (data as { resumen: ResumenGmailSync }).resumen;
}
