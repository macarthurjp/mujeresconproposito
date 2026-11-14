import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, radius, serif } from '@/constants/theme';

export function useAsync<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
    // `load` is a stable module-level function in every caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial load; state is only set from the promise callbacks.
  useEffect(() => {
    let cancelled = false;
    load()
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  return { data, error, loading, reload };
}

export function Screen({
  children,
  onRefresh,
  refreshing = false,
  dark = false,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  dark?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: dark ? C.ink : C.ivory }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 48 }}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.wine} /> : undefined}>
      {children}
    </ScrollView>
  );
}

export function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return <Text style={[styles.eyebrow, light && { color: C.gold2 }]}>{children}</Text>;
}

export function Title({ children, light, size = 34 }: { children: ReactNode; light?: boolean; size?: number }) {
  return <Text style={[styles.title, { fontSize: size, lineHeight: size * 1.1 }, light && { color: '#fff' }]}>{children}</Text>;
}

export function Section({ eyebrow, title, children, style }: { eyebrow?: string; title?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ paddingHorizontal: 20, marginTop: 36 }, style]}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      {title ? <Title size={28}>{title}</Title> : null}
      <View style={{ marginTop: title ? 16 : 0 }}>{children}</View>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'gold' | 'ghost' | 'light';
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    primary: { bg: C.wine, fg: '#fff', border: C.wine },
    gold: { bg: C.gold, fg: C.ink, border: C.gold },
    ghost: { bg: 'transparent', fg: C.ink, border: 'rgba(28,17,23,0.18)' },
    light: { bg: 'transparent', fg: '#fff', border: 'rgba(255,255,255,0.3)' },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: pressed ? 0.85 : 1 },
        style,
      ]}>
      {icon ? <Ionicons name={icon} size={18} color={palette.fg} /> : null}
      <Text style={[styles.buttonText, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Loading() {
  return <ActivityIndicator style={{ marginVertical: 32 }} color={C.wine} />;
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card style={{ alignItems: 'flex-start', gap: 12 }}>
      <Text style={{ color: C.text }}>{message}. Revisa tu conexión.</Text>
      <Button label="Reintentar" variant="ghost" icon="refresh" onPress={onRetry} />
    </Card>
  );
}

export const styles = StyleSheet.create({
  eyebrow: {
    color: C.wine,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: { fontFamily: serif, color: C.ink, fontWeight: '500', letterSpacing: -0.5 },
  card: {
    backgroundColor: C.paper,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(28,17,23,0.14)',
    padding: 18,
    boxShadow: '0 4px 14px rgba(28,17,23,0.06)',
  },
  button: {
    minHeight: 50,
    paddingHorizontal: 22,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: { fontSize: 15, fontWeight: '700' },
  body: { color: C.muted, fontSize: 15, lineHeight: 23 },
});
