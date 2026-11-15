import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from 'react-native';

import { C, sans } from '@/constants/theme';

import { tapFeedback } from './ui';

/** iOS Settings-style grouped section: optional header and footer text. */
export function Group({ header, footer, children }: { header?: string; footer?: string; children: ReactNode }) {
  const rows = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View style={f.group}>
      {header ? <Text style={f.header}>{header}</Text> : null}
      <View style={f.card}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 ? <View style={f.sep} /> : null}
            {row}
          </View>
        ))}
      </View>
      {footer ? <Text style={f.footer}>{footer}</Text> : null}
    </View>
  );
}

type IconName = keyof typeof Ionicons.glyphMap;

function Leading({ icon, tint }: { icon?: IconName; tint?: string }) {
  if (!icon) return null;
  return (
    <View style={[f.iconTile, { backgroundColor: tint ?? C.wine }]}>
      <Ionicons name={icon} size={17} color="#fff" />
    </View>
  );
}

/** Tappable row with chevron (navigation) or a trailing value. */
export function Row({ icon, tint, label, value, sub, onPress, destructive, chevron = true }: {
  icon?: IconName; tint?: string; label: string; value?: string; sub?: string;
  onPress?: () => void; destructive?: boolean; chevron?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={() => { tapFeedback(); onPress?.(); }}
      style={({ pressed }) => [f.row, pressed && onPress && { backgroundColor: C.fill }]}>
      <Leading icon={icon} tint={tint} />
      <View style={{ flex: 1 }}>
        <Text style={[f.label, destructive && { color: C.live }]} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={f.sub} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {value ? <Text style={f.value} numberOfLines={1}>{value}</Text> : null}
      {onPress && chevron ? <Ionicons name="chevron-forward" size={17} color="rgba(60,40,38,0.3)" /> : null}
    </Pressable>
  );
}

/** Row with a native iOS/Android switch. */
export function SwitchRow({ icon, tint, label, sub, value, onValueChange, disabled }: {
  icon?: IconName; tint?: string; label: string; sub?: string; value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <View style={[f.row, disabled && { opacity: 0.5 }]}>
      <Leading icon={icon} tint={tint} />
      <View style={{ flex: 1 }}>
        <Text style={f.label}>{label}</Text>
        {sub ? <Text style={f.sub}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={(v) => { tapFeedback(); onValueChange(v); }}
        trackColor={{ true: C.wine, false: '#e5dcda' }}
        thumbColor="#fff"
        ios_backgroundColor="#e5dcda"
        {...({ activeThumbColor: '#fff' } as object)}
      />
    </View>
  );
}

/** Inline text input row: label above, borderless input like iOS forms. */
export function InputRow({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={f.inputRow}>
      <Text style={f.inputLabel}>{label}</Text>
      <TextInput placeholderTextColor="#b3a3a0" style={f.input} {...props} />
    </View>
  );
}

/** Field wrapper for custom controls (pickers, chips…). */
export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={f.inputRow}>
      <Text style={f.inputLabel}>{label}</Text>
      {children}
    </View>
  );
}

/** Multi-select chips (days of the week, etc.). */
const selectionIcons: Record<string, ComponentProps<typeof Ionicons>['name']> = {
  '🙏': 'hand-left-outline', '📖': 'book-outline', '✝️': 'add-circle-outline', '🌅': 'sunny-outline', '🌇': 'partly-sunny-outline',
  '⛪': 'business-outline', '💬': 'chatbubble-ellipses-outline', '👧': 'person-outline', '❤️': 'heart-outline', '✨': 'sparkles-outline',
  '🕊️': 'leaf-outline', '🎵': 'musical-notes-outline', '🎤': 'mic-outline', '🎧': 'headset-outline', '🙌': 'hand-right-outline',
  '🛐': 'leaf-outline', '📿': 'ellipse-outline', '🫶': 'heart-circle-outline', '🤍': 'heart-outline', '🌿': 'leaf-outline',
  '🌸': 'flower-outline', '🌻': 'sunny-outline', '☀️': 'sunny-outline', '🌙': 'moon-outline', '⭐': 'star-outline',
  '🔥': 'flame-outline', '💡': 'bulb-outline', '🧡': 'heart-outline', '👥': 'people-outline', '🤝': 'hand-left-outline',
  '👩‍👩‍👧': 'people-outline', '🧒': 'person-outline', '🏠': 'home-outline', '🌍': 'globe-outline', '📅': 'calendar-outline',
  '🎉': 'balloon-outline', '🗣️': 'chatbubble-outline', '💭': 'chatbox-ellipses-outline', '📝': 'create-outline', '🔔': 'notifications-outline',
};

export function Chips({ options, selected, onToggle, iconOptions = false }: { options: readonly string[]; selected: string[]; onToggle: (o: string) => void; iconOptions?: boolean }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={f.chips} keyboardShouldPersistTaps="handled">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <Pressable
            key={o}
            accessibilityRole="checkbox"
            accessibilityLabel={iconOptions ? `Icono ${o.startsWith('ion:') ? o.slice(4).replaceAll('-', ' ') : o}` : o}
            accessibilityState={{ checked: on }}
            onPress={() => { tapFeedback(); onToggle(o); }}
            style={[iconOptions ? f.iconChip : f.chip, on && f.chipOn]}>
            {iconOptions ? <Ionicons name={(o.startsWith('ion:') ? o.slice(4) : selectionIcons[o] ?? 'ellipse-outline') as ComponentProps<typeof Ionicons>['name']} size={21} color={on ? '#fff' : C.wine} /> : <Text style={[f.chipText, on && { color: '#fff' }]}>{o.length > 4 ? o.slice(0, 3) : o}</Text>}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export const f = StyleSheet.create({
  group: { marginTop: 26 },
  header: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginLeft: 16, marginBottom: 7 },
  footer: { fontFamily: sans, fontSize: 13, color: C.muted, lineHeight: 18, marginHorizontal: 16, marginTop: 7 },
  card: { backgroundColor: C.card, borderRadius: 14, overflow: 'hidden' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.separator, marginLeft: 16 },
  row: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  iconTile: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: sans, fontSize: 16, color: C.ink, letterSpacing: -0.2 },
  sub: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 2 },
  value: { fontFamily: sans, fontSize: 15, color: C.muted, maxWidth: '45%' },
  inputRow: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, gap: 6 },
  inputLabel: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.muted },
  input: { fontFamily: sans, fontSize: 16, color: C.ink, paddingVertical: 4, outlineStyle: 'none' } as object,
  chips: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2, paddingRight: 16 },
  chip: { minWidth: 48, height: 42, paddingHorizontal: 12, borderRadius: 21, backgroundColor: C.fill, alignItems: 'center', justifyContent: 'center' },
  iconChip: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.fill, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: C.wine },
  chipText: { fontFamily: sans, fontSize: 14, fontWeight: '600', color: C.wine },
});
