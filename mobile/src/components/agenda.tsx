import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { C, sans } from '@/constants/theme';
import type { Evento } from '@/lib/api';

import { eventStatus } from './event-card';
import { tapFeedback } from './ui';

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayLabel(date: Date, now: Date) {
  const diff = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (diff <= 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  const name = new Intl.DateTimeFormat('es', { weekday: 'long' }).format(date);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function timeLabel(date: Date) {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

/** Recurrence without the hour (the hour shown is already in local time). */
function recurrence(horario: string) {
  return horario.split('·')[0].trim() || horario;
}

const safeLink = (value: string | null) => (value && /^https?:\/\//i.test(value) ? value : null);

/**
 * Upcoming activities in the viewer's local time, as an iOS-style grouped
 * list. Live meetings come first with a join button.
 */
export function Agenda({ eventos, limit = 5 }: { eventos: Evento[]; limit?: number }) {
  const now = useNow();
  const items = useMemo(
    () =>
      eventos
        .map((evento) => ({ evento, ...eventStatus(evento, now) }))
        .filter((item) => item.next)
        .sort((a, b) => Number(b.live) - Number(a.live) || a.next!.getTime() - b.next!.getTime())
        .slice(0, limit),
    [eventos, now, limit],
  );

  if (!items.length) {
    return (
      <View style={s.card}>
        <Text style={s.empty}>Pronto anunciaremos nuevas actividades.</Text>
      </View>
    );
  }

  return (
    <View style={s.card}>
      {items.map(({ evento, next, live }, index) => {
        const link = safeLink(evento.link);
        return (
          <Pressable
            key={evento.id}
            accessibilityRole="button"
            accessibilityLabel={`${evento.titulo}, ${dayLabel(next!, now)} a las ${timeLabel(next!)}${live ? ', en vivo' : ''}`}
            onPress={() => {
              tapFeedback();
              if (live && link) Linking.openURL(link);
              else router.push('/eventos');
            }}
            style={({ pressed }) => [s.row, index > 0 && s.rowDivider, pressed && { backgroundColor: C.fill }]}>
            <View style={s.when}>
              <Text style={[s.time, live && { color: C.live }]}>{timeLabel(next!)}</Text>
              <Text style={[s.day, live && { color: C.live }]}>{live ? 'Ahora' : dayLabel(next!, now)}</Text>
            </View>
            <View style={[s.accent, live && { backgroundColor: C.live }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.title} numberOfLines={1}>{evento.titulo.trim()}</Text>
              <Text style={s.meta} numberOfLines={1}>{recurrence(evento.horario)}</Text>
            </View>
            {live && link ? (
              <View style={s.livePill}>
                <View style={s.liveDot} />
                <Text style={s.liveText}>Unirme</Text>
              </View>
            ) : (
              <Ionicons name="chevron-forward" size={18} color="rgba(60,40,38,0.3)" />
            )}
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        onPress={() => { tapFeedback(); router.push('/eventos'); }}
        style={({ pressed }) => [s.row, s.rowDivider, s.footer, pressed && { backgroundColor: C.fill }]}>
        <Text style={s.footerText}>Ver todas las reuniones</Text>
        <Ionicons name="chevron-forward" size={18} color={C.wine} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    overflow: 'hidden',
    boxShadow: '0 1px 2px rgba(63,38,35,0.04), 0 8px 24px rgba(63,38,35,0.06)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  when: { width: 58 },
  time: { fontFamily: sans, fontSize: 20, fontWeight: '700', letterSpacing: -0.5, color: C.ink, fontVariant: ['tabular-nums'] },
  day: { fontFamily: sans, fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 1 },
  accent: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: C.rose },
  title: { fontFamily: sans, fontSize: 16, fontWeight: '600', letterSpacing: -0.3, color: C.ink },
  meta: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 2 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: C.live },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { fontFamily: sans, fontSize: 13, fontWeight: '700', color: '#fff' },
  footer: { justifyContent: 'space-between', paddingVertical: 15 },
  footerText: { fontFamily: sans, fontSize: 15, fontWeight: '600', color: C.wine },
  empty: { fontFamily: sans, fontSize: 15, color: C.muted, padding: 18 },
});
