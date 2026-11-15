import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { C, sans } from '@/constants/theme';
import type { Evento } from '@/lib/api';
import { followMeeting, isFollowing, LIVE_ACTIVITY_WINDOW_MS, liveActivitiesSupported, loadLiveActivitiesPreference, unfollowMeeting } from '@/lib/live-activity';

import { tapFeedback } from './ui';

type Platform = { name: string; icon: keyof typeof Ionicons.glyphMap };

/** Recognises the video platform from the meeting link. */
export function meetingPlatform(link: string | null): Platform | null {
  if (!link) return null;
  const host = (() => { try { return new URL(link).hostname; } catch { return ''; } })();
  if (host.includes('meet.google')) return { name: 'Google Meet', icon: 'videocam' };
  if (host.includes('zoom')) return { name: 'Zoom', icon: 'videocam' };
  if (host.includes('teams.microsoft') || host.includes('teams.live')) return { name: 'Teams', icon: 'videocam' };
  if (host.includes('youtube') || host.includes('youtu.be')) return { name: 'YouTube', icon: 'logo-youtube' };
  if (host.includes('whatsapp')) return { name: 'WhatsApp', icon: 'logo-whatsapp' };
  return { name: 'la sala', icon: 'videocam' };
}

function time(date: Date) {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function relative(date: Date, now: Date) {
  const mins = Math.round((date.getTime() - now.getTime()) / 60_000);
  if (mins < 60) return `En ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `En ${hours} h`;
  const day = new Intl.DateTimeFormat('es', { weekday: 'long' }).format(date);
  return day.charAt(0).toUpperCase() + day.slice(1);
}

/**
 * Premium meeting card: local start time as the hero, platform-aware call to
 * action ("Unirme por Google Meet"), live state with a red badge.
 */
export function MeetingCard({ evento, next, live, now }: { evento: Evento; next: Date | null; live: boolean; now: Date }) {
  const link = evento.link && /^https?:\/\//i.test(evento.link) ? evento.link : null;
  const platform = meetingPlatform(link);
  const isImage = !!evento.icono && /^https?:\/\//.test(evento.icono);
  const recurrence = evento.horario.split('·')[0].trim();
  const [liveActivitiesEnabled, setLiveActivitiesEnabled] = useState(true);
  useFocusEffect(useCallback(() => {
    let active = true;
    loadLiveActivitiesPreference().then((enabled) => { if (active) setLiveActivitiesEnabled(enabled); }).catch(() => {});
    return () => { active = false; };
  }, []));
  // Dynamic Island countdown: iPhone only, meetings starting within 8 h.
  const canFollow = liveActivitiesSupported && liveActivitiesEnabled && !!link && !!platform && !!next && !live && next.getTime() - now.getTime() < LIVE_ACTIVITY_WINDOW_MS;
  const [following, setFollowing] = useState(() => (next ? isFollowing(evento.id, next) : false));

  return (
    <View style={[m.card, live && m.cardLive]}>
      <View style={m.top}>
        <View style={m.art}>
          {isImage
            ? <Image source={{ uri: evento.icono! }} style={{ width: 34, height: 34 }} contentFit="contain" />
            : <Text style={{ fontSize: 22 }}>{evento.icono || '✦'}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={m.title} numberOfLines={2}>{evento.titulo.trim()}</Text>
          <Text style={m.recurrence}>{recurrence}</Text>
        </View>
        {next ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[m.time, live && { color: C.live }]}>{time(next)}</Text>
            <Text style={[m.when, live && { color: C.live }]}>{live ? 'Ahora' : relative(next, now)}</Text>
          </View>
        ) : null}
      </View>

      {live ? (
        <View style={m.liveRow}>
          <View style={m.liveDot} />
          <Text style={m.liveText}>En vivo · la reunión ya comenzó</Text>
        </View>
      ) : null}

      {canFollow ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: following }}
          onPress={() => {
            tapFeedback();
            if (following) { void unfollowMeeting(evento.id, next!); setFollowing(false); }
            else setFollowing(followMeeting({ eventoId: evento.id, titulo: evento.titulo.trim(), startsAt: next!, link: link!, platform: platform!.name }));
          }}
          style={({ pressed }) => [m.follow, following && m.followOn, pressed && { opacity: 0.85 }]}>
          <Ionicons name={following ? 'checkmark-circle' : 'phone-portrait-outline'} size={16} color={following ? '#fff' : C.wine} />
          <Text style={[m.followText, following && { color: '#fff' }]}>
            {following ? 'Cuenta atrás en la Dynamic Island' : 'Seguir en la Dynamic Island'}
          </Text>
        </Pressable>
      ) : null}

      {link && platform ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Unirme por ${platform.name} a ${evento.titulo}`}
          onPress={() => { tapFeedback(); void Linking.openURL(link); }}
          style={({ pressed }) => [m.cta, live ? m.ctaLive : m.ctaIdle, pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 }]}>
          <Ionicons name={platform.icon} size={18} color={live ? '#fff' : C.wine} />
          <Text style={[m.ctaText, { color: live ? '#fff' : C.wine }]}>
            {live ? `Unirme ahora por ${platform.name}` : `Unirme por ${platform.name}`}
          </Text>
          <Ionicons name="arrow-forward" size={16} color={live ? '#fff' : C.wine} style={{ marginLeft: 'auto' }} />
        </Pressable>
      ) : null}
    </View>
  );
}

const m = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 22, padding: 16, gap: 14, boxShadow: '0 1px 2px rgba(63,38,35,0.04), 0 10px 28px rgba(63,38,35,0.07)' },
  cardLive: { borderWidth: 1.5, borderColor: 'rgba(214,69,69,0.45)', boxShadow: '0 12px 32px rgba(214,69,69,0.18)' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  art: { width: 50, height: 50, borderRadius: 14, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: sans, fontSize: 17, lineHeight: 21, fontWeight: '600', letterSpacing: -0.3, color: C.ink },
  recurrence: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 2 },
  time: { fontFamily: sans, fontSize: 24, fontWeight: '700', letterSpacing: -0.6, color: C.ink, fontVariant: ['tabular-nums'] },
  when: { fontFamily: sans, fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 1 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -2 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.live },
  liveText: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.live },
  cta: { minHeight: 50, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  ctaIdle: { backgroundColor: C.fill },
  ctaLive: { backgroundColor: C.live },
  follow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: C.fill, marginTop: -4 },
  followOn: { backgroundColor: C.wine },
  followText: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.wine },
  ctaText: { fontFamily: sans, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
});
