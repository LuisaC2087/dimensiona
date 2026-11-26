/**
 * Notificaciones del teléfono (Expo Push). En Android el APK necesita FCM configurado en EAS;
 * si no lo está, el registro falla en silencio y los avisos siguen llegando a la bandeja de la app.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { api } from '../api/client';
import { getItem, setItem } from './storage';

const KEY = 'dm.pushToken';
export type PushResult = 'ok' | 'denied' | 'unavailable';
export const pushSupported = true;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Pide permiso (si `ask`), obtiene el token de Expo y lo registra en el servidor. */
export async function registerPush(ask = true): Promise<PushResult> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('avisos', {
        name: 'Avisos de envíos', importance: Notifications.AndroidImportance.HIGH, lightColor: '#D7261E',
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'denied';
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerPushToken(data, Platform.OS);
    await setItem(KEY, data);
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

/** Al cerrar sesión: el teléfono deja de recibir avisos de esa cuenta. */
export async function unregisterPush() {
  const t = await getItem(KEY);
  if (!t) return;
  try { await api.removePushToken(t); } catch { /* sin conexión: el servidor lo limpia cuando Expo lo rechace */ }
  await setItem(KEY, null);
}

/** Al tocar una notificación se abre la pantalla relacionada (también si la app estaba cerrada). */
export function useNotificationTaps() {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = last?.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
  }, [last]);
}
