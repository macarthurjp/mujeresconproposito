import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ErrorNote, Eyebrow, Loading, Screen, Title, useAsync } from '@/components/ui';
import { C, sans, serif } from '@/constants/theme';
import { api, formatDate } from '@/lib/api';

export default function Devocionales() {
  const { data, error, loading, reload } = useAsync(api.devocionales);
  const [featured, ...archive] = data ?? [];

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <View style={s.page}>
        <View style={s.masthead}>
          <View style={s.headingCopy}>
            <Eyebrow>Un espacio para tu fe</Eyebrow>
            <Title editorial size={36}>Devocional</Title>
          </View>
          <View style={s.headerMark}><Ionicons name="book-outline" size={22} color={C.wine} /></View>
        </View>
        <Text style={s.intro}>Una pausa para escuchar, reflexionar y caminar con propósito.</Text>

        {loading && !data ? <Loading /> : null}
        {error ? <ErrorNote message={error} onRetry={reload} /> : null}

        {featured ? (
          <>
            <View style={s.sectionHead}>
              <Text style={s.sectionEyebrow}>PARA ACOMPAÑARTE</Text>
              <View style={s.rule} />
            </View>
            <Link key={featured.id} href={{ pathname: '/devocional/[slug]', params: { slug: featured.slug } }} asChild>
              <Pressable accessibilityLabel={`Leer devocional: ${featured.titulo ?? 'Reflexión'}`} style={({ pressed }) => [s.featureCard, pressed && s.pressed]}>
                {featured.imagen_url ? <Image source={{ uri: featured.imagen_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} /> : null}
                <LinearGradient
                  colors={featured.imagen_url ? ['rgba(35,19,20,0.03)', 'rgba(35,19,20,0.12)', 'rgba(35,19,20,0.88)'] : ['#e9c2bc', '#b86258', '#6f3936']}
                  locations={[0, 0.38, 1]}
                  style={StyleSheet.absoluteFill}
                />
                {!featured.imagen_url ? <Ionicons name="sunny-outline" size={110} color="rgba(255,255,255,0.16)" style={s.emptyArt} /> : null}
                <View style={s.featureTop}>
                  <View style={s.featureBadge}><Ionicons name="sparkles" size={12} color={C.ink} /><Text style={s.featureBadgeText}>LECTURA DESTACADA</Text></View>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </View>
                <View style={s.featureBottom}>
                  <Text style={s.featureDate}>{formatDate(featured.fecha_publicacion).toLocaleUpperCase()}  ·  {featured.autora}</Text>
                  <Text style={s.featureTitle} numberOfLines={3}>{featured.titulo ?? 'Reflexión para hoy'}</Text>
                  {featured.resumen ? <Text style={s.featureSummary} numberOfLines={2}>{featured.resumen}</Text> : null}
                  <View style={s.readLink}><Text style={s.readLinkText}>Leer reflexión</Text><Ionicons name="arrow-forward" size={16} color="#fff" /></View>
                </View>
              </Pressable>
            </Link>
          </>
        ) : null}

        {archive.length ? (
          <View style={s.archive}>
            <View style={s.archiveHeader}>
              <View><Text style={s.sectionEyebrow}>SIGUE EXPLORANDO</Text><Text style={s.archiveTitle}>Más reflexiones</Text></View>
              <Text style={s.count}>{archive.length.toString().padStart(2, '0')}</Text>
            </View>
            <View style={s.archiveList}>
              {archive.map((d, index) => (
                <Link key={d.id} href={{ pathname: '/devocional/[slug]', params: { slug: d.slug } }} asChild>
                  <Pressable style={({ pressed }) => [s.archiveRow, pressed && s.rowPressed]}>
                    <View style={s.thumbWrap}>
                      {d.imagen_url ? <Image source={{ uri: d.imagen_url }} style={s.thumb} contentFit="cover" transition={200} /> : <View style={s.thumbFallback}><Ionicons name="book-outline" size={22} color={C.wine} /></View>}
                      <View style={s.thumbIndex}><Text style={s.thumbIndexText}>{String(index + 2).padStart(2, '0')}</Text></View>
                    </View>
                    <View style={s.archiveText}>
                      <Text style={s.archiveDate}>{formatDate(d.fecha_publicacion)}</Text>
                      <Text style={s.archiveItemTitle} numberOfLines={2}>{d.titulo ?? 'Reflexión'}</Text>
                      {d.resumen ? <Text style={s.archiveSummary} numberOfLines={2}>{d.resumen}</Text> : null}
                    </View>
                    <View style={s.chevron}><Ionicons name="arrow-forward" size={16} color={C.wine} /></View>
                  </Pressable>
                </Link>
              ))}
            </View>
          </View>
        ) : null}

        {!loading && !error && !featured ? (
          <View style={s.emptyState}><View style={s.emptyIcon}><Ionicons name="book-outline" size={25} color={C.wine} /></View><Text style={s.emptyTitle}>Pronto habrá nuevas reflexiones</Text><Text style={s.emptyCopy}>Vuelve a visitarnos para encontrar una palabra que te acompañe.</Text></View>
        ) : null}
        <View style={s.footer}><View style={s.footerLine} /><Ionicons name="heart" size={14} color={C.rose} /><View style={s.footerLine} /></View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 22 },
  masthead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  headingCopy: { flex: 1 },
  headerMark: { height: 48, width: 48, borderRadius: 17, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(166,75,67,0.12)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 5px 14px rgba(63,38,35,0.06)' },
  intro: { color: C.muted, fontFamily: sans, fontSize: 15, lineHeight: 23, marginTop: 8, maxWidth: 310, textAlign: 'justify' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 28, marginBottom: 13 },
  sectionEyebrow: { color: C.wine, fontFamily: sans, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  rule: { height: 1, flex: 1, backgroundColor: 'rgba(166,75,67,0.17)' },
  featureCard: { minHeight: 420, borderRadius: 28, overflow: 'hidden', backgroundColor: '#9c5a53', justifyContent: 'space-between', boxShadow: '0 16px 34px rgba(82,42,39,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)' },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.95 },
  emptyArt: { position: 'absolute', top: 68, right: 28 },
  featureTop: { paddingHorizontal: 19, paddingTop: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  featureBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: 'rgba(255,247,246,0.93)' },
  featureBadgeText: { color: C.ink, fontFamily: sans, fontWeight: '800', fontSize: 9, letterSpacing: 1 },
  featureBottom: { paddingHorizontal: 21, paddingBottom: 22, paddingTop: 58 },
  featureDate: { color: 'rgba(255,255,255,0.83)', fontFamily: sans, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, marginBottom: 10 },
  featureTitle: { color: '#fff', fontFamily: serif, fontSize: 34, lineHeight: 39, fontWeight: '700', letterSpacing: -0.5 },
  featureSummary: { color: 'rgba(255,255,255,0.88)', fontFamily: sans, fontSize: 14, lineHeight: 21, marginTop: 9, textAlign: 'justify' },
  readLink: { flexDirection: 'row', alignItems: 'center', gap: 9, alignSelf: 'flex-start', marginTop: 17, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.17)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.29)' },
  readLinkText: { color: '#fff', fontFamily: sans, fontSize: 13, fontWeight: '700' },
  archive: { marginTop: 34, marginBottom: 10 },
  archiveHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 },
  archiveTitle: { fontFamily: serif, fontSize: 27, lineHeight: 33, fontWeight: '700', color: C.ink, marginTop: 4 },
  count: { color: '#bba19b', fontFamily: serif, fontSize: 26, lineHeight: 30 },
  archiveList: { gap: 11 },
  archiveRow: { minHeight: 118, flexDirection: 'row', alignItems: 'center', padding: 10, gap: 13, borderRadius: 21, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(63,38,35,0.06)', boxShadow: '0 5px 16px rgba(63,38,35,0.045)' },
  rowPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  thumbWrap: { width: 88, height: 96, borderRadius: 15, overflow: 'hidden', backgroundColor: C.blush },
  thumb: { width: '100%', height: '100%' },
  thumbFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blush },
  thumbIndex: { position: 'absolute', left: 6, bottom: 6, minWidth: 25, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,247,246,0.92)' },
  thumbIndexText: { color: C.wine, fontFamily: sans, fontSize: 9, fontWeight: '800' },
  archiveText: { flex: 1, paddingVertical: 4 },
  archiveDate: { color: C.wine, fontFamily: sans, fontSize: 9, fontWeight: '800', letterSpacing: 0.65, textTransform: 'uppercase', marginBottom: 5 },
  archiveItemTitle: { color: C.ink, fontFamily: serif, fontWeight: '700', fontSize: 19, lineHeight: 23 },
  archiveSummary: { color: C.muted, fontFamily: sans, fontSize: 11, lineHeight: 16, marginTop: 4, textAlign: 'justify' },
  chevron: { width: 31, height: 31, borderRadius: 16, backgroundColor: C.fill, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', padding: 28, marginTop: 25, borderRadius: 25, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  emptyIcon: { width: 54, height: 54, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blush, marginBottom: 13 },
  emptyTitle: { color: C.ink, fontFamily: serif, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  emptyCopy: { color: C.muted, fontFamily: sans, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 30, marginBottom: 10 },
  footerLine: { width: 55, height: 1, backgroundColor: 'rgba(166,75,67,0.16)' },
});
