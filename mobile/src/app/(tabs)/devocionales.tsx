import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ErrorNote, Eyebrow, Loading, Screen, styles as ui, Title, useAsync } from '@/components/ui';
import { C, serif } from '@/constants/theme';
import { api, formatDate } from '@/lib/api';

export default function Devocionales() {
  const { data, error, loading, reload } = useAsync(api.devocionales);

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <View style={{ paddingHorizontal: 20 }}>
        <Eyebrow>Palabra para hoy</Eyebrow>
        <Title>Devocionales</Title>
        <View style={{ height: 20 }} />
        {loading && !data ? <Loading /> : null}
        {error ? <ErrorNote message={error} onRetry={reload} /> : null}
        <View style={{ gap: 16 }}>
          {(data ?? []).map((d) => (
            <Link key={d.id} href={{ pathname: '/devocional/[slug]', params: { slug: d.slug } }} asChild>
              <Pressable style={s.card}>
                {d.imagen_url ? <Image source={{ uri: d.imagen_url }} style={s.img} contentFit="cover" transition={200} /> : null}
                <View style={{ padding: 18 }}>
                  <Text style={ui.eyebrow}>{formatDate(d.fecha_publicacion)}</Text>
                  <Text style={s.title}>{d.titulo}</Text>
                  {d.resumen ? <Text style={ui.body} numberOfLines={3}>{d.resumen}</Text> : null}
                </View>
              </Pressable>
            </Link>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.paper, borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(28,17,23,0.14)' },
  img: { width: '100%', aspectRatio: 16 / 9, backgroundColor: C.sand },
  title: { fontFamily: serif, fontSize: 23, lineHeight: 28, color: C.ink, marginBottom: 8 },
});
