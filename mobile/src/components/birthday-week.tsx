import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { C, sans } from '@/constants/theme';
import type { Birthday } from '@/lib/api';
import {
  listBirthdayReminders,
  reminderKey,
  REMINDER_OPTIONS,
  remindersSupported,
  setBirthdayReminder,
  type ReminderOption,
} from '@/lib/birthday-reminders';

import { tapFeedback } from './ui';

// Accepts "MM-DD" (public API) or "YYYY-MM-DD".
function monthDayOf(fecha: string) {
  return fecha.length > 5 ? fecha.slice(5, 10) : fecha;
}

function dateLabel(monthDay: string) {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`2000-${monthDay}T12:00:00Z`))
    .replace('.', '')
    .toUpperCase();
}

export function BirthdayWeek({ people }: { people: Birthday[] }) {
  const [reminders, setReminders] = useState<Record<string, string>>({});
  const [active, setActive] = useState<Birthday | null>(null);

  const refresh = useCallback(() => {
    listBirthdayReminders().then(setReminders).catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);

  const choose = async (option: ReminderOption | null) => {
    const person = active;
    setActive(null);
    if (!person?.fecha) return;
    tapFeedback();
    const result = await setBirthdayReminder(person.nombreCompleto, monthDayOf(person.fecha), option);
    if (result === 'denied') {
      Alert.alert('Activa las notificaciones', 'Para recordarte cumpleaños, permite las notificaciones de la app en Ajustes.', [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
      ]);
    } else if (result === 'past') {
      Alert.alert('Ese momento ya pasó', 'Elige un recordatorio más cercano al cumpleaños.');
    }
    refresh();
  };

  const activeKey = active?.fecha ? reminderKey(active.nombreCompleto, monthDayOf(active.fecha)) : '';

  return (
    <>
      <View style={s.list}>
        {people.map((person, index) => {
          const md = person.fecha ? monthDayOf(person.fecha) : '';
          const key = reminderKey(person.nombreCompleto, md);
          const on = Boolean(reminders[key]);
          return (
            <View key={`${key}-${index}`} style={[s.row, index > 0 && s.divider]}>
              <View style={s.badge}><Text style={s.badgeText}>{md ? dateLabel(md) : 'PRONTO'}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{person.nombreCompleto}</Text>
                <Text style={s.when}>{person.dias === 1 ? 'Mañana' : `En ${person.dias} días`}</Text>
              </View>
              {remindersSupported && md ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={on ? `Recordatorio activado para ${person.nombreCompleto}` : `Recordarme el cumpleaños de ${person.nombreCompleto}`}
                  onPress={() => { tapFeedback(); setActive(person); }}
                  hitSlop={8}
                  style={({ pressed }) => [s.remind, on && s.remindOn, pressed && { opacity: 0.7 }]}>
                  <Ionicons name={on ? 'notifications' : 'notifications-outline'} size={15} color={on ? '#fff' : C.wine} />
                  <Text style={[s.remindText, on && { color: '#fff' }]}>{on ? 'Avisaré' : 'Recordarme'}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* iOS-style action sheet */}
      <Modal visible={!!active} transparent animationType="slide" onRequestClose={() => setActive(null)}>
        <Pressable style={s.backdrop} onPress={() => setActive(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.group}>
              <Text style={s.sheetTitle}>¿Cuándo te lo recordamos?</Text>
              <Text style={s.sheetSub}>Cumpleaños de {active?.nombreCompleto}</Text>
              {REMINDER_OPTIONS.map((option) => {
                const selected = reminders[activeKey] === option.key;
                return (
                  <Pressable key={option.key} onPress={() => { void choose(option); }} style={({ pressed }) => [s.option, pressed && { backgroundColor: C.fill }]}>
                    <Text style={s.optionText}>{option.label}</Text>
                    {selected ? <Ionicons name="checkmark" size={20} color={C.wine} /> : null}
                  </Pressable>
                );
              })}
              {reminders[activeKey] ? (
                <Pressable onPress={() => { void choose(null); }} style={({ pressed }) => [s.option, pressed && { backgroundColor: C.fill }]}>
                  <Text style={[s.optionText, { color: C.live }]}>Quitar recordatorio</Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable onPress={() => setActive(null)} style={({ pressed }) => [s.cancel, pressed && { opacity: 0.8 }]}>
              <Text style={s.cancelText}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  list: { backgroundColor: C.card, borderRadius: 20, overflow: 'hidden', boxShadow: '0 1px 2px rgba(63,38,35,0.04), 0 8px 24px rgba(63,38,35,0.06)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  badge: { minWidth: 56, height: 44, borderRadius: 12, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontFamily: sans, color: C.wine, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  name: { fontFamily: sans, color: C.ink, fontSize: 16, fontWeight: '600', letterSpacing: -0.3 },
  when: { fontFamily: sans, color: C.muted, fontSize: 13, marginTop: 1 },
  remind: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: C.fill },
  remindOn: { backgroundColor: C.wine },
  remindText: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.wine },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(25,14,16,0.35)', padding: 10 },
  sheet: { gap: 8, paddingBottom: 18 },
  group: { backgroundColor: 'rgba(255,255,255,0.98)', borderRadius: 16, overflow: 'hidden' },
  sheetTitle: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.muted, textAlign: 'center', paddingTop: 14 },
  sheetSub: { fontFamily: sans, fontSize: 13, color: C.muted, textAlign: 'center', paddingBottom: 12, paddingTop: 2 },
  option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  optionText: { fontFamily: sans, fontSize: 18, color: C.wine },
  cancel: { minHeight: 56, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: sans, fontSize: 18, fontWeight: '600', color: C.wine },
});
