import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, sans, TAB_BAR_SPACE } from '@/constants/theme';
import { api, type Evento } from '@/lib/api';

import { eventStatus } from './event-card';
import { tapFeedback } from './ui';

const REFRESH_MS = 30_000;

/**
 * Floating "live now" card shown above the tab bar on every tab while a
 * meeting with a link is in progress. Each occurrence can be dismissed.
 */
export function LiveBanner() {
  const insets = useSafeAreaInsets();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () => api.eventos().then((rows) => { if (alive) setEventos(rows); }).catch(() => {});
    load();
    const tick = setInterval(() => setNow(new Date()), REFRESH_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { setNow(new Date()); load(); }
    });
    return () => { alive = false; clearInterval(tick); sub.remove(); };
  }, []);

  // Cheap to compute; the React Compiler memoizes it.
  const live = (() => {
    for (const evento of eventos) {
      const link = evento.link && /^https?:\/\//i.test(evento.link) ? evento.link : null;
      if (!link) continue;
      const { live: isLive, next } = eventStatus(evento, now);
      if (!isLive || !next) continue;
      const key = `${evento.id}@${next.toISOString()}`;
      if (!dismissed.includes(key)) return { evento, link, key };
    }
    return null;
  })();

  // Buzz once when a meeting goes live while the app is open (iOS haptics).
  const announced = useRef<string | null>(null);
  const liveKey = live?.key ?? null;
  useEffect(() => {
    if (liveKey && announced.current !== liveKey && Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    announced.current = liveKey;
  }, [liveKey]);

  if (!live) return null;

  const Surface = Platform.OS === 'ios' ? BlurView : View;
  const surfaceProps = Platform.OS === 'ios'
    ? { tint: 'systemChromeMaterialLight' as const, intensity: 100 }
    : {};

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      exiting={FadeOutDown.duration(180)}
      style={[b.wrap, { bottom: insets.bottom + TAB_BAR_SPACE - 30 }]}
      pointerEvents="box-none">
      <Surface {...surfaceProps} style={[b.card, Platform.OS !== 'ios' && b.cardSolid]}>
        <View style={b.dotWrap}>
          <View style={b.dot} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={b.kicker}>En vivo ahora</Text>
          <Text style={b.title} numberOfLines={1}>{live.evento.titulo.trim()}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Unirme a ${live.evento.titulo}`}
          onPress={() => { tapFeedback(); void Linking.openURL(live.link); }}
          style={({ pressed }) => [b.join, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}>
          <Ionicons name="videocam" size={16} color="#fff" />
          <Text style={b.joinText}>Unirme</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ocultar aviso"
          hitSlop={10}
          onPress={() => { tapFeedback(); setDismissed((d) => [...d, live.key]); }}
          style={b.close}>
          <Ionicons name="close" size={18} color={C.muted} />
        </Pressable>
      </Surface>
    </Animated.View>
  );
}

const b = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 50 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingLeft: 14, paddingRight: 8, paddingVertical: 10,
    borderRadius: 20, overflow: 'hidden',
    boxShadow: '0 12px 32px rgba(63,38,35,0.22)',
  },
  cardSolid: { backgroundColor: 'rgba(255,255,255,0.97)' },
  dotWrap: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(214,69,69,0.15)', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.live },
  kicker: { fontFamily: sans, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: C.live },
  title: { fontFamily: sans, fontSize: 16, fontWeight: '600', letterSpacing: -0.3, color: C.ink, marginTop: 1 },
  join: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: C.live },
  joinText: { fontFamily: sans, fontSize: 14, fontWeight: '700', color: '#fff' },
  close: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
});
