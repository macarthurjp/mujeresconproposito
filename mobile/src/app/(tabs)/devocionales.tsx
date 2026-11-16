import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ErrorNote, Eyebrow, Loading, Screen, tapFeedback, Title, useAsync } from '@/components/ui';
import { C, sans, serif } from '@/constants/theme';
import { api, formatDate, type Devocional } from '@/lib/api';
import { getFavorites } from '@/lib/devotional-library';

const PAGE = 8;

/** Branded cover: the brand flower on blush, shown when there is no photo or it fails to load. */
function Cover({ uri, style }: { uri?: string | null; style: object }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = !!uri && /^https:\/\//i.test(uri) && !failed;
  return (
    <View style={[s.cover, style]}>
      <LinearGradient colors={['#fffaf8', '#fbe9e4', '#f2d3cb']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={s.coverFallback}>
        <Image source={require('@/assets/images/flower.png')} style={s.coverFlower} contentFit="contain" />
        <Text style={s.coverLabel}>Devocional</Text>
      </View>
      {showPhoto ? <Image source={{ uri: uri! }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} onError={() => setFailed(true)} /> : null}
    </View>
  );
}

const minutes = (d: { contenido?: string | null; contenido_html?: string | null }) =>
  Math.max(1, Math.round(String(d.contenido_html || d.contenido || '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length / 200));

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'MC';

function Byline({ d }: { d: Devocional }) {
  const author = d.autora || 'Mujeres con Propósito';
  return (
    <View style={s.byline}>
      <View style={s.avatar}><Text style={s.avatarText}>{initials(author)}</Text></View>
      <Text style={s.bylineName} numberOfLines={1}>{author}</Text>
      <Text style={s.bylineMeta}>· {minutes(d)} min</Text>
    </View>
  );
}

export default function Devocionales() {
  const { data, error, loading, reload } = useAsync(api.devocionales);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [onlyFav, setOnlyFav] = useState(false);
  useFocusEffect(useCallback(() => { void getFavorites().then(setFavorites); }, []));

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    const base = onlyFav ? (data ?? []).filter((d) => favorites.includes(d.slug)) : (data ?? []);
    if (!q) return base;
    return base.filter((d) => [d.titulo, d.resumen, d.autora].join(' ').toLocaleLowerCase('es').includes(q));
  }, [data, query, onlyFav, favorites]);

  const searching = query.trim().length > 0 || onlyFav;
  const featured = !searching ? filtered[0] : undefined;
  const list = searching ? filtered : filtered.slice(1);

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <View style={s.page}>
        <Eyebrow>Un espacio para tu fe</Eyebrow>
        <Title editorial size={40}>Devocional</Title>
        <Text style={s.intro}>Una pausa para escuchar, reflexionar y caminar con propósito.</Text>

        <View style={s.verse}>
          <Text style={s.verseText}>“Tu palabra es una lámpara a mis pies y una luz en mi camino.”</Text>
          <Text style={s.verseRef}>Salmos 119:105</Text>
        </View>

        <View style={s.search}>
          <Ionicons name="search" size={17} color={C.muted} />
          <TextInput
            value={query}
            onChangeText={(v) => { setQuery(v); setShown(PAGE); }}
            placeholder="Buscar por título, tema o autora"
            placeholderTextColor="#9c8784"
            style={s.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
          />
        </View>

        {favorites.length ? (
          <View style={s.filterRow}>
            {[{ v: false, label: 'Todas' }, { v: true, label: `Mis favoritos · ${favorites.length}` }].map((o) => (
              <Pressable key={o.label} onPress={() => { tapFeedback(); setOnlyFav(o.v); setShown(PAGE); }} style={[s.filterChip, onlyFav === o.v && s.filterChipOn]}>
                {o.v ? <Ionicons name="bookmark" size={12} color={onlyFav ? '#fff' : C.wine} /> : null}
                <Text style={[s.filterText, onlyFav === o.v && { color: '#fff' }]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {loading && !data ? <Loading /> : null}
        {error ? <ErrorNote message={error} onRetry={reload} /> : null}

        {featured ? (
          <Link href={{ pathname: '/devocional/[slug]', params: { slug: featured.slug } }} asChild>
            <Pressable accessibilityLabel={`Leer devocional: ${featured.titulo ?? 'Reflexión'}`} onPressIn={tapFeedback}>
              {({ pressed }) => (
                <View style={[s.featured, pressed && s.pressed]}>
                  <Cover uri={featured.imagen_url} style={s.featuredCover} />
                  <View style={s.featuredBody}>
                    <View style={s.badge}><Ionicons name="star" size={10} color={C.wine} /><Text style={s.badgeText}>LECTURA DESTACADA</Text></View>
                    <Text style={s.date}>{formatDate(featured.fecha_publicacion)}</Text>
                    <Text style={s.featuredTitle} numberOfLines={3}>{featured.titulo ?? 'Reflexión para hoy'}</Text>
                    {featured.resumen ? <Text style={s.featuredSummary} numberOfLines={3}>{featured.resumen}</Text> : null}
                    <View style={s.featuredFoot}>
                      <Byline d={featured} />
                      <View style={s.cta}><Text style={s.ctaText}>Leer</Text><Ionicons name="arrow-forward" size={15} color="#fff" /></View>
                    </View>
                  </View>
                </View>
              )}
            </Pressable>
          </Link>
        ) : null}

        {list.length ? (
          <View style={s.archive}>
            <View style={s.archiveHeader}>
              <View><Eyebrow>{onlyFav ? 'Guardadas' : searching ? 'Resultados' : 'Sigue explorando'}</Eyebrow><Text style={s.archiveTitle}>{searching ? `${list.length} ${list.length === 1 ? 'reflexión' : 'reflexiones'}` : 'Más reflexiones'}</Text></View>
            </View>
            <View style={s.archiveList}>
              {list.slice(0, shown).map((d) => (
                <Link key={d.id} href={{ pathname: '/devocional/[slug]', params: { slug: d.slug } }} asChild>
                  <Pressable accessibilityLabel={`Leer devocional: ${d.titulo ?? 'Reflexión'}`} onPressIn={tapFeedback}>
                    {({ pressed }) => (
                      <View style={[s.row, pressed && s.pressed]}>
                        <Cover uri={d.imagen_url} style={s.rowCover} />
                        <View style={s.rowBody}>
                          <Text style={s.date}>{formatDate(d.fecha_publicacion)}</Text>
                          <Text style={s.rowTitle} numberOfLines={2}>{d.titulo ?? 'Reflexión'}</Text>
                          <Byline d={d} />
                        </View>
                      </View>
                    )}
                  </Pressable>
                </Link>
              ))}
            </View>
            {list.length > shown ? (
              <Pressable onPress={() => { tapFeedback(); setShown((n) => n + PAGE); }} style={({ pressed }) => [s.more, pressed && { opacity: 0.8 }]}>
                <Text style={s.moreText}>Ver más reflexiones</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {!loading && !error && !filtered.length ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}><Ionicons name={searching ? 'search' : 'book-outline'} size={24} color={C.wine} /></View>
            <Text style={s.emptyTitle}>{onlyFav ? 'Aún no tienes favoritos' : searching ? 'No encontramos coincidencias' : 'Pronto habrá nuevas reflexiones'}</Text>
            <Text style={s.emptyCopy}>{searching ? 'Prueba con otra palabra o autora.' : 'Vuelve a visitarnos para encontrar una palabra que te acompañe.'}</Text>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingTop: 4 },
  intro: { color: C.muted, fontFamily: sans, fontSize: 16, lineHeight: 23, marginTop: 6 },
  verse: { marginTop: 18, paddingVertical: 12, paddingHorizontal: 16, borderLeftWidth: 3, borderLeftColor: C.gold, backgroundColor: 'rgba(255,255,255,0.7)', borderTopRightRadius: 16, borderBottomRightRadius: 16 },
  verseText: { fontFamily: serif, fontStyle: 'italic', fontSize: 18, lineHeight: 26, color: C.ink },
  verseRef: { fontFamily: sans, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: C.wine, marginTop: 6 },
  search: { marginTop: 18, height: 46, borderRadius: 14, backgroundColor: 'rgba(118,90,86,0.08)', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontFamily: sans, fontSize: 16, color: C.ink, paddingVertical: 0, outlineStyle: 'none' } as object,
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: C.fill },
  filterChipOn: { backgroundColor: C.wine },
  filterText: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.wine },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.94 },
  cover: { overflow: 'hidden', backgroundColor: C.sand },
  coverFallback: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6 },
  coverFlower: { width: 40, height: 64, opacity: 0.6 },
  coverLabel: { fontFamily: serif, fontStyle: 'italic', fontSize: 15, color: C.wine, opacity: 0.8 },
  featured: { marginTop: 22, borderRadius: 24, overflow: 'hidden', backgroundColor: '#fff', boxShadow: '0 2px 6px rgba(63,38,35,0.05), 0 18px 40px rgba(166,75,67,0.14)' },
  featuredCover: { width: '100%', aspectRatio: 16 / 10 },
  featuredBody: { padding: 18, gap: 8 },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: C.blush },
  badgeText: { fontFamily: sans, fontSize: 10, fontWeight: '800', letterSpacing: 0.9, color: C.wine },
  date: { fontFamily: sans, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: C.wine },
  featuredTitle: { fontFamily: serif, fontSize: 28, lineHeight: 33, color: C.ink },
  featuredSummary: { fontFamily: sans, fontSize: 15, lineHeight: 22, color: C.muted },
  featuredFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 6 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: C.wine },
  ctaText: { fontFamily: sans, fontSize: 14, fontWeight: '700', color: '#fff' },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontFamily: sans, fontSize: 9, fontWeight: '700' },
  bylineName: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.ink, flexShrink: 1 },
  bylineMeta: { fontFamily: sans, fontSize: 13, color: C.muted },
  archive: { marginTop: 32 },
  archiveHeader: { marginBottom: 12 },
  archiveTitle: { fontFamily: serif, fontSize: 26, lineHeight: 31, color: C.ink, marginTop: 4 },
  archiveList: { gap: 12 },
  row: { flexDirection: 'row', gap: 14, padding: 10, borderRadius: 20, backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(63,38,35,0.04), 0 6px 18px rgba(63,38,35,0.06)' },
  rowCover: { width: 96, height: 96, borderRadius: 14 },
  rowBody: { flex: 1, justifyContent: 'center', gap: 5, paddingRight: 4 },
  rowTitle: { fontFamily: serif, fontSize: 19, lineHeight: 24, color: C.ink },
  more: { marginTop: 18, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, backgroundColor: C.fill },
  moreText: { fontFamily: sans, fontSize: 15, fontWeight: '600', color: C.wine },
  empty: { alignItems: 'center', padding: 28, marginTop: 24, borderRadius: 24, backgroundColor: '#fff' },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blush, marginBottom: 12 },
  emptyTitle: { color: C.ink, fontFamily: serif, fontSize: 21, textAlign: 'center' },
  emptyCopy: { color: C.muted, fontFamily: sans, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6 },
});
