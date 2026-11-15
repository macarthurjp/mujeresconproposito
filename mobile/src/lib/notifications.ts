import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';

import { api } from './api';

export const MEETING_CATEGORY = 'meeting';
export const JOIN_ACTION = 'join';
const MEETING_ALERTS_ENABLED_KEY = 'mcp930:meeting-alerts-enabled';

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

export type PushStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported' | 'error';

export async function getPushStatus(): Promise<PushStatus> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

export async function getMeetingAlertsEnabled() {
  const saved = await AsyncStorage.getItem(MEETING_ALERTS_ENABLED_KEY);
  if (saved !== null) return saved === 'true';
  // Preserve the current behavior for existing installs that already allowed alerts.
  return (await getPushStatus()) === 'granted';
}

export async function enableMeetingAlerts(): Promise<PushStatus> {
  const status = await registerForMeetingAlerts(true);
  await AsyncStorage.setItem(MEETING_ALERTS_ENABLED_KEY, String(status === 'granted'));
  if (status === 'granted') {
    const token = await deviceToken().catch(() => null);
    if (token) await api.setMeetingAlerts(token, true);
  }
  return status;
}

export async function disableMeetingAlerts() {
  // Persist the opt-out first so app launch never silently re-registers this device.
  await AsyncStorage.setItem(MEETING_ALERTS_ENABLED_KEY, 'false');
  const token = await deviceToken();
  // Meeting alerts off for this device; birthday reminders keep working.
  if (token) await api.setMeetingAlerts(token, false);
}

async function deviceToken() {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return data;
}

// ---------- Birthday reminders chosen in Más → Avisos de cumpleaños ----------
export type BirthdayPushPrefs = { avisos: number[]; hora: number; minuto: number };
const BIRTHDAY_PUSH_KEY = 'mcp930:birthday-push';
export const DEFAULT_BIRTHDAY_PUSH: BirthdayPushPrefs = { avisos: [], hora: 9, minuto: 0 };

export async function getBirthdayPushPrefs(): Promise<BirthdayPushPrefs> {
  try {
    const raw = await AsyncStorage.getItem(BIRTHDAY_PUSH_KEY);
    return raw ? { ...DEFAULT_BIRTHDAY_PUSH, ...JSON.parse(raw) } : DEFAULT_BIRTHDAY_PUSH;
  } catch {
    return DEFAULT_BIRTHDAY_PUSH;
  }
}

/** Saves the choice on this phone and on the server (which sends the pushes). */
export async function saveBirthdayPushPrefs(prefs: BirthdayPushPrefs): Promise<PushStatus> {
  await AsyncStorage.setItem(BIRTHDAY_PUSH_KEY, JSON.stringify(prefs));
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  const status = prefs.avisos.length ? await registerForMeetingAlerts(true) : await getPushStatus();
  if (prefs.avisos.length && status !== 'granted') return status;
  const token = await deviceToken().catch(() => null);
  if (!token) return prefs.avisos.length ? 'error' : status;
  const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
  await api.setBirthdayPush(token, prefs.avisos, prefs.hora, prefs.minuto, zona);
  // Registering may have created the device with meeting alerts on; respect the user's choice.
  if (prefs.avisos.length) await api.setMeetingAlerts(token, await getMeetingAlertsEnabled());
  return 'granted';
}

/** Re-registers the current token and restores each independent notification preference. */
export async function refreshNotificationRegistration() {
  const [meetingsEnabled, birthdays] = await Promise.all([getMeetingAlertsEnabled(), getBirthdayPushPrefs()]);
  if (!meetingsEnabled && !birthdays.avisos.length) return;
  const status = await registerForMeetingAlerts(false);
  if (status !== 'granted') return;
  const token = await deviceToken();
  if (!token) return;
  await api.setMeetingAlerts(token, meetingsEnabled);
  if (birthdays.avisos.length) {
    await api.setBirthdayPush(token, birthdays.avisos, birthdays.hora, birthdays.minuto, Intl.DateTimeFormat().resolvedOptions().timeZone);
  }
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
    // Network or missing EAS projectId; the settings screen exposes the failure.
    console.warn('No se pudo registrar el token de notificaciones', error);
    return 'error';
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
