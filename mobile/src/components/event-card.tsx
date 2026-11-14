import { Image } from 'expo-image';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { C, sans } from '@/constants/theme';
import type { Evento } from '@/lib/api';
import { isValidTimeZone, nextOccurrence, parseSchedule } from '@/lib/schedule';

import { Button, Card } from './ui';

const LIVE_MINUTES = 90;

export function eventStatus(evento: Evento, now = new Date()) {
  const schedule = parseSchedule(evento.horario);
  const zone = evento.zona_horaria && isValidTimeZone(evento.zona_horaria)
    ? evento.zona_horaria
    : /europ/i.test(evento.titulo) ? 'Europe/Luxembourg' : 'America/Santo_Domingo';
  if (!schedule) return { live: false, next: null as Date | null };
  const next = nextOccurrence(schedule, zone, now, LIVE_MINUTES);
  const live = !!next && next.getTime() <= now.getTime();
  return { live, next };
}

function formatNext(date: Date) {
  const text = new Intl.DateTimeFormat('es', {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function EventCard({ evento, now }: { evento: Evento; now: Date }) {
  const { live, next } = eventStatus(evento, now);
  const isImage = !!evento.icono && /^https?:\/\//.test(evento.icono);
  const link = evento.link && /^https?:\/\//i.test(evento.link) ? evento.link : null;

  return (
    <Card style={[live && { borderColor: C.live, borderWidth: 1.5 }]}>
      <View style={s.row}>
        <View style={s.icon}>
          {isImage ? (
            <Image source={{ uri: evento.icono! }} style={{ width: 30, height: 30 }} contentFit="contain" />
          ) : (
            <Text style={{ fontSize: 20, color: C.wine }}>{evento.icono || '✦'}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          {live ? (
            <View style={s.livePill}>
              <View style={s.liveDot} />
              <Text style={s.liveText}>En vivo ahora</Text>
            </View>
          ) : null}
          <Text style={s.title}>{evento.titulo}</Text>
          <Text style={s.meta}>{evento.horario}</Text>
          {!live && next ? <Text style={s.next}>Próxima: {formatNext(next)} (tu hora)</Text> : null}
        </View>
      </View>
      {link ? (
        <Button
          label={live ? 'Unirme ahora' : 'Abrir enlace'}
          icon={live ? 'videocam' : 'link'}
          variant={live ? 'primary' : 'ghost'}
          onPress={() => Linking.openURL(link)}
          style={{ marginTop: 16 }}
        />
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  icon: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: sans, fontWeight: '600', letterSpacing: -0.3, fontSize: 19, color: C.ink, marginBottom: 4 },
  meta: { color: C.muted, fontSize: 14 },
  next: { color: C.wine, fontSize: 13, marginTop: 6, fontWeight: '600' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#fde8e8', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.live },
  liveText: { color: C.live, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
});
