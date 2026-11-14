import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventCard, eventStatus } from '@/components/event-card';
import { Button, Card, Eyebrow, Section, styles as ui, Title, useAsync } from '@/components/ui';
import { C, serif } from '@/constants/theme';
import { api } from '@/lib/api';
import { getPushStatus, registerForMeetingAlerts, type PushStatus } from '@/lib/notifications';

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const now = useNow();
  const eventos = useAsync(api.eventos);
  const destacadas = useAsync(api.destacadas);
  const videos = useAsync(api.videos);
  const [push, setPush] = useState<PushStatus | null>(null);

  useEffect(() => {
    getPushStatus().then(setPush).catch(() => setPush('unsupported'));
  }, []);

  const upcoming = useMemo(() => {
    return (eventos.data ?? [])
      .map((e) => ({ e, ...eventStatus(e, now) }))
      .filter((x) => x.next)
      .sort((a, b) => a.next!.getTime() - b.next!.getTime());
  }, [eventos.data, now]);
  const live = upcoming.filter((x) => x.live);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.ivory }} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* Hero */}
      <View style={[s.hero, { paddingTop: insets.top + 20 }]}>
        <View style={s.brandRow}>
          <View style={s.mark}>
            <Image source={require('@/assets/images/mcp-mark.png')} style={{ width: 70, height: 70 }} />
          </View>
          <View>
            <Text style={s.brand}>Mujeres con Propósito</Text>
            <Text style={s.brandSub}>930 A.S.B.L.</Text>
          </View>
        </View>
        <Eyebrow>Comunidad cristiana internacional</Eyebrow>
        <Title size={42}>
          Bienvenida a <Text style={{ fontStyle: 'italic', color: C.wine }}>Mujeres</Text> con Propósito
        </Title>
        <Text style={s.heroCopy}>
          Un espacio donde la fe, la hermandad y el propósito se unen para transformar vidas.
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
          <Button label="Reuniones" icon="videocam" variant="primary" onPress={() => router.push('/eventos')} />
          <Button label="Únete" variant="ghost" onPress={() => Linking.openURL('https://mcp930.org/#join')} />
        </View>
      </View>

      {/* Live now */}
      {live.map(({ e }) => (
        <View key={e.id} style={{ paddingHorizontal: 20, marginTop: 20 }}>
          <EventCard evento={e} now={now} />
        </View>
      ))}

      {/* Push opt-in */}
      {push === 'undetermined' || push === 'denied' ? (
        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          <Card style={{ backgroundColor: C.sand, gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Ionicons name="notifications" size={22} color={C.wine} />
              <Text style={[ui.title, { fontSize: 20, flex: 1 }]}>Avísame cuando empiece una reunión</Text>
            </View>
            <Text style={ui.body}>
              Recibirás una notificación en el momento exacto y podrás unirte con un solo toque.
            </Text>
            <Button
              label={push === 'denied' ? 'Abrir ajustes' : 'Activar avisos'}
              icon="notifications-outline"
              onPress={async () => {
                if (push === 'denied') return Linking.openSettings();
                setPush(await registerForMeetingAlerts(true));
              }}
            />
          </Card>
        </View>
      ) : null}

      {/* Next meetings */}
      <Section eyebrow="Agenda" title="Próximas reuniones">
        <View style={{ gap: 12 }}>
          {upcoming
            .filter((x) => !x.live)
            .slice(0, 3)
            .map(({ e }) => (
              <EventCard key={e.id} evento={e} now={now} />
            ))}
          {!eventos.loading && upcoming.length === 0 ? <Text style={ui.body}>Pronto anunciaremos nuevas reuniones.</Text> : null}
        </View>
      </Section>

      {/* Verse */}
      <View style={s.verse}>
        <Text style={s.quote}>“</Text>
        <Text style={s.verseText}>
          El Señor cumplirá en mí su propósito. Tu gran amor, Señor, perdura para siempre; ¡no abandones la obra de tus manos!
        </Text>
        <Text style={[ui.eyebrow, { textAlign: 'center', marginTop: 14 }]}>Salmo 138:8</Text>
      </View>

      {/* Destacadas */}
      {destacadas.data?.length ? (
        <Section eyebrow="Voces que inspiran" title="Destacadas" style={{ paddingHorizontal: 0 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
            {destacadas.data.map((d) => (
              <Pressable key={d.id} onPress={() => router.push('/destacadas')} style={s.portrait}>
                <Image source={{ uri: d.foto_url }} style={s.portraitImg} contentFit="cover" transition={200} />
                <Text style={s.portraitName} numberOfLines={1}>{d.nombre}</Text>
                {d.titulo ? <Text style={s.portraitRole} numberOfLines={1}>{d.titulo}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
        </Section>
      ) : null}

      {/* YouTube */}
      {videos.data?.length ? (
        <Section eyebrow="Canal de YouTube" title="Mensajes que fortalecen tu fe" style={{ paddingHorizontal: 0 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
            {videos.data.map((v) => (
              <Pressable key={v.id} style={s.video} onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${v.video_id}`)}>
                <Image source={{ uri: `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg` }} style={s.videoImg} contentFit="cover" />
                <View style={s.play}><Ionicons name="play" size={18} color="#fff" /></View>
                <Text style={s.videoTitle} numberOfLines={2}>{v.titulo}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Section>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: '#f9e1dc', paddingHorizontal: 22, paddingBottom: 36, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 32 },
  mark: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: '#fff7f5', alignItems: 'center', justifyContent: 'center' },
  brand: { fontFamily: serif, color: C.ink, fontSize: 18 },
  brandSub: { color: C.muted, fontSize: 10, letterSpacing: 2, marginTop: 2 },
  heroCopy: { color: C.muted, fontSize: 16, lineHeight: 24, marginTop: 14 },
  verse: { marginTop: 44, paddingHorizontal: 28, alignItems: 'center' },
  quote: { fontFamily: serif, fontSize: 64, lineHeight: 64, color: C.gold, height: 44 },
  verseText: { fontFamily: serif, fontStyle: 'italic', fontSize: 22, lineHeight: 30, color: C.ink, textAlign: 'center' },
  portrait: { width: 170 },
  portraitImg: { width: 170, height: 212, borderRadius: 16, backgroundColor: C.sand },
  portraitName: { fontFamily: serif, fontSize: 18, color: C.ink, marginTop: 10 },
  portraitRole: { color: C.wine, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 2 },
  video: { width: 260 },
  videoImg: { width: 260, height: 146, borderRadius: 16, backgroundColor: C.sand },
  play: { position: 'absolute', top: 53, left: 110, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(28,17,23,0.7)', alignItems: 'center', justifyContent: 'center' },
  videoTitle: { color: C.text, fontSize: 14, fontWeight: '600', marginTop: 8, lineHeight: 19 },
});
