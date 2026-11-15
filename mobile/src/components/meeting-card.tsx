import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentProps } from 'react';

import { C, sans, serif } from '@/constants/theme';
import type { Evento } from '@/lib/api';
import { followMeeting, isFollowing, LIVE_ACTIVITY_WINDOW_MS, liveActivitiesSupported, loadLiveActivitiesPreference, unfollowMeeting } from '@/lib/live-activity';

import { tapFeedback } from './ui';

type Platform = { name: string; icon: keyof typeof Ionicons.glyphMap };
type AppIconName = ComponentProps<typeof Ionicons>['name'];

export function EventArtwork({ icon, size, tint, emojiSize }: { icon: string | null; size: number; tint: string; emojiSize: number }) {
  const value = icon || '✦';
  if (/^https?:\/\//.test(value)) return <Image source={{ uri: value }} style={{ width: size * 1.3, height: size * 1.3 }} contentFit="cover" />;
  if (value.startsWith('ion:')) return <Ionicons name={value.slice(4) as AppIconName} size={emojiSize} color={tint} />;
  return <Text style={{ fontSize: emojiSize }}>{value}</Text>;
}

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
          <EventArtwork icon={evento.icono} size={50} tint={C.wine} emojiSize={32} />
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
  art: { width: 50, height: 50, borderRadius: 14, backgroundColor: 'transparent', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
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


function useFollow(evento: Evento, next: Date | null, live: boolean, now: Date) {
  const link = evento.link && /^https?:\/\//i.test(evento.link) ? evento.link : null;
  const platform = meetingPlatform(link);
  const [enabled, setEnabled] = useState(true);
  useFocusEffect(useCallback(() => {
    let active = true;
    loadLiveActivitiesPreference().then((value) => { if (active) setEnabled(value); }).catch(() => {});
    return () => { active = false; };
  }, []));
  const canFollow = liveActivitiesSupported && enabled && !!link && !!platform && !!next && !live && next.getTime() - now.getTime() < LIVE_ACTIVITY_WINDOW_MS;
  const [following, setFollowing] = useState(() => (next ? isFollowing(evento.id, next) : false));
  const toggle = () => {
    tapFeedback();
    if (following) { void unfollowMeeting(evento.id, next!); setFollowing(false); }
    else setFollowing(followMeeting({ eventoId: evento.id, titulo: evento.titulo.trim(), startsAt: next!, link: link!, platform: platform!.name }));
  };
  return { link, platform, canFollow, following, toggle };
}

function dayLabel(date: Date, now: Date) {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(date) - startOf(now)) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  const text = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'short' }).format(date).replace('.', '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Hero card for the next (or live) meeting. */
export function MeetingHero({ evento, next, live, now }: { evento: Evento; next: Date; live: boolean; now: Date }) {
  const { link, platform, canFollow, following, toggle } = useFollow(evento, next, live, now);
  return (
    <View style={h.card}>
      <LinearGradient colors={live ? ['#d85a4e', '#b8433b', '#8f2f2a'] : ['#b8645a', '#a64b43', '#7f3530']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={h.glow} />
      <View style={h.top}>
        <View style={[h.badge, live && h.badgeLive]}>
          {live ? <View style={h.liveDot} /> : <Ionicons name="time-outline" size={12} color="#fff" />}
          <Text style={h.badgeText}>{live ? 'EN VIVO AHORA' : 'PRÓXIMA REUNIÓN'}</Text>
        </View>
        <View style={h.art}>
          <EventArtwork icon={evento.icono} size={46} tint="#fff" emojiSize={28} />
        </View>
      </View>
      <Text style={h.title} numberOfLines={2}>{evento.titulo.trim()}</Text>
      <View style={h.whenRow}>
        <Text style={h.time}>{time(next)}</Text>
        <View>
          <Text style={h.day}>{dayLabel(next, now)}</Text>
          <Text style={h.relative}>{live ? 'La reunión ya comenzó' : relative(next, now)}</Text>
        </View>
      </View>
      {link && platform ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Unirme por ${platform.name} a ${evento.titulo}`}
          onPress={() => { tapFeedback(); void Linking.openURL(link); }}
          style={({ pressed }) => [h.join, pressed && { transform: [{ scale: 0.98 }], opacity: 0.94 }]}>
          <Ionicons name={platform.icon} size={18} color={C.wine} />
          <Text style={h.joinText}>{live ? `Unirme ahora por ${platform.name}` : `Unirme por ${platform.name}`}</Text>
        </Pressable>
      ) : null}
      {canFollow ? (
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: following }} onPress={toggle} style={({ pressed }) => [h.follow, pressed && { opacity: 0.85 }]}>
          <Ionicons name={following ? 'checkmark-circle' : 'phone-portrait-outline'} size={15} color="#fff" />
          <Text style={h.followText}>{following ? 'Cuenta atrás en la Dynamic Island' : 'Seguir en la Dynamic Island'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Compact agenda row: time column, title and a round join button. */
export function AgendaRow({ evento, start, live, now }: { evento: Evento; start: Date; live: boolean; now: Date }) {
  const link = evento.link && /^https?:\/\//i.test(evento.link) ? evento.link : null;
  const platform = meetingPlatform(link);
  const recurrence = evento.horario.split('·')[0].trim();
  const past = !live && start.getTime() < now.getTime();
  return (
    <View style={[a.row, live && a.rowLive, past && { opacity: 0.5 }]}>
      <View style={a.timeCol}>
        <Text style={[a.time, live && { color: C.live }]}>{time(start)}</Text>
        <Text style={[a.sub, live && { color: C.live }]}>{live ? 'En vivo' : past ? 'Terminó' : relative(start, now).replace(/^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)$/i, '')}</Text>
      </View>
      <View style={[a.rule, live && { backgroundColor: C.live }]} />
      <View style={a.art}>
        <EventArtwork icon={evento.icono} size={38} tint={C.wine} emojiSize={24} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={a.title} numberOfLines={2}>{evento.titulo.trim()}</Text>
        <Text style={a.recurrence} numberOfLines={1}>{recurrence}</Text>
      </View>
      {link && platform && !past ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Unirme por ${platform.name} a ${evento.titulo}`}
          hitSlop={6}
          onPress={() => { tapFeedback(); void Linking.openURL(link); }}
          style={({ pressed }) => [a.join, live && a.joinLive, pressed && { transform: [{ scale: 0.94 }] }]}>
          <Ionicons name={platform.icon} size={17} color={live ? '#fff' : C.wine} />
        </Pressable>
      ) : null}
    </View>
  );
}

const h = StyleSheet.create({
  card: { borderRadius: 26, overflow: 'hidden', padding: 20, gap: 14, boxShadow: '0 18px 40px rgba(127,53,48,0.28)' },
  glow: { position: 'absolute', top: -80, right: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.10)' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
  badgeLive: { backgroundColor: 'rgba(255,255,255,0.24)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  badgeText: { fontFamily: sans, fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#fff' },
  art: { width: 46, height: 46, borderRadius: 14, backgroundColor: 'transparent', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: serif, fontSize: 30, lineHeight: 35, color: '#fff', letterSpacing: -0.3 },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  time: { fontFamily: sans, fontSize: 44, lineHeight: 48, fontWeight: '700', letterSpacing: -1.5, color: '#fff', fontVariant: ['tabular-nums'] },
  day: { fontFamily: sans, fontSize: 15, fontWeight: '700', color: '#fff' },
  relative: { fontFamily: sans, fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 1 },
  join: { minHeight: 52, borderRadius: 15, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  joinText: { fontFamily: sans, fontSize: 16, fontWeight: '700', color: C.wine, letterSpacing: -0.2 },
  follow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: -4 },
  followText: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: '#fff' },
});

const a = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.card, boxShadow: '0 1px 2px rgba(63,38,35,0.04), 0 6px 18px rgba(63,38,35,0.05)' },
  rowLive: { borderWidth: 1.5, borderColor: 'rgba(214,69,69,0.4)' },
  timeCol: { width: 54, alignItems: 'flex-start' },
  time: { fontFamily: sans, fontSize: 17, fontWeight: '700', color: C.ink, fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  sub: { fontFamily: sans, fontSize: 11, fontWeight: '600', color: C.muted, marginTop: 1 },
  rule: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: C.blush },
  art: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'transparent', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: sans, fontSize: 16, fontWeight: '600', color: C.ink, letterSpacing: -0.2 },
  recurrence: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 1 },
  join: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.fill, alignItems: 'center', justifyContent: 'center' },
  joinLive: { backgroundColor: C.live },
});
