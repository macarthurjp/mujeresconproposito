import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { createElement, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, sans } from '@/constants/theme';

import { tapFeedback } from './ui';

const pad = (n: number) => String(n).padStart(2, '0');
/** Local date → "YYYY-MM-DD" (no time-zone shift). */
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (v: string) => {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Date field that never asks the user to type a date: iOS wheel in a
 * Cancelar/Listo sheet, Android system calendar, native date input on web.
 * Value is "YYYY-MM-DD".
 */
export function DateField({
  value,
  onChange,
  title,
  placeholder = 'Selecciona la fecha',
  minimumDate = new Date(1920, 0, 1),
  maximumDate = new Date(),
  defaultDate = new Date(1985, 0, 1),
}: {
  value: string;
  onChange: (iso: string) => void;
  title: string;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  defaultDate?: Date;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(value ? fromISO(value) : defaultDate);
  const label = value
    ? new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(fromISO(value))
    : '';

  if (Platform.OS === 'web') {
    // Browser date input (calendar popover); same YYYY-MM-DD value.
    return createElement('input', {
      type: 'date',
      value,
      min: toISO(minimumDate),
      max: toISO(maximumDate),
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      style: { minHeight: 50, borderRadius: 13, border: '1px solid rgba(28,17,23,0.13)', background: '#fffaf9', padding: '0 14px', fontSize: 16, color: C.ink, fontFamily: 'inherit' },
    });
  }

  const openPicker = () => {
    tapFeedback();
    const start = value ? fromISO(value) : defaultDate;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: start,
        mode: 'date',
        minimumDate,
        maximumDate,
        onChange: (event, date) => { if (event.type === 'set' && date) onChange(toISO(date)); },
      });
      return;
    }
    setDraft(start);
    setOpen(true);
  };

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${label || placeholder}`} onPress={openPicker} style={d.field}>
        <Ionicons name="calendar-outline" size={18} color={C.wine} />
        <Text style={[d.value, !label && { color: '#a58e88' }]}>{label || placeholder}</Text>
        <Ionicons name="chevron-expand" size={16} color={C.wine} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={d.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[d.sheet, { paddingBottom: insets.bottom + 6 }]} onPress={() => {}}>
            <View style={d.bar}>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}><Text style={d.cancel}>Cancelar</Text></Pressable>
              <Text style={d.title}>{title}</Text>
              <Pressable onPress={() => { tapFeedback(); onChange(toISO(draft)); setOpen(false); }} hitSlop={10}>
                <Text style={d.done}>Listo</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={draft}
              mode="date"
              display="spinner"
              locale="es-ES"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              themeVariant="light"
              textColor={C.ink}
              onChange={(_, date) => { if (date) setDraft(date); }}
              style={{ alignSelf: 'stretch' }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const d = StyleSheet.create({
  field: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(28,17,23,0.13)', backgroundColor: '#fffaf9', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  value: { flex: 1, fontFamily: sans, fontSize: 16, color: C.ink },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(25,14,16,0.3)' },
  sheet: { backgroundColor: '#f7f2f1', borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 13, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.separator },
  title: { flex: 1, textAlign: 'center', fontFamily: sans, fontSize: 15, fontWeight: '600', color: C.ink },
  cancel: { fontFamily: sans, fontSize: 16, color: C.muted },
  done: { fontFamily: sans, fontSize: 16, fontWeight: '700', color: C.wine },
});
