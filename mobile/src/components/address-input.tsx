import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';

import { C, sans } from '@/constants/theme';
import { searchPlaces, type PlaceSuggestion } from '@/lib/places';

/**
 * Text field with address suggestions while typing (OpenStreetMap). Picking a
 * suggestion fills the field; anything typed by hand (e.g. "En línea") is kept.
 */
export function AddressInput({ value, onChangeText, placeholder = 'Dirección o “En línea”', style }: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const picked = useRef('');

  useEffect(() => {
    if (!query || query === picked.current) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try { setItems(await searchPlaces(query, controller.signal)); }
      catch { if (!controller.signal.aborted) setItems([]); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  return (
    <View>
      <View style={a.inputRow}>
        <Ionicons name="location-outline" size={17} color={C.wine} />
        <TextInput
          value={value}
          onChangeText={(text) => { onChangeText(text); setQuery(text); if (!text.trim()) setItems([]); }}
          placeholder={placeholder}
          placeholderTextColor="#a58e88"
          autoCorrect={false}
          accessibilityLabel="Dirección del evento"
          style={[a.input, style]}
        />
        {loading ? <ActivityIndicator size="small" color={C.wine} /> : null}
      </View>
      {items.length ? (
        <View style={a.list} accessibilityRole="list">
          {items.map((item, i) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Usar ${item.label}`}
              onPress={() => { picked.current = item.label; onChangeText(item.label); setItems([]); setQuery(''); }}
              style={({ pressed }) => [a.item, i > 0 && a.itemSep, pressed && { backgroundColor: C.fill }]}>
              <Ionicons name="navigate-outline" size={15} color={C.muted} />
              <Text style={a.itemText} numberOfLines={2}>{item.label}</Text>
            </Pressable>
          ))}
          <Text style={a.credit}>Sugerencias de OpenStreetMap</Text>
        </View>
      ) : null}
    </View>
  );
}

const a = StyleSheet.create({
  inputRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: C.separator, backgroundColor: '#fffaf9', paddingHorizontal: 12 },
  input: { flex: 1, minWidth: 0, paddingVertical: 10, fontFamily: sans, fontSize: 16, color: C.ink, outlineStyle: 'none' } as object,
  list: { marginTop: 6, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.separator, backgroundColor: C.card, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11 },
  itemSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  itemText: { flex: 1, fontFamily: sans, fontSize: 15, color: C.ink },
  credit: { paddingHorizontal: 12, paddingVertical: 6, fontFamily: sans, fontSize: 11, color: C.muted, textAlign: 'right' },
});
