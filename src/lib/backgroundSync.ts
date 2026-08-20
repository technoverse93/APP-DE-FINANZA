import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { redDesbloqueada, supabase } from './supabase';

/**
 * Disparo de la sincronización de correos desde el dispositivo.
 *
 * El intervalo exacto de 30 minutos lo garantiza pg_cron en Supabase, no esta
 * tarea: ni Android ni iOS ejecutan trabajo en segundo plano a horas fijas
 * (Doze en Android, planificación oportunista en iOS), así que un intervalo
 * exacto en el dispositivo no es algo que el sistema operativo permita
 * prometer. Esta tarea es un refuerzo: cuando el sistema la despierta, pide
 * una pasada extra, lo que acorta la espera de un comprobante del BCR que
 * llegó justo después de la última corrida del cron.
 */

export const TAREA_SYNC_CORREOS = 'sincronizar-correos';

/** Mínimo que acepta el sistema; el planificador puede espaciarlo más. */
const INTERVALO_MINUTOS = 30;

TaskManager.defineTask(TAREA_SYNC_CORREOS, async () => {
  // Con la app bloqueada la red está cortada: no tiene sentido intentarlo.
  if (!redDesbloqueada()) {
    return BackgroundTask.BackgroundTaskResult.Success;
  }
  try {
    await pedirSincronizacion();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Invoca la Edge Function que lee Gmail y Outlook. */
export async function pedirSincronizacion(soloHoy = true): Promise<void> {
  const { error } = await supabase.functions.invoke('email-sync', {
    body: { origen: 'dispositivo', soloHoy },
  });
  if (error) throw error;
}

export async function registrarTareaDeFondo(): Promise<void> {
  const yaRegistrada = await TaskManager.isTaskRegisteredAsync(TAREA_SYNC_CORREOS);
  if (yaRegistrada) return;
  await BackgroundTask.registerTaskAsync(TAREA_SYNC_CORREOS, {
    minimumInterval: INTERVALO_MINUTOS,
  });
}

export async function cancelarTareaDeFondo(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(TAREA_SYNC_CORREOS)) {
    await BackgroundTask.unregisterTaskAsync(TAREA_SYNC_CORREOS);
  }
}
