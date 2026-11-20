import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Children, useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, radius, sans, serif, TAB_BAR_SPACE } from '@/constants/theme';
import { useLaunchRevealed } from '@/lib/launch';
import { reportScroll } from '@/lib/scroll-activity';

export function tapFeedback() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}

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
    return fetchData();
  }, [fetchData]);

  // Refresh silently whenever the app comes back to the foreground, so
  // content changed on the server shows up without restarting the app.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchData();
    });
    return () => sub.remove();
  }, [fetchData]);

  return { data, error, loading, reload };
}

export function Screen({
  children,
  onRefresh,
  refreshing = false,
  dark = false,
  topInset = true,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  dark?: boolean;
  topInset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: dark ? C.ink : C.bg }}
      contentContainerStyle={{ paddingTop: (topInset ? insets.top : 0) + 16, paddingBottom: insets.bottom + TAB_BAR_SPACE }}
      onScroll={reportScroll}
      scrollEventThrottle={100}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.wine} colors={[C.wine]} progressBackgroundColor="#ffffff" /> : undefined}>
      {Children.toArray(children).map((child, index) => <Reveal key={index} index={index}>{child}</Reveal>)}
    </ScrollView>
  );
}

export function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return <Text style={[styles.eyebrow, light && { color: C.gold2 }]}>{children}</Text>;
}

export function Title({ children, light, size = 34, editorial = false }: { children: ReactNode; light?: boolean; size?: number; editorial?: boolean }) {
  return (
    <Text
      accessibilityRole="header"
      style={[editorial ? styles.titleEditorial : styles.title, { fontSize: size, lineHeight: size * 1.12 }, light && { color: '#fff' }]}>
      {children}
    </Text>
  );
}

/**
 * Home-style section. `band` paints a full-width tinted background so
 * consecutive sections read as distinct blocks (alternate it down the page).
 */
export function Section({ eyebrow, title, children, style, band = false }: { eyebrow?: string; title?: string; children: ReactNode; style?: StyleProp<ViewStyle>; band?: boolean }) {
  return (
    <View style={[band ? styles.band : styles.plain, style]}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      {title ? <Title size={26}>{title}</Title> : null}
      <View style={{ marginTop: title ? 18 : 0 }}>{children}</View>
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
  // Apple-style button roles: filled, tinted (ghost) and plain-on-dark.
  const palette = {
    primary: { bg: C.wine, fg: '#fff', border: C.wine },
    gold: { bg: C.gold, fg: C.ink, border: C.gold },
    ghost: { bg: C.fill, fg: C.wine, border: 'transparent' },
    light: { bg: 'rgba(255,255,255,0.18)', fg: '#fff', border: 'transparent' },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => { tapFeedback(); onPress(); }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
        style,
      ]}>
      {icon ? <Ionicons name={icon} size={18} color={palette.fg} /> : null}
      <Text style={[styles.buttonText, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Soft entrance used across the app: content fades in, rises a few points and
 * settles from a hair below full size. Siblings cascade by `index`. On launch
 * it waits until the launch screen starts to open, so the reveal is seen.
 */
export function Reveal({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const revealed = useLaunchRevealed();
  const progress = useSharedValue(0);
  useEffect(() => {
    if (!revealed) return;
    progress.value = withDelay(Math.min(index, 6) * 85, withTiming(1, { duration: 720, easing: Easing.bezier(0.22, 1, 0.36, 1) }));
  }, [revealed, index, progress]);
  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 22 }, { scale: 0.985 + progress.value * 0.015 }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Branded skeleton: soft placeholder cards that gently pulse while content loads. */
export function Loading({ rows = 3 }: { rows?: number }) {
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View accessibilityLabel="Cargando" accessibilityRole="progressbar" style={[{ gap: 12, marginVertical: 16 }, style]}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={skeleton.card}>
          <View style={skeleton.thumb} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[skeleton.line, { width: '70%' }]} />
            <View style={[skeleton.line, { width: '45%', height: 10 }]} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

const skeleton = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: C.card },
  thumb: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#f3e6e3' },
  line: { height: 13, borderRadius: 7, backgroundColor: '#f3e6e3' },
});

export function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card style={{ alignItems: 'flex-start', gap: 12 }}>
      <Text style={{ color: C.text }}>{message}. Revisa tu conexión.</Text>
      <Button label="Reintentar" variant="ghost" icon="refresh" onPress={onRetry} />
    </Card>
  );
}

export const styles = StyleSheet.create({
  plain: { paddingHorizontal: 20, paddingTop: 44, paddingBottom: 8 },
  band: {
    paddingHorizontal: 20, paddingTop: 36, paddingBottom: 36, marginTop: 40,
    backgroundColor: '#f3e9e6',
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(166,75,67,0.10)',
  },
  eyebrow: {
    color: C.wine,
    fontFamily: sans,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: { fontFamily: sans, color: C.ink, fontWeight: '700', letterSpacing: -0.6 },
  titleEditorial: { fontFamily: serif, color: C.ink, fontWeight: '500', letterSpacing: -0.5 },
  card: {
    backgroundColor: C.card,
    borderRadius: radius.md,
    padding: 18,
    boxShadow: '0 1px 2px rgba(63,38,35,0.04), 0 8px 24px rgba(63,38,35,0.06)',
  },
  button: {
    minHeight: 50,
    paddingHorizontal: 22,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: { fontFamily: sans, fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
  // Android clips the end of justified lines that use letterSpacing, so it is iOS only.
  body: { fontFamily: sans, color: C.muted, fontSize: 16, lineHeight: 23, letterSpacing: Platform.OS === 'ios' ? -0.2 : 0, textAlign: 'justify' },
});
