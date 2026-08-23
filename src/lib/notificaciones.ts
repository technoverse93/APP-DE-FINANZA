import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { fechaAvisoColilla } from '../core/payroll/colilla';
import { nextPayday } from '../core/payroll/schedule';

/**
 * Recordatorio local para confirmar la colilla, 2 días calendario antes de
 * la fecha real de pago (ver `core/payroll/colilla.ts` para la regla).
 *
 * Es una notificación LOCAL programada por el propio teléfono: no necesita
 * servidor de push, ni cuenta de Expo, ni conexión en el momento de
 * dispararse. La contrapartida es que solo vive mientras la app esté
 * instalada, y hay que reprogramarla cada vez que la app abre — que es
 * justamente lo que hace `programarAvisoColilla`.
 */

const CANAL_ANDROID = 'recordatorios';

/** Identificador fijo: reprogramar reemplaza el aviso anterior en vez de acumular. */
const ID_AVISO_COLILLA = 'aviso-colilla';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Pide permiso de notificaciones si todavía no se concedió.
 * @returns true si quedó concedido.
 */
export async function asegurarPermisoNotificaciones(): Promise<boolean> {
  const { status: actual } = await Notifications.getPermissionsAsync();
  if (actual === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Programa (o reprograma) el aviso de colilla del próximo pago.
 *
 * Cancela primero el aviso anterior: si no, cada arranque de la app dejaría
 * una notificación más en la cola y el usuario recibiría duplicados.
 *
 * @returns la fecha en que quedó programado, o null si no se pudo (permiso
 * denegado, o el aviso de este pago ya pasó).
 */
export async function programarAvisoColilla(ahora: Date = new Date()): Promise<Date | null> {
  if (!(await asegurarPermisoNotificaciones())) return null;

  if (Platform.OS === 'android') {
    // Android exige un canal para poder mostrar la notificación.
    await Notifications.setNotificationChannelAsync(CANAL_ANDROID, {
      name: 'Recordatorios de quincena',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  await Notifications.cancelScheduledNotificationAsync(ID_AVISO_COLILLA).catch(() => undefined);

  const payday = nextPayday(ahora);
  const avisaEl = fechaAvisoColilla(payday);
  // Si ya estamos dentro de los 2 días previos, no hay nada futuro que
  // programar: la pantalla muestra igual el formulario de confirmación.
  if (avisaEl.getTime() <= ahora.getTime()) return null;

  await Notifications.scheduleNotificationAsync({
    identifier: ID_AVISO_COLILLA,
    content: {
      title: 'Confirmá tu colilla',
      body: 'Faltan 2 días para el pago. Confirmá el monto exacto para ajustar el cálculo de la quincena.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: avisaEl,
      ...(Platform.OS === 'android' ? { channelId: CANAL_ANDROID } : {}),
    },
  });

  return avisaEl;
}
