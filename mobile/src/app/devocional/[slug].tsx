import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorNote, Loading, Screen, useAsync } from '@/components/ui';
import { C, sans, serif, SITE_URL } from '@/constants/theme';
import { api, formatDate, htmlToParagraphs } from '@/lib/api';

function formattedText(value: string, style: object): ReactNode {
  const tokens = value.split(/(\*\*.+?\*\*|\*.+?\*|__.+?__|~~.+?~~)/g);
  return <Text style={style}>{tokens.map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**')) return <Text key={index} style={{ fontWeight: '800' }}>{token.slice(2, -2)}</Text>;
    if (token.startsWith('__') && token.endsWith('__')) return <Text key={index} style={{ textDecorationLine: 'underline' }}>{token.slice(2, -2)}</Text>;
    if (token.startsWith('~~') && token.endsWith('~~')) return <Text key={index} style={{ textDecorationLine: 'line-through' }}>{token.slice(2, -2)}</Text>;
    if (token.startsWith('*') && token.endsWith('*')) return <Text key={index} style={{ fontStyle: 'italic' }}>{token.slice(1, -1)}</Text>;
    return token;
  })}</Text>;
}

export default function DevocionalDetalle() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading, reload } = useAsync(() => api.devocional(String(slug)));

  const paragraphs = data
    ? [...htmlToParagraphs(data.introduccion_html), ...htmlToParagraphs(data.contenido_html)]
    : [];
  const body = paragraphs.length ? paragraphs : (data?.contenido ?? '').split(/\n{2,}/).filter(Boolean);

  return (
    <Screen topInset={false}>
      <Stack.Screen options={{ title: 'Lectura', headerShadowVisible: false, headerStyle: { backgroundColor: C.bg }, headerTintColor: C.wine }} />
      {loading ? <Loading /> : null}
      {error ? <View style={{ paddingHorizontal: 22, paddingTop: 14 }}><ErrorNote message={error} onRetry={reload} /></View> : null}
      {data ? (
        <View style={s.page}>
          <View style={s.hero}>
            {data.imagen_url ? <Image source={{ uri: data.imagen_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} /> : null}
            <LinearGradient
              colors={data.imagen_url ? ['rgba(30,17,18,0.02)', 'rgba(30,17,18,0.18)', 'rgba(30,17,18,0.9)'] : ['#e9c2bc', '#b86258', '#6f3936']}
              locations={[0, 0.42, 1]}
              style={StyleSheet.absoluteFill}
            />
            {!data.imagen_url ? <Ionicons name="book-outline" size={100} color="rgba(255,255,255,0.14)" style={s.heroArt} /> : null}
            <View style={s.heroContent}>
              <View style={s.readingTag}><Ionicons name="sparkles" size={12} color={C.ink} /><Text style={s.readingTagText}>DEVOCIONAL</Text></View>
              <Text style={s.date}>{formatDate(data.fecha_publicacion)}{data.autora ? `  ·  ${data.autora}` : ''}</Text>
              <Text accessibilityRole="header" style={s.title}>{data.titulo}</Text>
            </View>
          </View>

          <View style={s.article}>
            <View style={s.articleLabel}><View style={s.labelRule} /><Text style={s.articleKicker}>UNA PALABRA PARA REFLEXIONAR</Text></View>
            {data.versiculo ? (
              <View style={s.verseCard}>
                <Ionicons name="sparkles" size={16} color={C.gold2} />
                <Text style={s.verse}>{data.versiculo}</Text>
              </View>
            ) : null}
            <View style={s.body}>
            {body.map((p, i) => p.startsWith('## ')
              ? <View key={i} style={s.subheadingRow}>{formattedText(p.slice(3), s.subheading)}</View>
              : p.startsWith('> ')
                ? <View key={i} style={s.quoteRow}>{formattedText(p.slice(2), s.bodyQuote)}</View>
                : p.startsWith('• ')
                  ? <View key={i} style={s.listRow}><Text style={s.listBullet}>•</Text>{formattedText(p.slice(2), s.paragraph)}</View>
                  : <View key={i} style={s.paragraphRow}>
                    {i === 0 ? <View pointerEvents="none" style={s.firstParagraphMark} /> : null}
                    {formattedText(p, s.paragraph)}
                  </View>)}
            </View>
            <View style={s.endMark}><View style={s.endRule} /><Ionicons name="heart" size={15} color={C.rose} /><View style={s.endRule} /></View>
            <View style={s.shareCard}>
              <View style={s.shareIcon}><Ionicons name="paper-plane-outline" size={20} color={C.wine} /></View>
              <View style={s.shareCopy}><Text style={s.shareTitle}>Comparte esta reflexión</Text><Text style={s.shareSubtitle}>Envía esta palabra a alguien especial.</Text></View>
              <Button label="Compartir" icon="share-outline" variant="ghost" style={s.shareButton} onPress={() => Share.share({ message: `${data.titulo} — ${SITE_URL}/d/${data.slug}.html` })} />
            </View>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 17, paddingTop: 8 },
  hero: { minHeight: 405, borderRadius: 29, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: '#98564f', borderWidth: 1, borderColor: 'rgba(255,255,255,0.86)', boxShadow: '0 14px 30px rgba(82,42,39,0.16)' },
  heroArt: { position: 'absolute', top: 68, right: 28 },
  heroContent: { paddingHorizontal: 21, paddingBottom: 23, paddingTop: 64 },
  readingTag: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: 'rgba(255,247,246,0.93)', marginBottom: 13 },
  readingTagText: { color: C.ink, fontFamily: sans, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  date: { color: 'rgba(255,255,255,0.81)', fontFamily: sans, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  title: { color: '#fff', fontFamily: serif, fontSize: 35, lineHeight: 41, fontWeight: '700', letterSpacing: -0.5 },
  article: { paddingHorizontal: 5, paddingTop: 27, paddingBottom: 14 },
  articleLabel: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  labelRule: { width: 23, height: 2, borderRadius: 1, backgroundColor: C.wine },
  articleKicker: { color: C.wine, fontFamily: sans, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  verseCard: { paddingHorizontal: 17, paddingVertical: 17, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(166,75,67,0.11)', boxShadow: '0 6px 18px rgba(63,38,35,0.05)', marginBottom: 22, gap: 10 },
  verse: { fontFamily: serif, fontStyle: 'italic', fontSize: 20, lineHeight: 29, color: C.wine },
  body: { gap: 18 },
  paragraphRow: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  firstParagraphMark: { position: 'absolute', left: -12, top: 0, bottom: 0, width: 2, borderRadius: 2, backgroundColor: 'rgba(166,75,67,0.38)' },
  paragraph: { flex: 1, color: C.text, fontFamily: sans, fontSize: 16, lineHeight: 27, letterSpacing: -0.16, textAlign: 'justify' },
  subheadingRow: { marginTop: 9 },
  subheading: { color: C.ink, fontFamily: serif, fontSize: 24, lineHeight: 30, fontWeight: '700' },
  quoteRow: { borderLeftWidth: 2, borderLeftColor: C.rose, paddingLeft: 13, marginVertical: 4 },
  bodyQuote: { color: C.wine, fontFamily: serif, fontSize: 18, lineHeight: 27, fontStyle: 'italic', textAlign: 'justify' },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  listBullet: { color: C.wine, fontFamily: sans, fontWeight: '800', fontSize: 16 },
  endMark: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 25, marginBottom: 23 },
  endRule: { width: 48, height: 1, backgroundColor: 'rgba(166,75,67,0.18)' },
  shareCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 21, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(63,38,35,0.06)' },
  shareIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  shareCopy: { flex: 1 },
  shareTitle: { color: C.ink, fontFamily: sans, fontSize: 12, fontWeight: '700' },
  shareSubtitle: { color: C.muted, fontFamily: sans, fontSize: 10, lineHeight: 14, marginTop: 3 },
  shareButton: { minHeight: 39, paddingHorizontal: 11, borderRadius: 13, gap: 5 },
});
