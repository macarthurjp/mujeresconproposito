import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { api } from './api';

export const MEETING_CATEGORY = 'meeting';
export const JOIN_ACTION = 'join';

// Show meeting alerts even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function configureNotificationChannels() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reuniones', {
      name: 'Reuniones en vivo',
      description: 'Aviso cuando una reunión de Mujeres con Propósito comienza',
      // eslint-disable-next-line import/namespace -- re-exported enum, rule can't follow it
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7a2e42',
    });
    // Meeting-start channel: own chime and a stronger vibration pattern.
    // (Android channel sound/vibration can't change after creation, hence a new id.)
    await Notifications.setNotificationChannelAsync('reuniones-en-vivo', {
      name: 'Reunión en vivo',
      description: 'Aviso cuando una reunión acaba de empezar',
      // eslint-disable-next-line import/namespace -- re-exported enum
      importance: Notifications.AndroidImportance.MAX,
      sound: 'reunion.wav',
      vibrationPattern: [0, 400, 200, 400, 200, 800],
      enableVibrate: true,
      lightColor: '#a64b43',
    });
  }
  // "Unirme" button on the notification itself (long-press on iOS, expand on Android).
  await Notifications.setNotificationCategoryAsync(MEETING_CATEGORY, [
    { identifier: JOIN_ACTION, buttonTitle: 'Unirme', options: { opensAppToForeground: true } },
  ]);
}

export type PushStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function getPushStatus(): Promise<PushStatus> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

/**
 * Asks permission (only if `ask` is true and it was never asked) and registers
 * this device's Expo push token with Supabase. Safe to call on every launch.
 */
export async function registerForMeetingAlerts(ask: boolean): Promise<PushStatus> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && ask) {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return status === 'denied' ? 'denied' : 'undetermined';

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await api.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android', zona);
  } catch (error) {
    // Network or missing EAS projectId; the next launch retries.
    console.warn('No se pudo registrar el token de notificaciones', error);
  }
  return 'granted';
}

/** Opens the meeting link carried by a "meeting_start" notification. */
export async function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as { type?: string; link?: string | null } | undefined;
  if (data?.type !== 'meeting_start' || !data.link) return false;
  if (!/^https?:\/\//i.test(data.link)) return false;
  // Zoom, Meet, Teams, YouTube... all register universal links, so the native
  // app opens straight into the meeting when installed.
  await Linking.openURL(data.link);
  return true;
}
