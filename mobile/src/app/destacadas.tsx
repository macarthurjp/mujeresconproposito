import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { PosterCard } from '@/components/media';
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
          <PosterCard key={d.id} uri={d.foto_url} name={d.nombre} role={d.titulo} onPress={() => setSelected(d.id)} />
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
  modal: { flex: 1, backgroundColor: 'rgba(25,14,16,0.94)', justifyContent: 'center', padding: 20 },
  modalContent: { alignItems: 'center' },
  modalImage: { width: '100%', height: '72%' },
  modalName: { color: '#fff', fontFamily: sans, fontWeight: '600', letterSpacing: -0.3, fontSize: 24, textAlign: 'center', marginTop: 18 },
  modalRole: { color: '#f0c5aa', fontSize: 13, marginTop: 6, textAlign: 'center' },
  close: { position: 'absolute', top: 0, right: 0, width: 40, height: 40, borderRadius: 20, backgroundColor: C.ivory, alignItems: 'center', justifyContent: 'center' },
});
