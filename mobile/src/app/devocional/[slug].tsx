import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Share, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorNote, Loading, Screen, styles as ui, useAsync } from '@/components/ui';
import { C, serif, SITE_URL } from '@/constants/theme';
import { api, formatDate, htmlToParagraphs } from '@/lib/api';

export default function DevocionalDetalle() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading, reload } = useAsync(() => api.devocional(String(slug)));

  const paragraphs = data
    ? [...htmlToParagraphs(data.introduccion_html), ...htmlToParagraphs(data.contenido_html)]
    : [];
  const body = paragraphs.length ? paragraphs : (data?.contenido ?? '').split(/\n{2,}/).filter(Boolean);

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      {loading ? <Loading /> : null}
      {error ? <View style={{ padding: 20 }}><ErrorNote message={error} onRetry={reload} /></View> : null}
      {data ? (
        <View>
          {data.imagen_url ? <Image source={{ uri: data.imagen_url }} style={s.cover} contentFit="cover" /> : null}
          <View style={{ padding: 22 }}>
            <Text style={ui.eyebrow}>{formatDate(data.fecha_publicacion)} · {data.autora}</Text>
            <Text style={s.title}>{data.titulo}</Text>
            {data.versiculo ? <Text style={s.verse}>{data.versiculo}</Text> : null}
            {body.map((p, i) => (
              <Text key={i} style={s.p}>{p}</Text>
            ))}
            <Button
              label="Compartir"
              icon="share-outline"
              variant="ghost"
              style={{ marginTop: 20 }}
              onPress={() => Share.share({ message: `${data.titulo} — ${SITE_URL}/d/${data.slug}.html` })}
            />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  cover: { width: '100%', aspectRatio: 16 / 10, backgroundColor: C.sand },
  title: { fontFamily: serif, fontSize: 32, lineHeight: 38, color: C.ink, marginBottom: 16 },
  verse: { fontFamily: serif, fontStyle: 'italic', fontSize: 19, lineHeight: 27, color: C.wine, borderLeftWidth: 2, borderLeftColor: C.gold, paddingLeft: 14, marginBottom: 20 },
  p: { color: C.text, fontSize: 17, lineHeight: 28, marginBottom: 16 },
});
