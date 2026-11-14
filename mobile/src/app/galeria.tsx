import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ErrorNote, Loading, Screen, Title, Eyebrow, useAsync } from '@/components/ui';
import { C } from '@/constants/theme';
import { api } from '@/lib/api';

// Same three regions as the website gallery tabs.
const REGIONS = [
  { key: 'usa', label: 'Estados Unidos', match: /estados|usa|eeuu|united/i },
  { key: 'rd', label: 'Rep. Dominicana', match: /dominicana|\brd\b/i },
  { key: 'eu', label: 'Europa', match: /europa|europe|luxem|belg|españa|francia/i },
];

export default function Galeria() {
  const { data, error, loading, reload } = useAsync(api.galeria);
  const [region, setRegion] = useState('usa');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const size = (width - 48) / 2;

  const fotos = useMemo(() => {
    const r = REGIONS.find((x) => x.key === region)!;
    return (data ?? []).filter((f) => r.match.test(f.categoria));
  }, [data, region]);
  const selectedPhoto = fotos.find((photo) => photo.id === selectedId) ?? null;

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
              {region === r.key ? <Ionicons name="location" size={14} color="#fff" /> : null}
              <Text style={[s.tabText, region === r.key && { color: '#fff' }]}>{r.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {!loading && !error ? <View style={s.countRow}><Text style={s.count}>{fotos.length} {fotos.length === 1 ? 'momento' : 'momentos'}</Text><View style={s.countRule} /></View> : null}
        {loading && !data ? <Loading /> : null}
        {error ? <ErrorNote message={error} onRetry={reload} /> : null}
        <View style={s.grid}>
          {fotos.map((f, index) => (
            <Pressable key={f.id} accessibilityRole="imagebutton" accessibilityLabel={f.texto || 'Ampliar foto'} onPress={() => setSelectedId(f.id)} style={[s.photoCard, { width: index === 0 ? width - 40 : size, height: index === 0 ? size * 1.08 : size * (index % 2 === 0 ? 1.16 : 0.9) }]}>
              <View style={s.photoShell}>
                <Image source={{ uri: f.foto_url }} style={s.photo} contentFit="cover" transition={250} accessibilityLabel={f.texto ?? undefined} />
                <View style={s.photoShade} />
                {f.texto ? <View style={s.caption}><Text style={s.captionText} numberOfLines={3}>{f.texto}</Text></View> : null}
                <View style={s.zoom}><Ionicons name="expand-outline" size={15} color="#fff" /></View>
              </View>
            </Pressable>
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
  tab: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 15, borderRadius: 999, backgroundColor: C.sand, borderWidth: 1, borderColor: 'rgba(184,134,74,0.2)' },
  tabActive: { backgroundColor: C.wine, borderColor: C.wine },
  tabText: { color: C.muted, fontWeight: '700', fontSize: 12 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  count: { color: C.wine, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  countRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(166,75,67,0.22)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoCard: { borderRadius: 19, padding: 2, backgroundColor: '#fffaf5', borderWidth: 1, borderColor: 'rgba(201,164,107,0.42)', boxShadow: '0 7px 18px rgba(63,38,35,0.1)' },
  photoShell: { flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: C.sand },
  photo: { ...StyleSheet.absoluteFill, backgroundColor: C.sand },
  photoShade: { ...StyleSheet.absoluteFill, top: '58%', backgroundColor: 'rgba(35,20,19,0.3)' },
  caption: { ...StyleSheet.absoluteFill, top: '60%', justifyContent: 'flex-end', padding: 10 },
  captionText: { color: '#fff', fontSize: 12, lineHeight: 17, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 5 },
  zoom: { position: 'absolute', top: 9, right: 9, width: 29, height: 29, borderRadius: 15, backgroundColor: 'rgba(28,17,23,0.48)', alignItems: 'center', justifyContent: 'center' },
  modal: { flex: 1, backgroundColor: 'rgba(25,14,16,0.94)', justifyContent: 'center', padding: 16 },
  modalContent: { alignItems: 'center' },
  fullPhoto: { width: '100%', height: '78%' },
  fullCaption: { color: '#fff', marginTop: 14, textAlign: 'center', fontSize: 15 },
  close: { position: 'absolute', top: 0, right: 0, width: 40, height: 40, borderRadius: 20, backgroundColor: C.ivory, alignItems: 'center', justifyContent: 'center' },
});
