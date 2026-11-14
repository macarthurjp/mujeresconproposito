import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';

import { EventCard, eventStatus } from '@/components/event-card';
import { Button, ErrorNote, Eyebrow, Loading, Screen, styles as ui, Title, useAsync } from '@/components/ui';
import { api } from '@/lib/api';

// iOS opens webcal:// straight in Calendar; Android goes through Google Calendar.
const CALENDAR_URL = Platform.OS === 'ios'
  ? 'webcal://mcp930.org/calendario.ics'
  : 'https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Fmcp930.org%2Fcalendario.ics';

export default function Eventos() {
  const { data, error, loading, reload } = useAsync(api.eventos);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const sorted = useMemo(
    () =>
      (data ?? [])
        .map((e) => ({ e, ...eventStatus(e, now) }))
        .sort((a, b) => Number(b.live) - Number(a.live) || (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity)),
    [data, now],
  );

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <View style={{ paddingHorizontal: 20 }}>
        <Eyebrow>Agenda</Eyebrow>
        <Title>Reuniones</Title>
        <Text style={[ui.body, { marginTop: 10, marginBottom: 20 }]}>
          Cuando una reunión empiece te enviaremos un aviso. Tócalo y entrarás directamente.
        </Text>
        <Button
          label="Añadir a mi calendario"
          icon="calendar-outline"
          variant="ghost"
          onPress={() => Linking.openURL(CALENDAR_URL)}
          style={{ marginBottom: 20, alignSelf: 'flex-start' }}
        />
        {loading && !data ? <Loading /> : null}
        {error ? <ErrorNote message={error} onRetry={reload} /> : null}
        <View style={{ gap: 12 }}>
          {sorted.map(({ e }) => (
            <EventCard key={e.id} evento={e} now={now} />
          ))}
        </View>
      </View>
    </Screen>
  );
}
