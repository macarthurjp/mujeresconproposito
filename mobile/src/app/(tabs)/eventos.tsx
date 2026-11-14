import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { eventStatus } from '@/components/event-card';
import { MeetingCard } from '@/components/meeting-card';
import { ErrorNote, Eyebrow, Loading, Screen, tapFeedback, Title, useAsync } from '@/components/ui';
import { C, sans } from '@/constants/theme';
import { api } from '@/lib/api';

// iOS opens webcal:// straight in Calendar; Android goes through Google Calendar.
const CALENDAR_URL = Platform.OS === 'ios'
  ? 'webcal://mcp930.org/calendario.ics'
  : 'https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Fmcp930.org%2Fcalendario.ics';

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function Eventos() {
  const { data, error, loading, reload } = useAsync(api.eventos);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const groups = useMemo(() => {
    const items = (data ?? [])
      .map((e) => ({ e, ...eventStatus(e, now) }))
      .filter((x) => x.next)
      .sort((a, b) => Number(b.live) - Number(a.live) || a.next!.getTime() - b.next!.getTime());
    return {
      today: items.filter((x) => x.live || sameDay(x.next!, now)),
      later: items.filter((x) => !x.live && !sameDay(x.next!, now)),
    };
  }, [data, now]);

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <View style={{ paddingHorizontal: 20 }}>
        <Eyebrow>Agenda</Eyebrow>
        <Title>Reuniones</Title>
        <Text style={s.intro}>Horarios en tu hora local. Te avisamos 15 minutos antes y cuando empiece.</Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => { tapFeedback(); void Linking.openURL(CALENDAR_URL); }}
          style={({ pressed }) => [s.calendar, pressed && { opacity: 0.85 }]}>
          <View style={s.calendarIcon}><Ionicons name="calendar" size={20} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.calendarTitle}>Añadir a mi calendario</Text>
            <Text style={s.calendarSub}>Todas las reuniones en tu iPhone o Google Calendar</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(60,40,38,0.35)" />
        </Pressable>

        {loading && !data ? <Loading /> : null}
        {error ? <ErrorNote message={error} onRetry={reload} /> : null}

        {groups.today.length ? (
          <>
            <Text style={s.group}>Hoy</Text>
            <View style={s.list}>
              {groups.today.map(({ e, next, live }) => <MeetingCard key={e.id} evento={e} next={next} live={live} now={now} />)}
            </View>
          </>
        ) : null}

        {groups.later.length ? (
          <>
            <Text style={s.group}>Próximos días</Text>
            <View style={s.list}>
              {groups.later.map(({ e, next, live }) => <MeetingCard key={e.id} evento={e} next={next} live={live} now={now} />)}
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: sans, color: C.muted, fontSize: 15, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  calendar: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderRadius: 18, backgroundColor: C.card, boxShadow: '0 1px 2px rgba(63,38,35,0.04), 0 8px 24px rgba(63,38,35,0.06)' },
  calendarIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center' },
  calendarTitle: { fontFamily: sans, fontSize: 16, fontWeight: '600', letterSpacing: -0.3, color: C.ink },
  calendarSub: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 1 },
  group: { fontFamily: sans, fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: C.ink, marginTop: 30, marginBottom: 12 },
  list: { gap: 12 },
});
