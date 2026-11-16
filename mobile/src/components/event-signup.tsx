import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { C, sans, serif } from '@/constants/theme';
import { api, type Destacada } from '@/lib/api';

import { tapFeedback } from './ui';

const SIGNED_KEY = 'mcp930:event-signups';

async function signedEvents(): Promise<string[]> {
  try { return JSON.parse((await AsyncStorage.getItem(SIGNED_KEY)) || '[]'); } catch { return []; }
}
async function markSigned(id: string) {
  const list = await signedEvents();
  if (!list.includes(id)) await AsyncStorage.setItem(SIGNED_KEY, JSON.stringify([...list, id]));
}

export function eventWhen(d: Destacada) {
  if (!d.fecha_evento) return null;
  const date = new Date(d.fecha_evento);
  const text = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Local reminder the day before the event (same time), if it is still ahead. */
async function scheduleReminder(d: Destacada) {
  if (Platform.OS === 'web' || !d.fecha_evento) return;
  const at = new Date(new Date(d.fecha_evento).getTime() - 24 * 3600_000);
  if (at.getTime() < Date.now() + 60_000) return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && (await Notifications.requestPermissionsAsync()).status !== 'granted') return;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Mañana es tu evento', body: `${d.nombre}${d.lugar ? ` · ${d.lugar}` : ''}`, sound: 'default', data: { type: 'event_reminder', id: d.id } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
  });
}

/** "Inscribirme" button + sign-up sheet for destacadas with registration open. */
export function EventSignup({ destacada }: { destacada: Destacada }) {
  const [open, setOpen] = useState(false);
  const [signed, setSigned] = useState(false);
  const [places, setPlaces] = useState<{ ocupados: number; cupo: number | null } | null>(null);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [extra, setExtra] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void signedEvents().then((list) => { if (alive) setSigned(list.includes(destacada.id)); });
    void api.plazasEvento(destacada.id).then((p) => { if (alive) setPlaces(p); }).catch(() => {});
    return () => { alive = false; };
  }, [destacada.id]);

  const left = places?.cupo ? Math.max(0, places.cupo - places.ocupados) : null;
  const full = left === 0;
  const when = eventWhen(destacada);

  const submit = async () => {
    if (nombre.trim().length < 2) return Alert.alert('Falta tu nombre', 'Escribe tu nombre y apellido.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return Alert.alert('Correo no válido', 'Revisa tu correo electrónico.');
    setBusy(true);
    try {
      const result = await api.inscribirse(destacada.id, nombre.trim(), email.trim(), telefono.trim(), extra);
      setPlaces({ ocupados: result.ocupados, cupo: result.cupo });
      await markSigned(destacada.id);
      await scheduleReminder(destacada).catch(() => {});
      setSigned(true);
      setOpen(false);
      tapFeedback();
      Alert.alert('¡Inscripción confirmada!', destacada.fecha_evento ? 'Te recordaremos el evento el día anterior.' : 'Te esperamos.');
    } catch (error) {
      Alert.alert('No se pudo completar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={s.box}>
        {when || destacada.lugar ? (
          <View style={{ gap: 4 }}>
            {when ? <View style={s.infoRow}><Ionicons name="calendar-outline" size={15} color={C.wine} /><Text style={s.info}>{when}</Text></View> : null}
            {destacada.lugar ? <View style={s.infoRow}><Ionicons name="location-outline" size={15} color={C.wine} /><Text style={s.info}>{destacada.lugar}</Text></View> : null}
          </View>
        ) : null}
        {signed ? (
          <View style={[s.button, s.buttonDone]}><Ionicons name="checkmark-circle" size={18} color="#2f7d4f" /><Text style={[s.buttonText, { color: '#2f7d4f' }]}>Estás inscrita</Text></View>
        ) : (
          <Pressable accessibilityRole="button" disabled={full} onPress={() => { tapFeedback(); setOpen(true); }} style={({ pressed }) => [s.button, full && s.buttonFull, pressed && { opacity: 0.9 }]}>
            <Ionicons name={full ? 'close-circle-outline' : 'person-add-outline'} size={18} color={full ? C.muted : '#fff'} />
            <Text style={[s.buttonText, full && { color: C.muted }]}>{full ? 'Sin plazas disponibles' : 'Inscribirme'}</Text>
          </Pressable>
        )}
        {left !== null && !full ? <Text style={s.places}>{left === 1 ? 'Queda 1 plaza' : `Quedan ${left} plazas`}</Text> : null}
      </View>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.bar}>
            <Pressable hitSlop={10} onPress={() => setOpen(false)} style={{ width: 80 }}><Text style={s.cancel}>Cancelar</Text></Pressable>
            <Text style={s.barTitle}>Inscripción</Text>
            <Pressable hitSlop={10} disabled={busy} onPress={() => void submit()} style={{ width: 80, alignItems: 'flex-end' }}>
              {busy ? <ActivityIndicator color={C.wine} /> : <Text style={s.done}>Enviar</Text>}
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
            <Text style={s.eventName}>{destacada.nombre}</Text>
            {destacada.titulo ? <Text style={s.eventSub}>{destacada.titulo}</Text> : null}
            {when ? <Text style={s.eventWhen}>{when}{destacada.lugar ? ` · ${destacada.lugar}` : ''}</Text> : null}
            <View style={s.card}>
              <TextInput value={nombre} onChangeText={setNombre} placeholder="Nombre y apellido" placeholderTextColor="#a58e88" style={s.input} autoComplete="name" textContentType="name" />
              <View style={s.sep} />
              <TextInput value={email} onChangeText={setEmail} placeholder="Correo electrónico" placeholderTextColor="#a58e88" style={s.input} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
              <View style={s.sep} />
              <TextInput value={telefono} onChangeText={setTelefono} placeholder="Teléfono (opcional)" placeholderTextColor="#a58e88" style={s.input} keyboardType="phone-pad" textContentType="telephoneNumber" />
            </View>
            <View style={[s.card, s.stepperRow]}>
              <View style={{ flex: 1 }}><Text style={s.stepLabel}>Acompañantes</Text><Text style={s.stepHint}>Personas que vienen contigo</Text></View>
              <Pressable accessibilityLabel="Menos" onPress={() => setExtra((n) => Math.max(0, n - 1))} style={s.stepBtn}><Ionicons name="remove" size={18} color={C.wine} /></Pressable>
              <Text style={s.stepValue}>{extra}</Text>
              <Pressable accessibilityLabel="Más" onPress={() => setExtra((n) => Math.min(10, n + 1))} style={s.stepBtn}><Ionicons name="add" size={18} color={C.wine} /></Pressable>
            </View>
            <Text style={s.privacy}>Tus datos solo los ve el equipo organizador del evento.</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  box: { gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  info: { fontFamily: sans, fontSize: 13, color: C.ink, flexShrink: 1 },
  button: { minHeight: 46, borderRadius: 14, backgroundColor: C.wine, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonFull: { backgroundColor: C.fill },
  buttonDone: { backgroundColor: 'rgba(47,125,79,0.1)' },
  buttonText: { fontFamily: sans, fontSize: 15, fontWeight: '700', color: '#fff' },
  places: { fontFamily: sans, fontSize: 12, color: C.muted, textAlign: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  barTitle: { fontFamily: sans, fontSize: 17, fontWeight: '600', color: C.ink },
  cancel: { fontFamily: sans, fontSize: 17, color: C.wine },
  done: { fontFamily: sans, fontSize: 17, fontWeight: '700', color: C.wine },
  page: { padding: 18, paddingBottom: 60 },
  eventName: { fontFamily: serif, fontSize: 26, lineHeight: 31, color: C.ink },
  eventSub: { fontFamily: sans, fontSize: 15, color: C.muted, marginTop: 4 },
  eventWhen: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.wine, marginTop: 8 },
  card: { marginTop: 18, backgroundColor: C.card, borderRadius: 14, overflow: 'hidden' },
  input: { minHeight: 50, paddingHorizontal: 16, fontFamily: sans, fontSize: 16, color: C.ink },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.separator, marginLeft: 16 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  stepLabel: { fontFamily: sans, fontSize: 16, color: C.ink },
  stepHint: { fontFamily: sans, fontSize: 12, color: C.muted, marginTop: 1 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.fill, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontFamily: sans, fontSize: 18, fontWeight: '700', color: C.ink, minWidth: 22, textAlign: 'center' },
  privacy: { fontFamily: sans, fontSize: 12, color: C.muted, marginTop: 14, marginLeft: 4 },
});
