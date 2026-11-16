import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, sans, TAB_BAR_SPACE } from '@/constants/theme';
import { useLaunchRevealed } from '@/lib/launch';
import { onScrollActivity } from '@/lib/scroll-activity';

import { tapFeedback } from './ui';

const LABEL_WIDTH = 200;
const COLLAPSE_AFTER_MS = 1400;

/**
 * Floating prayer button above the tab bar. At rest it is a round button with
 * praying hands; while the page scrolls the "¿Necesitas oración?" label slides
 * out, then folds back shortly after scrolling stops. Opens the existing
 * contact form in prayer mode and moves up when the live-meeting banner shows.
 */
export function PrayerButton({ raised }: { raised: boolean }) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const launched = useLaunchRevealed();
  const open = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = onScrollActivity(() => {
      open.value = withSpring(1, { damping: 18, stiffness: 180 });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        open.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
      }, COLLAPSE_AFTER_MS);
    });
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [open]);

  const labelStyle = useAnimatedStyle(() => ({
    maxWidth: open.value * LABEL_WIDTH,
    marginLeft: open.value * 8,
    opacity: open.value,
  }));

  // Not on the join form (it would compete with the main action) nor on the
  // settings screen, where it sits on top of switches and rows.
  if (!launched || pathname === '/unirse' || pathname === '/mas') return null;

  return (
    <Animated.View
      entering={FadeIn.delay(700).duration(500)}
      exiting={FadeOut.duration(150)}
      layout={LinearTransition.springify().damping(18)}
      style={[p.wrap, { bottom: insets.bottom + TAB_BAR_SPACE - 10 + (raised ? 78 : 0) }]}
      pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="¿Necesitas oración? Escríbenos tu petición"
        onPress={() => { tapFeedback(); router.push({ pathname: '/contacto', params: { tema: 'oracion' } }); }}
        style={({ pressed }) => [p.pill, pressed && { transform: [{ scale: 0.94 }], opacity: 0.94 }]}>
        <MaterialCommunityIcons name="hands-pray" size={22} color="#fff" />
        <Animated.Text numberOfLines={1} ellipsizeMode="clip" style={[p.text, labelStyle]}>¿Necesitas oración?</Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

const p = StyleSheet.create({
  wrap: { position: 'absolute', right: 16, zIndex: 40 },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    height: 54, minWidth: 54, paddingHorizontal: 16, borderRadius: 27,
    backgroundColor: C.wine, overflow: 'hidden',
    boxShadow: '0 10px 26px rgba(166,75,67,0.38), 0 2px 6px rgba(63,38,35,0.18)',
  },
  text: { fontFamily: sans, fontSize: 15, fontWeight: '700', letterSpacing: -0.2, color: '#fff' },
});
