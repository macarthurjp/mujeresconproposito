import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ErrorNote, Loading, Screen, Title, Eyebrow, useAsync } from '@/components/ui';
import { C, sans } from '@/constants/theme';
import { api } from '@/lib/api';

export default function Destacadas() {
  const { data, error, loading, reload } = useAsync(api.destacadas);
  const [selected, setSelected] = useState<string | null>(null);
  const active = useMemo(() => data?.find((person) => person.id === selected) ?? null, [data, selected]);

  return <>
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <View style={s.container}>
        <Eyebrow>Voces que inspiran</Eyebrow>
        <Title>Conferencistas destacadas</Title>
        <Text style={s.intro}>Mujeres que comparten su fe, sus experiencias y mensajes que fortalecen nuestra comunidad.</Text>
        {loading && !data ? <Loading /> : null}
        {error ? <ErrorNote message={error} onRetry={reload} /> : null}
        <View style={s.grid}>{(data ?? []).map((d) => (
          <Pressable key={d.id} onPress={() => setSelected(d.id)} style={s.card}>
            <View style={s.imageGlow}>
              <View style={s.imageShell}>
                <View style={s.imageFrame}>
                  <Image source={{ uri: d.foto_url }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={24} transition={200} />
                  <View style={s.imageWarmGlow} />
                  <Image source={{ uri: d.foto_url }} style={StyleSheet.absoluteFill} contentFit="contain" transition={200} />
                  <View style={s.expand}><Ionicons name="expand-outline" size={16} color="#fff" /></View>
                </View>
              </View>
            </View>
            <Text style={s.name}>{d.nombre}</Text>
            {d.titulo ? <Text style={s.role}>{d.titulo}</Text> : null}
          </Pressable>
        ))}</View>
        {!loading && !data?.length && !error ? <Text style={s.intro}>Pronto presentaremos a nuestras conferencistas.</Text> : null}
      </View>
    </Screen>
    <Modal visible={!!active} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
      <Pressable style={s.modal} onPress={() => setSelected(null)}>
        {active ? <View style={s.modalContent}>
          <Image source={{ uri: active.foto_url }} style={s.modalImage} contentFit="contain" />
          <Text style={s.modalName}>{active.nombre}</Text>
          {active.titulo ? <Text style={s.modalRole}>{active.titulo}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar foto" onPress={() => setSelected(null)} style={s.close}><Ionicons name="close" size={23} color={C.ink} /></Pressable>
        </View> : null}
      </Pressable>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  container: { paddingHorizontal: 20 },
  intro: { color: C.muted, fontSize: 15, lineHeight: 23, marginTop: 10, marginBottom: 22 },
  grid: { gap: 20 },
  card: { width: '100%' },
  imageGlow: { borderRadius: 36, padding: 2, backgroundColor: 'rgba(166,75,67,0.12)', boxShadow: '0 0 34px rgba(166,75,67,0.28), 0 12px 32px rgba(63,38,35,0.12)' },
  imageShell: { borderRadius: 32, padding: 5, backgroundColor: '#fff8f7', borderWidth: 1, borderColor: 'rgba(166,75,67,0.34)' },
  imageFrame: { width: '100%', aspectRatio: 3 / 4, borderRadius: 18, overflow: 'hidden', backgroundColor: C.ivory, borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  imageWarmGlow: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(246,205,166,0.16)' },
  role: { color: C.wine, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 5 },
  name: { color: C.ink, fontFamily: sans, fontWeight: '600', letterSpacing: -0.3, fontSize: 19, lineHeight: 25, marginTop: 12 },
  expand: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(28,17,23,0.58)', alignItems: 'center', justifyContent: 'center' },
  modal: { flex: 1, backgroundColor: 'rgba(25,14,16,0.94)', justifyContent: 'center', padding: 20 },
  modalContent: { alignItems: 'center' },
  modalImage: { width: '100%', height: '72%' },
  modalName: { color: '#fff', fontFamily: sans, fontWeight: '600', letterSpacing: -0.3, fontSize: 24, textAlign: 'center', marginTop: 18 },
  modalRole: { color: '#f0c5aa', fontSize: 13, marginTop: 6, textAlign: 'center' },
  close: { position: 'absolute', top: 0, right: 0, width: 40, height: 40, borderRadius: 20, backgroundColor: C.ivory, alignItems: 'center', justifyContent: 'center' },
});
