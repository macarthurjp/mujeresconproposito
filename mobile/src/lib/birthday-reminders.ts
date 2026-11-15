import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Personal birthday reminders, scheduled as local notifications on this phone.
// Nothing is stored on the server; the scheduled notifications themselves are
// the source of truth (tagged with data.type = 'birthday_reminder').

export type ReminderOption = { key: string; label: string; daysBefore: number; hour: number };

export const REMINDER_OPTIONS: ReminderOption[] = [
  { key: 'same-day', label: 'El mismo día a las 9:00', daysBefore: 0, hour: 9 },
  { key: '1-day', label: '1 día antes a las 9:00', daysBefore: 1, hour: 9 },
  { key: '2-days', label: '2 días antes a las 9:00', daysBefore: 2, hour: 9 },
  { key: 'evening', label: 'La víspera a las 20:00', daysBefore: 1, hour: 20 },
];

// The web preview can't schedule phone notifications; it keeps choices in
// memory so the design can be tried out.
const isWeb = Platform.OS === 'web';
const webPreview: Record<string, string> = {};
export const remindersSupported = true;

/** Stable key for a person's birthday ("Marisol|11-16"). */
export function reminderKey(name: string, monthDay: string) {
  return `${name}|${monthDay}`;
}

/** Next date (local time) the reminder should fire, or null if it's already past. */
function fireDate(monthDay: string, option: ReminderOption, now = new Date()) {
  const [month, day] = monthDay.split('-').map(Number);
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const birthday = new Date(year, month - 1, day, option.hour, 0, 0);
    const at = new Date(birthday.getTime() - option.daysBefore * 86_400_000);
    if (at.getTime() > now.getTime() + 60_000) return at;
  }
  return null;
}

export async function listBirthdayReminders(): Promise<Record<string, string>> {
  if (isWeb) return { ...webPreview };
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const map: Record<string, string> = {};
  for (const request of scheduled) {
    const data = request.content.data as { type?: string; key?: string; option?: string } | undefined;
    if (data?.type === 'birthday_reminder' && data.key) map[data.key] = data.option ?? '';
  }
  return map;
}

async function cancelFor(key: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((r) => (r.content.data as { type?: string; key?: string } | undefined)?.type === 'birthday_reminder' && (r.content.data as { key?: string }).key === key)
      .map((r) => Notifications.cancelScheduledNotificationAsync(r.identifier)),
  );
}

export async function setBirthdayReminder(name: string, monthDay: string, option: ReminderOption | null) {
  const key = reminderKey(name, monthDay);
  if (isWeb) {
    if (option) webPreview[key] = option.key;
    else delete webPreview[key];
    return option ? ('scheduled' as const) : ('removed' as const);
  }
  await cancelFor(key);
  if (!option) return 'removed' as const;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const asked = await Notifications.requestPermissionsAsync();
    if (asked.status !== 'granted') return 'denied' as const;
  }

  const date = fireDate(monthDay, option);
  if (!date) return 'past' as const;

  const body = option.daysBefore === 0
    ? `Hoy cumple años ${name}. ¡No olvides felicitarla!`
    : `${name} cumple años ${option.daysBefore === 1 ? 'mañana' : `en ${option.daysBefore} días`}. ¡No olvides felicitarla!`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🎂 Cumpleaños',
      body,
      sound: 'default',
      data: { type: 'birthday_reminder', key, option: option.key },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
  return 'scheduled' as const;
}
