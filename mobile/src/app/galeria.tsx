import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { PhotoTile } from '@/components/media';
import { ErrorNote, Loading, Screen, Title, Eyebrow, useAsync } from '@/components/ui';
import { C } from '@/constants/theme';
import { api } from '@/lib/api';
import { GALLERY_REGIONS as REGIONS, galleryRegionKey } from '@/lib/gallery';


export default function Galeria() {
  const { data, error, loading, reload } = useAsync(api.galeria);
  const [region, setRegion] = useState('usa');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const colWidth = (width - 40 - 10) / 2;

  const fotos = useMemo(() => {
    const r = REGIONS.find((x) => x.key === region)!;
    return (data ?? []).filter((f) => galleryRegionKey(f.categoria) === r.key);
  }, [data, region]);
  const selectedPhoto = fotos.find((photo) => photo.id === selectedId) ?? null;
  // Two-column masonry: each photo goes to the shorter column, so no gaps.
  const columns = useMemo(() => {
    const cols: { items: { f: (typeof fotos)[number]; h: number }[]; total: number }[] = [{ items: [], total: 0 }, { items: [], total: 0 }];
    fotos.slice(1).forEach((f, i) => {
      const h = colWidth * [1.25, 0.95, 1.1, 1.35, 1][i % 5];
      const target = cols[0].total <= cols[1].total ? cols[0] : cols[1];
      target.items.push({ f, h });
      target.total += h + 10;
    });
    return cols;
  }, [fotos, colWidth]);

  return (
    <>
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <View style={{ paddingHorizontal: 20 }}>
        <Eyebrow>Momentos de comunidad</Eyebrow>
        <Title>Galería</Title>
        <Text style={{ color: C.muted, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 18 }}>Una mirada a nuestra familia creciendo unida en fe y propósito.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
          {REGIONS.map((r) => (
            <Pressable key={r.key} onPress={() => setRegion(r.key)} style={[s.tab, region === r.key && s.tabActive]}>
                            <Text style={[s.tabText, region === r.key && { color: '#fff' }]}>{r.short}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {!loading && !error ? <View style={s.countRow}><Text style={s.count}>{fotos.length} {fotos.length === 1 ? 'momento' : 'momentos'}</Text><View style={s.countRule} /></View> : null}
        {loading && !data ? <Loading /> : null}
        {error ? <ErrorNote message={error} onRetry={reload} /> : null}
        {fotos[0] ? (
          <PhotoTile uri={fotos[0].foto_url} caption={fotos[0].texto} onPress={() => setSelectedId(fotos[0].id)} style={{ width: width - 40, height: (width - 40) * 0.72, marginBottom: 10 }} />
        ) : null}
        <View style={s.grid}>
          {columns.map((col, c) => (
            <View key={c} style={{ width: colWidth, gap: 10 }}>
              {col.items.map(({ f, h }) => (
                <PhotoTile key={f.id} uri={f.foto_url} caption={f.texto} onPress={() => setSelectedId(f.id)} style={{ width: colWidth, height: h }} />
              ))}
            </View>
          ))}
        </View>
        {!loading && !fotos.length && !error ? <Text style={{ color: C.muted, marginTop: 20 }}>Aún no hay fotos en esta región.</Text> : null}
      </View>
    </Screen>
    <Modal visible={!!selectedPhoto} transparent animationType="fade" onRequestClose={() => setSelectedId(null)}>
      <Pressable style={s.modal} onPress={() => setSelectedId(null)}>
        {selectedPhoto ? <View style={s.modalContent}>
          <Image source={{ uri: selectedPhoto.foto_url }} style={s.fullPhoto} contentFit="contain" />
          {selectedPhoto.texto ? <Text style={s.fullCaption}>{selectedPhoto.texto}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar foto" onPress={() => setSelectedId(null)} style={s.close}><Ionicons name="close" size={22} color={C.ink} /></Pressable>
        </View> : null}
      </Pressable>
    </Modal>
    </>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, paddingBottom: 14 },
  tab: { minHeight: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.fill, justifyContent: 'center' },
  tabActive: { backgroundColor: C.wine, borderColor: C.wine },
  tabText: { color: C.wine, fontWeight: '600', fontSize: 13 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  count: { color: C.wine, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  countRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(166,75,67,0.22)' },
  grid: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  modal: { flex: 1, backgroundColor: 'rgba(25,14,16,0.94)', justifyContent: 'center', padding: 16 },
  modalContent: { alignItems: 'center' },
  fullPhoto: { width: '100%', height: '78%' },
  fullCaption: { color: '#fff', marginTop: 14, textAlign: 'center', fontSize: 15 },
  close: { position: 'absolute', top: 0, right: 0, width: 40, height: 40, borderRadius: 20, backgroundColor: C.ivory, alignItems: 'center', justifyContent: 'center' },
});
