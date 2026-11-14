import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, sans } from '@/constants/theme';

import { tapFeedback } from './ui';

export type WheelOption = { value: string; label: string };

/**
 * iOS-style wheel selector in a compact bottom sheet (Cancelar / Listo),
 * instead of a full-page list. On Android the native picker opens its own
 * dialog, so the field itself is the picker.
 */
export function WheelPicker({
  value,
  options,
  placeholder = 'Selecciona una opción',
  title,
  onChange,
  renderValue,
  style,
}: {
  value: string;
  options: WheelOption[];
  placeholder?: string;
  title: string;
  onChange: (value: string) => void;
  renderValue?: (option: WheelOption | undefined) => string;
  style?: object;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const selected = options.find((o) => o.value === value);
  const shown = renderValue ? renderValue(selected) : selected?.label;

  if (Platform.OS === 'android') {
    return (
      <View style={[w.field, style]}>
        <Picker selectedValue={value} onValueChange={(v) => onChange(String(v))} prompt={title} style={{ color: C.ink }}>
          {!value ? <Picker.Item label={placeholder} value="" color="#a58e88" /> : null}
          {options.map((o) => <Picker.Item key={o.value} label={o.label} value={o.value} />)}
        </Picker>
      </View>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${shown || placeholder}`}
        onPress={() => { tapFeedback(); setDraft(value || options[0]?.value || ''); setOpen(true); }}
        style={[w.field, w.row, style]}>
        <Text style={[w.value, !shown && { color: '#a58e88' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{shown || placeholder}</Text>
        <Ionicons name="chevron-expand" size={16} color={C.wine} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={w.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[w.sheet, { paddingBottom: insets.bottom + 6 }]} onPress={() => {}}>
            <View style={w.bar}>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}><Text style={w.cancel}>Cancelar</Text></Pressable>
              <Text style={w.title} numberOfLines={1}>{title}</Text>
              <Pressable
                onPress={() => { tapFeedback(); onChange(draft); setOpen(false); }}
                hitSlop={10}>
                <Text style={w.done}>Listo</Text>
              </Pressable>
            </View>
            <Picker selectedValue={draft} onValueChange={(v) => setDraft(String(v))} itemStyle={w.item}>
              {options.map((o) => <Picker.Item key={o.value} label={o.label} value={o.value} />)}
            </Picker>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const w = StyleSheet.create({
  field: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(28,17,23,0.13)', backgroundColor: '#fffaf9', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  value: { flex: 1, fontFamily: sans, color: C.ink, fontSize: 16 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(25,14,16,0.3)' },
  sheet: { backgroundColor: '#f7f2f1', borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 13, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.separator },
  title: { flex: 1, textAlign: 'center', fontFamily: sans, fontSize: 15, fontWeight: '600', color: C.ink },
  cancel: { fontFamily: sans, fontSize: 16, color: C.muted },
  done: { fontFamily: sans, fontSize: 16, fontWeight: '700', color: C.wine },
  item: { fontFamily: sans, fontSize: 20, color: C.ink },
});
