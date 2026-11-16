import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { eventStatus } from '@/components/event-card';
import { AgendaRow, MeetingHero } from '@/components/meeting-card';
import { ErrorNote, Eyebrow, Loading, Reveal, Screen, tapFeedback, Title, useAsync } from '@/components/ui';
import { C, sans } from '@/constants/theme';
import { api, type Evento } from '@/lib/api';
import { isValidTimeZone, occurrencesBetween, parseSchedule } from '@/lib/schedule';

// iOS opens webcal:// straight in Calendar; Android goes through Google Calendar.
const CALENDAR_URL = Platform.OS === 'ios'
  ? 'webcal://mcp930.org/calendario.ics'
  : 'https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Fmcp930.org%2Fcalendario.ics';

const LIVE_MS = 90 * 60_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function zoneOf(e: Evento) {
  return e.zona_horaria && isValidTimeZone(e.zona_horaria)
    ? e.zona_horaria
    : /europ/i.test(e.titulo) ? 'Europe/Luxembourg' : 'America/Santo_Domingo';
}

type Occurrence = { e: Evento; start: Date; live: boolean };

export default function Eventos() {
  const { data, error, loading, reload } = useAsync(api.eventos);
  const bdays = useAsync(api.birthdays);
  const [now, setNow] = useState(() => new Date());
  const [selected, setSelected] = useState(0); // day offset from today

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const dayKey = startOfDay(now).getTime();
  const today = useMemo(() => new Date(dayKey), [dayKey]);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today]);

  // Every occurrence in the next 7 days, in the visitor's local time.
  const occurrences = useMemo(() => {
    const from = addDays(today, 0);
    const to = addDays(today, 7);
    const list: Occurrence[] = [];
    for (const e of data ?? []) {
      const schedule = parseSchedule(e.horario);
      if (!schedule) continue;
      for (const start of occurrencesBetween(schedule, zoneOf(e), from, to)) {
        const live = start.getTime() <= now.getTime() && now.getTime() - start.getTime() < LIVE_MS;
        list.push({ e, start, live });
      }
    }
    return list.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [data, now, today]);

  const hero = useMemo(() => {
    const items = (data ?? []).map((e) => ({ e, ...eventStatus(e, now) })).filter((x) => x.next);
    items.sort((a, b) => Number(b.live) - Number(a.live) || a.next!.getTime() - b.next!.getTime());
    return items[0] ?? null;
  }, [data, now]);

  const birthdaysOn = (d: Date) => {
    const list = [
      ...(bdays.data?.cumpleanerasHoy ?? []).map((p) => ({ nombreCompleto: p.nombreCompleto, dias: 0 })),
      ...(bdays.data?.proximosCumpleanos ?? []),
    ];
    return list.filter((p) => typeof p.dias === 'number' && addDays(today, p.dias).getTime() === d.getTime());
  };
  const dayBirthdays = birthdaysOn(addDays(today, selected));
  const dayItems = occurrences.filter((o) => startOfDay(o.start).getTime() === addDays(today, selected).getTime());
  const hasMeetings = (d: Date) => occurrences.some((o) => startOfDay(o.start).getTime() === d.getTime()) || birthdaysOn(d).length > 0;
  const selectedDate = addDays(today, selected);
  const selectedLabel = selected === 0 ? 'Hoy' : selected === 1 ? 'Mañana' : (() => {
    const t = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(selectedDate);
    return t.charAt(0).toUpperCase() + t.slice(1);
  })();

  return (
    <Screen onRefresh={() => { reload(); bdays.reload(); }} refreshing={loading && !!data}>
      <View style={{ paddingHorizontal: 20 }}>
        <Eyebrow>Agenda</Eyebrow>
        <Title>Reuniones</Title>
        <Text style={s.intro}>En tu hora local. Te avisamos 15 minutos antes y cuando empiece.</Text>

        {loading && !data ? <Loading /> : null}
        {error ? <ErrorNote message={error} onRetry={reload} /> : null}

        {hero ? <MeetingHero evento={hero.e} next={hero.next!} live={hero.live} now={now} /> : null}

        {data ? (
          <>
            <View style={s.weekHead}>
              <Text style={s.group}>Esta semana</Text>
            </View>
            <View style={s.week}>
              {week.map((d, i) => {
                const on = i === selected;
                const dot = hasMeetings(d);
                return (
                  <Pressable
                    key={d.toISOString()}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric' }).format(d)}
                    onPress={() => { tapFeedback(); setSelected(i); }}
                    style={[s.day, on && s.dayOn]}>
                    <Text style={[s.dayName, on && { color: 'rgba(255,255,255,0.85)' }]}>
                      {new Intl.DateTimeFormat('es', { weekday: 'short' }).format(d).replace('.', '').slice(0, 3).toUpperCase()}
                    </Text>
                    <Text style={[s.dayNum, on && { color: '#fff' }, i === 0 && !on && { color: C.wine }]}>{d.getDate()}</Text>
                    <View style={[s.dot, !dot && { opacity: 0 }, on && { backgroundColor: '#fff' }]} />
                  </Pressable>
                );
              })}
            </View>

            <Text style={s.dayTitle}>{selectedLabel}</Text>
            {dayItems.length || dayBirthdays.length ? (
              <View style={s.list}>
                {dayBirthdays.map((p) => (
                  <View key={`bday-${p.nombreCompleto}`} style={s.bday}>
                    <View style={s.bdayTime}><Text style={{ fontSize: 20 }}>🎂</Text><Text style={s.bdaySub} numberOfLines={1}>Todo el día</Text></View>
                    <View style={s.bdayRule} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.bdayTitle} numberOfLines={1}>Cumpleaños de {p.nombreCompleto}</Text>
                      <Text style={s.bdaySub}>{p.dias === 0 ? '¡Hoy! No olvides felicitarla' : 'No olvides felicitarla'}</Text>
                    </View>
                  </View>
                ))}
                {dayItems.map((o, i) => <Reveal key={`${o.e.id}-${o.start.getTime()}`} index={i}><AgendaRow evento={o.e} start={o.start} live={o.live} now={now} /></Reveal>)}
              </View>
            ) : (
              <View style={s.empty}>
                <Ionicons name="cafe-outline" size={20} color={C.wine} />
                <Text style={s.emptyText}>No hay reuniones este día. Descansa y vuelve pronto.</Text>
              </View>
            )}
          </>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => { tapFeedback(); void Linking.openURL(CALENDAR_URL); }}
          style={({ pressed }) => [s.calendar, pressed && { opacity: 0.85 }]}>
          <View style={s.calendarIcon}><Ionicons name="calendar" size={18} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.calendarTitle}>Añadir a mi calendario</Text>
            <Text style={s.calendarSub}>{Platform.OS === 'ios' ? 'Todas las reuniones en tu iPhone o Google Calendar' : 'Todas las reuniones en el calendario de tu teléfono'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(60,40,38,0.35)" />
        </Pressable>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: sans, color: C.muted, fontSize: 15, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  weekHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 30, marginBottom: 12 },
  group: { fontFamily: sans, fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: C.ink },
  week: { flexDirection: 'row', gap: 6, padding: 6, borderRadius: 20, backgroundColor: C.card, boxShadow: '0 1px 2px rgba(63,38,35,0.04), 0 6px 18px rgba(63,38,35,0.05)' },
  day: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 14, gap: 3 },
  dayOn: { backgroundColor: C.wine, boxShadow: '0 6px 14px rgba(166,75,67,0.3)' },
  dayName: { fontFamily: sans, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, color: C.muted },
  dayNum: { fontFamily: sans, fontSize: 18, fontWeight: '700', color: C.ink, fontVariant: ['tabular-nums'] },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.wine },
  dayTitle: { fontFamily: sans, fontSize: 15, fontWeight: '700', color: C.muted, marginTop: 20, marginBottom: 10, marginLeft: 4 },
  list: { gap: 10 },
  bday: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#fdf1ee' },
  bdayTime: { width: 64 },
  bdayRule: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: C.gold },
  bdayTitle: { fontFamily: sans, fontSize: 16, fontWeight: '600', color: C.ink },
  bdaySub: { fontFamily: sans, fontSize: 12, color: C.muted, marginTop: 1 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 18, backgroundColor: C.sand },
  emptyText: { flex: 1, fontFamily: sans, fontSize: 14, color: C.muted },
  calendar: { marginTop: 28, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderRadius: 18, backgroundColor: C.card, boxShadow: '0 1px 2px rgba(63,38,35,0.04), 0 8px 24px rgba(63,38,35,0.06)' },
  calendarIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center' },
  calendarTitle: { fontFamily: sans, fontSize: 16, fontWeight: '600', letterSpacing: -0.3, color: C.ink },
  calendarSub: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 1 },
});
