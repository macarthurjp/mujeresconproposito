import { Platform } from 'react-native';

import type { MeetingActivityProps } from '@/widgets/meeting-activity';

// Dynamic Island / Lock Screen Live Activities for meetings (iOS 16.1+).
// The widget module only exists in iOS builds, so it is loaded lazily.
type Factory = typeof import('@/widgets/meeting-activity').default;
type Instance = ReturnType<Factory['start']>;

export const liveActivitiesSupported = Platform.OS === 'ios';

// iOS ends Live Activities after 8 hours, so only offer it for meetings starting within that window.
export const LIVE_ACTIVITY_WINDOW_MS = 8 * 60 * 60 * 1000;
const MEETING_LENGTH_MS = 90 * 60 * 1000;

function factory(): Factory | null {
  if (!liveActivitiesSupported) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@/widgets/meeting-activity').default as Factory;
  } catch {
    return null;
  }
}

// Activities started in this app session, with the props we sent them.
const active = new Map<string, { instance: Instance; props: MeetingActivityProps }>();
const keyFor = (eventoId: string, startsAt: Date) => `${eventoId}@${startsAt.getTime()}`;

export function isFollowing(eventoId: string, startsAt: Date) {
  return active.has(keyFor(eventoId, startsAt));
}

/**
 * Starts a live countdown in the Dynamic Island for a meeting. Tapping it
 * opens the app on /join, which opens the meeting link.
 */
export function followMeeting(params: { eventoId: string; titulo: string; startsAt: Date; link: string; platform: string }) {
  const f = factory();
  if (!f) return false;
  const key = keyFor(params.eventoId, params.startsAt);
  if (active.has(key)) return true;
  const props: MeetingActivityProps = {
    titulo: params.titulo,
    startsAt: params.startsAt.getTime(),
    live: Date.now() >= params.startsAt.getTime(),
    platform: params.platform,
  };
  try {
    const url = `mcp930://join?link=${encodeURIComponent(params.link)}`;
    const staleDate = new Date(params.startsAt.getTime() + MEETING_LENGTH_MS);
    active.set(key, { instance: f.start(props, url, staleDate), props });
    return true;
  } catch {
    return false;
  }
}

export async function unfollowMeeting(eventoId: string, startsAt: Date) {
  const key = keyFor(eventoId, startsAt);
  const entry = active.get(key);
  active.delete(key);
  await entry?.instance.end('immediate').catch(() => {});
}

/**
 * Called periodically while the app is open: flips activities to "EN VIVO"
 * when the meeting starts and ends them once it is over.
 */
export async function refreshLiveActivities(now = new Date()) {
  for (const [key, entry] of active) {
    if (now.getTime() > entry.props.startsAt + MEETING_LENGTH_MS) {
      active.delete(key);
      await entry.instance.end('default').catch(() => {});
    } else if (now.getTime() >= entry.props.startsAt && !entry.props.live) {
      entry.props = { ...entry.props, live: true };
      await entry.instance.update(entry.props).catch(() => {});
    }
  }
}
