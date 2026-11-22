import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * In-app inbox of the push notifications this phone received.
 *
 * There is no login in the app, so the inbox lives on the device: every
 * notification the OS shows (foreground listener, tapped, or still in the
 * tray when the app opens) is copied into AsyncStorage. Opening the inbox
 * marks everything read and clears the system tray, which also resets the
 * count on the app icon (Android launcher badge / iOS badge).
 */
export type InboxKind = 'meeting' | 'content' | 'birthday' | 'broadcast' | 'other';
export type InboxItem = {
  id: string;
  title: string;
  body: string;
  date: number; // ms
  kind: InboxKind;
  data: Record<string, unknown>;
  read: boolean;
};

const KEY = 'mcp930:notification-inbox';
const MAX_ITEMS = 60;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

let cache: InboxItem[] | null = null;
const listeners = new Set<(items: InboxItem[]) => void>();
// Serializes read-modify-write so a push arriving while the inbox syncs is not lost.
let queue: Promise<unknown> = Promise.resolve();

function kindOf(type: unknown): InboxKind {
  if (type === 'meeting_start' || type === 'meeting_soon') return 'meeting';
  if (type === 'content') return 'content';
  if (type === 'birthday_push') return 'birthday';
  if (type === 'broadcast') return 'broadcast';
  return 'other';
}

function toItem(n: Notifications.Notification): InboxItem | null {
  const content = n.request.content;
  const title = content.title?.trim() || '';
  const body = content.body?.trim() || '';
  if (!title && !body) return null;
  const data = (content.data ?? {}) as Record<string, unknown>;
  // Local reminders scheduled by the app use a time trigger: date is when it fired.
  const date = typeof n.date === 'number' && n.date > 0 ? (n.date < 1e12 ? n.date * 1000 : n.date) : Date.now();
  return { id: n.request.identifier, title, body, date, kind: kindOf(data.type), data, read: false };
}

async function read(): Promise<InboxItem[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as InboxItem[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function update(change: (items: InboxItem[]) => InboxItem[]) {
  const run = queue.then(async () => {
    const cutoff = Date.now() - MAX_AGE_MS;
    const next = change(await read())
      .filter((i) => i.date >= cutoff)
      .sort((a, b) => b.date - a.date)
      .slice(0, MAX_ITEMS);
    cache = next;
    listeners.forEach((fn) => fn(next));
    await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
    return next;
  });
  queue = run.catch(() => {});
  return run;
}

function merge(items: InboxItem[], incoming: InboxItem[], read = false) {
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const item of incoming) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? { ...existing, read: existing.read || read } : { ...item, read });
  }
  return [...byId.values()];
}

/** Saves a notification the phone just received or the user tapped. */
export function recordNotification(n: Notifications.Notification, opened = false) {
  const item = toItem(n);
  if (!item) return Promise.resolve(cache ?? []);
  return update((items) => merge(items, [item], opened));
}

/** Copies whatever is still in the system tray (pushes received while the app was closed). */
export async function syncFromTray() {
  if (Platform.OS === 'web') return read();
  const presented = await Notifications.getPresentedNotificationsAsync().catch(() => []);
  const incoming = presented.map(toItem).filter((i): i is InboxItem => !!i);
  return incoming.length ? update((items) => merge(items, incoming)) : read();
}

/**
 * Inbox opened: everything is read, the tray is emptied and the icon count
 * goes to 0. Returns the ids that were unread, so the screen can mark them as new.
 */
export async function markAllSeen(): Promise<string[]> {
  const items = await syncFromTray();
  const unread = items.filter((i) => !i.read).map((i) => i.id);
  if (unread.length) await update((list) => list.map((i) => (i.read ? i : { ...i, read: true })));
  if (Platform.OS !== 'web') {
    await Notifications.dismissAllNotificationsAsync().catch(() => {});
    await Notifications.setBadgeCountAsync(0).catch(() => {});
  }
  return unread;
}

export function removeNotification(id: string) {
  return update((items) => items.filter((i) => i.id !== id));
}

export function clearInbox() {
  return update(() => []);
}

/** Live inbox for screens: re-renders when a push arrives or the inbox changes. */
export function useInbox() {
  const [items, setItems] = useState<InboxItem[]>(cache ?? []);
  useEffect(() => {
    listeners.add(setItems);
    read().then(setItems).catch(() => {});
    return () => { listeners.delete(setItems); };
  }, []);
  return items;
}

export function useUnreadCount() {
  return useInbox().filter((i) => !i.read).length;
}
