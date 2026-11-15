import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Eyebrow, Screen, Title } from '@/components/ui';
import { WheelPicker } from '@/components/wheel-picker';
import { C, sans } from '@/constants/theme';
import {
  DEFAULT_BIRTHDAY_PUSH, getBirthdayPushPrefs, saveBirthdayPushPrefs, type BirthdayPushPrefs, type PushStatus,
} from '@/lib/notifications';

const REMINDERS = [
  { value: 2, title: 'Dos días antes', detail: 'Un aviso para preparar la felicitación.' },
  { value: 1, title: 'Un día antes', detail: 'Un recordatorio el día anterior.' },
  { value: 0, title: 'El día del cumpleaños', detail: 'Celebra con la comunidad ese mismo día.' },
] as const;
const HOURS = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: `${String(hour).padStart(2, '0')} h` }));
const MINUTES = [0, 15, 30, 45].map((minute) => ({ value: String(minute), label: `${String(minute).padStart(2, '0')} min` }));

function PreferenceRow({ title, detail, value, onPress }: { title: string; detail: string; value: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={onPress} style={s.reminderRow}>
      <View style={[s.check, value && s.checkOn]}>{value ? <Ionicons name="checkmark" size={17} color="#fff" /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.reminderTitle}>{title}</Text>
        <Text style={s.reminderDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

export default function BirthdayReminders() {
  const [prefs, setPrefs] = useState<BirthdayPushPrefs>(DEFAULT_BIRTHDAY_PUSH);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<PushStatus | null>(null);

  useEffect(() => {
    let active = true;
    void getBirthdayPushPrefs().then((value) => { if (active) setPrefs(value); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const toggleReminder = (value: number) => setPrefs((current) => ({
    ...current,
    avisos: current.avisos.includes(value) ? current.avisos.filter((item) => item !== value) : [...current.avisos, value].sort((a, b) => b - a),
  }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const nextStatus = await saveBirthdayPushPrefs(prefs);
      setStatus(nextStatus);
      if (nextStatus === 'denied') {
        Alert.alert('Activa las notificaciones', 'Permite las notificaciones de Mujeres con Propósito en los ajustes del dispositivo.', [
          { text: 'Ahora no', style: 'cancel' },
          { text: 'Abrir ajustes', onPress: () => { void Linking.openSettings(); } },
        ]);
      } else if (nextStatus === 'unsupported') {
        Alert.alert('No disponible', 'Los avisos de cumpleaños requieren un dispositivo móvil compatible.');
      } else if (nextStatus === 'undetermined') {
        Alert.alert('Activa las notificaciones', 'Para recibir los recordatorios, permite las notificaciones de Mujeres con Propósito en Ajustes del dispositivo.', [
          { text: 'Ahora no', style: 'cancel' },
          { text: 'Abrir ajustes', onPress: () => { void Linking.openSettings(); } },
        ]);
      } else if (nextStatus === 'error') {
        Alert.alert('No se pudo guardar', 'El dispositivo no pudo sincronizar esta preferencia. Revisa la conexión y vuelve a intentarlo.');
      } else if (nextStatus === 'granted' || !prefs.avisos.length) {
        Alert.alert('Preferencias guardadas', prefs.avisos.length ? 'Este dispositivo recibirá los avisos seleccionados a la hora indicada.' : 'Los avisos de cumpleaños quedaron desactivados en este dispositivo.');
      }
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Avisos de cumpleaños' }} />
      <View style={s.page}>
        <View style={s.heroIcon}><Ionicons name="gift-outline" size={27} color={C.wine} /></View>
        <Eyebrow>Recordatorios</Eyebrow>
        <Title size={30}>Celebra a tiempo</Title>
        <Text style={s.intro}>Elige qué días quieres recibir un aviso y a qué hora. La preferencia se guarda para este dispositivo.</Text>

        {loading ? <ActivityIndicator color={C.wine} style={{ marginTop: 30 }} /> : <>
          <View style={s.card}>
            {REMINDERS.map((item, index) => <View key={item.value}>
              {index > 0 ? <View style={s.separator} /> : null}
              <PreferenceRow title={item.title} detail={item.detail} value={prefs.avisos.includes(item.value)} onPress={() => toggleReminder(item.value)} />
            </View>)}
          </View>

          <Text style={s.sectionLabel}>Hora del aviso</Text>
          <View style={s.timeRow}>
            <View style={{ flex: 1 }}><WheelPicker title="Hora" value={String(prefs.hora)} options={HOURS} onChange={(value) => setPrefs((current) => ({ ...current, hora: Number(value) }))} /></View>
            <Text style={s.colon}>:</Text>
            <View style={{ flex: 1 }}><WheelPicker title="Minutos" value={String(prefs.minuto)} options={MINUTES} onChange={(value) => setPrefs((current) => ({ ...current, minuto: Number(value) }))} /></View>
          </View>
          <Text style={s.note}>Usamos la hora local de tu teléfono. Puedes cambiar estas opciones cuando quieras.</Text>
          <Button label={saving ? 'Guardando…' : 'Guardar preferencias'} icon="checkmark" onPress={() => { void save(); }} style={{ marginTop: 22 }} />
          {status === 'granted' ? <Text style={s.saved}>Notificaciones activas en este dispositivo</Text> : null}
        </>}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 30 },
  heroIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  intro: { color: C.muted, fontFamily: sans, fontSize: 15, lineHeight: 22, marginTop: 8 },
  card: { marginTop: 25, backgroundColor: C.card, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 4, boxShadow: '0 8px 24px rgba(91,48,55,0.07)' },
  reminderRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12 },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.wine, borderColor: C.wine },
  reminderTitle: { color: C.ink, fontFamily: sans, fontSize: 15, fontWeight: '600' },
  reminderDetail: { color: C.muted, fontFamily: sans, fontSize: 12, lineHeight: 17, marginTop: 3 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: C.separator, marginLeft: 37 },
  sectionLabel: { color: C.muted, fontFamily: sans, fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 25, marginBottom: 9 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  colon: { color: C.ink, fontFamily: sans, fontSize: 20, fontWeight: '600' },
  note: { color: C.muted, fontFamily: sans, fontSize: 12, lineHeight: 18, marginTop: 10 },
  saved: { color: '#588264', fontFamily: sans, fontSize: 12, textAlign: 'center', marginTop: 10 },
});
