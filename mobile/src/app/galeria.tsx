import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AlbumCard } from '@/components/media';
import { PhotoViewer } from '@/components/photo-viewer';
import { ErrorNote, Eyebrow, Loading, Reveal, Screen, tapFeedback, Title, useAsync } from '@/components/ui';
import { C, sans } from '@/constants/theme';
import { api, type Foto } from '@/lib/api';
import { albumsFor, GALLERY_REGIONS as REGIONS, type Album, type RegionKey } from '@/lib/gallery';

export default function Galeria() {
  const { data, error, loading, reload } = useAsync(api.galeria);
  const [region, setRegion] = useState<RegionKey>('usa');
  const [open, setOpen] = useState<Album<Foto> | null>(null);
  const { width } = useWindowDimensions();
  const cardWidth = (width - 40 - 14) / 2;

  const albums = useMemo(() => albumsFor(data ?? [], region), [data, region]);
  const photoCount = albums.reduce((sum, album) => sum + album.photos.length, 0);

  return (
    <>
      <Screen onRefresh={reload} refreshing={loading && !!data}>
        <View style={{ paddingHorizontal: 20 }}>
          <Eyebrow>Momentos de comunidad</Eyebrow>
          <Title>Galería</Title>
          <Text style={s.intro}>Elige un país y abre una galería para ver sus fotos.</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs} style={{ marginHorizontal: -20 }}>
            {REGIONS.map((r) => (
              <Pressable
                key={r.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: region === r.key }}
                onPress={() => { tapFeedback(); setRegion(r.key); }}
                style={[s.tab, region === r.key && s.tabActive]}>
                <Text style={[s.tabText, region === r.key && { color: '#fff' }]}>{r.short}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {!loading && !error ? (
            <Text style={s.summary}>
              {albums.length === 1 ? '1 galería' : `${albums.length} galerías`} · {photoCount} fotos
            </Text>
          ) : null}
          {loading && !data ? <Loading /> : null}
          {error ? <ErrorNote message={error} onRetry={reload} /> : null}

          <View style={s.grid}>
            {albums.map((album, i) => (
              <Reveal key={album.key} index={i}><AlbumCard
                title={album.title}
                coverUri={album.cover.foto_url}
                count={album.photos.length}
                width={cardWidth}
                onPress={() => setOpen(album)}
              /></Reveal>
            ))}
          </View>
          {!loading && !albums.length && !error ? <Text style={s.empty}>Aún no hay galerías en esta región.</Text> : null}
        </View>
      </Screen>

      <PhotoViewer visible={!!open} title={open?.title ?? ''} photos={open?.photos ?? []} onClose={() => setOpen(null)} />
    </>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: sans, color: C.muted, fontSize: 15, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 14 },
  tab: { minHeight: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.fill, justifyContent: 'center' },
  tabActive: { backgroundColor: C.wine },
  tabText: { fontFamily: sans, color: C.wine, fontWeight: '600', fontSize: 13 },
  summary: { fontFamily: sans, color: C.muted, fontSize: 13, fontWeight: '600', marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 22 },
  empty: { fontFamily: sans, color: C.muted, marginTop: 20 },
});
