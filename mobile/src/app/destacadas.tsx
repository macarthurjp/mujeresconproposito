import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventDetailsSheet, SignupBadge } from '@/components/event-signup';
import { PosterCard } from '@/components/media';
import { ErrorNote, Loading, Screen, Title, Eyebrow, useAsync } from '@/components/ui';
import { C, sans, serif } from '@/constants/theme';
import { api } from '@/lib/api';

export default function Destacadas() {
  const { data, error, loading, reload } = useAsync(api.destacadas);
  const [selected, setSelected] = useState<string | null>(null);
  const [signupId, setSignupId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const active = useMemo(() => data?.find((person) => person.id === selected) ?? null, [data, selected]);
  const signupFor = useMemo(() => data?.find((person) => person.id === signupId) ?? null, [data, signupId]);
  const openCount = (data ?? []).filter((d) => d.inscripcion_abierta).length;

  return <>
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <View style={s.container}>
        <Eyebrow>Voces que inspiran</Eyebrow>
        <Title>Conferencistas destacadas</Title>
        <Text style={s.intro}>Mujeres que comparten su fe, sus experiencias y mensajes que fortalecen nuestra comunidad.</Text>
        {data?.length ? (
          <View style={s.summary}>
            <View style={s.summaryItem}><Ionicons name="sparkles-outline" size={15} color={C.wine} /><Text style={s.summaryText}>{data.length} {data.length === 1 ? 'invitada' : 'invitadas'}</Text></View>
            {openCount ? <View style={[s.summaryItem, s.summaryOpen]}><Ionicons name="person-add-outline" size={14} color="#fff" /><Text style={[s.summaryText, { color: '#fff' }]}>{openCount} con inscripción abierta</Text></View> : null}
          </View>
        ) : null}
        {loading && !data ? <Loading /> : null}
        {error ? <ErrorNote message={error} onRetry={reload} /> : null}
        <View style={s.grid}>{(data ?? []).map((d) => (
          <PosterCard
            key={d.id}
            uri={d.foto_url}
            name={d.nombre}
            role={d.titulo}
            eyebrow={d.inscripcion_abierta ? 'Evento con inscripción' : 'Voz destacada'}
            badge={d.inscripcion_abierta ? <SignupBadge /> : null}
            onPress={() => (d.inscripcion_abierta ? setSignupId(d.id) : setSelected(d.id))} />
        ))}</View>
        {!loading && !data?.length && !error ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}><Ionicons name="sparkles-outline" size={24} color={C.wine} /></View>
            <Text style={s.emptyTitle}>Muy pronto</Text>
            <Text style={s.emptyText}>Pronto presentaremos a nuestras conferencistas.</Text>
          </View>
        ) : null}
      </View>
    </Screen>
    <EventDetailsSheet destacada={signupFor} onClose={() => setSignupId(null)} onViewPoster={() => { const id = signupId; setSignupId(null); setTimeout(() => setSelected(id), 350); }} />
    <Modal visible={!!active} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSelected(null)}>
      {active ? <View style={s.modal}>
        <Image source={{ uri: active.foto_url }} style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.3 }] }]} contentFit="cover" blurRadius={60} />
        <LinearGradient colors={['rgba(20,10,11,0.72)', 'rgba(20,10,11,0.86)', 'rgba(20,10,11,0.96)']} style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Cerrar" onPress={() => setSelected(null)} />
        <View style={[s.modalContent, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 28 }]} pointerEvents="box-none">
          <Image source={{ uri: active.foto_url }} style={s.modalImage} contentFit="contain" transition={{ duration: 300, effect: 'cross-dissolve' }} />
          <Text style={s.modalEyebrow}>{active.inscripcion_abierta ? 'Evento con inscripción' : 'Voz destacada'}</Text>
          <Text style={s.modalName}>{active.nombre}</Text>
          {active.titulo ? <Text style={s.modalRole}>{active.titulo}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar póster" hitSlop={10} onPress={() => setSelected(null)} style={[s.close, { top: insets.top + 12 }]}>
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>
      </View> : null}
    </Modal>
  </>;
}

const s = StyleSheet.create({
  container: { paddingHorizontal: 20 },
  intro: { color: C.muted, fontFamily: sans, fontSize: 15, lineHeight: 23, marginTop: 10 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: C.fill },
  summaryOpen: { backgroundColor: C.wine },
  summaryText: { fontFamily: sans, fontSize: 12.5, fontWeight: '600', color: C.wine },
  grid: { gap: 26, marginTop: 24 },
  empty: { alignItems: 'center', gap: 8, padding: 28, marginTop: 24, borderRadius: 24, backgroundColor: C.card },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: serif, fontSize: 22, color: C.ink },
  emptyText: { fontFamily: sans, fontSize: 14, lineHeight: 20, color: C.muted, textAlign: 'center' },
  modal: { flex: 1, backgroundColor: '#140a0b' },
  modalContent: { flex: 1, alignItems: 'center', paddingHorizontal: 20 },
  modalImage: { width: '100%', flex: 1, borderRadius: 16 },
  modalEyebrow: { fontFamily: sans, fontSize: 11, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', color: '#efcfa0', marginTop: 22 },
  modalName: { color: '#fff', fontFamily: serif, letterSpacing: -0.3, fontSize: 28, lineHeight: 33, textAlign: 'center', marginTop: 6 },
  modalRole: { color: 'rgba(255,236,231,0.8)', fontFamily: sans, fontSize: 15, lineHeight: 21, marginTop: 6, textAlign: 'center' },
  close: { position: 'absolute', right: 18, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' },
});
