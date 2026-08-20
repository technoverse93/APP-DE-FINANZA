import * as Updates from 'expo-updates';

/**
 * Comprobación de actualizaciones OTA al arranque.
 *
 * Esto nunca debe impedir que la app abra: sin red, con el servidor de
 * actualizaciones caído, o con un bundle remoto corrupto, el resultado es el
 * mismo — la app sigue con el bundle local ya cargado en memoria. Por eso cada
 * paso está en su propio try/catch en vez de uno solo envolviendo todo: así un
 * fallo en `fetchUpdateAsync` no cambia el diagnóstico de si hubo o no una
 * actualización disponible.
 *
 * `Updates.isEnabled` es false en Expo Go, en un dev client, y en cualquier
 * build donde `expo.updates.enabled` esté en `false` en app.json — en esos
 * casos no existe canal de actualización contra el cual preguntar, así que
 * ni se intenta.
 */
export async function comprobarActualizacion(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled) return;

  let disponible: boolean;
  try {
    const resultado = await Updates.checkForUpdateAsync();
    disponible = resultado.isAvailable;
  } catch {
    // Sin red o el servidor de updates no respondió: nada que hacer hoy.
    return;
  }
  if (!disponible) return;

  try {
    await Updates.fetchUpdateAsync();
  } catch {
    // La actualización se anunció pero no bajó completa (red interrumpida a
    // mitad de descarga, bundle inválido): seguir con el bundle local en vez
    // de arriesgar un reload con una descarga a medias.
    return;
  }

  try {
    await Updates.reloadAsync();
  } catch {
    // Ya se descargó: si el reload falla, quedará activa en el próximo
    // arranque de todas formas. No hay nada más que intentar en esta sesión.
  }
}
