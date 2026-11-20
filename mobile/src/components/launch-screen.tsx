import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';

import { C } from '@/constants/theme';
import { markLaunchRevealed } from '@/lib/launch';

// The native splash image split in two layers (same pixels, same place), so the
// hand-off is invisible and only the flower moves.
const FLOWER = require('../../assets/images/splash-flower.png'); // 976×684 crop, stem base at the bottom centre
const WORDMARK = require('../../assets/images/splash-wordmark.png'); // 1024×340 crop below it
const BG = '#FFF7F6'; // same as the native splash
const LOGO = 240; // same width as the native splash image
const K = LOGO / 1024;
const MIN_VISIBLE_MS = 1700;
// Android's splash API masks the image to a circle, so its splash image is the
// same logo shrunk to fit inside it (splash-icon-android.png) and centred. The
// overlay matches it: 0.61 scale, and the logo's centre moved to the middle.
const ANDROID = Platform.OS === 'android';
const BASE_SCALE = ANDROID ? 0.61 : 1;
const BASE_SHIFT = ANDROID ? (512 - 476) * BASE_SCALE * K : 0;

/**
 * Branded launch overlay. It starts pixel-identical to the native splash; then
 * the flower dips and rises from the soil, sways gently on its stem, a fine
 * progress line fills and the whole layer opens with a soft zoom + fade.
 */
export function LaunchScreen() {
  const [done, setDone] = useState(false);
  const grow = useSharedValue(1); // vertical stretch from the stem base
  const sway = useSharedValue(0); // degrees
  const soil = useSharedValue(0);
  const progress = useSharedValue(0);
  const exit = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      const hold = reduce ? 300 : MIN_VISIBLE_MS;
      if (!reduce) {
        // Settles into the soil, then springs up as if growing out of it.
        grow.value = withSequence(
          withTiming(0.9, { duration: 260, easing: Easing.inOut(Easing.quad) }),
          withSpring(1, { damping: 7, stiffness: 120, mass: 0.8 }),
        );
        soil.value = withSequence(withTiming(1, { duration: 260 }), withTiming(0.55, { duration: 700 }));
        // A light breeze: slow, slightly uneven sway around the stem base.
        sway.value = withDelay(320, withRepeat(withSequence(
          withTiming(-3.2, { duration: 950, easing: Easing.inOut(Easing.sin) }),
          withTiming(2.4, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        ), -1, true));
      }
      progress.value = withTiming(1, { duration: hold, easing: Easing.out(Easing.cubic) });
      // The app content starts its cascade exactly as this layer opens.
      revealTimer = setTimeout(markLaunchRevealed, hold);
      exit.value = withDelay(hold, withTiming(1, { duration: reduce ? 200 : 560, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setDone)(true);
      }));
    });
    return () => { cancelled = true; if (revealTimer) clearTimeout(revealTimer); markLaunchRevealed(); };
  }, [grow, sway, soil, progress, exit]);

  const layer = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const group = useAnimatedStyle(() => ({ transform: [{ translateY: BASE_SHIFT }, { scale: BASE_SCALE * (1 + exit.value * 0.12) }] }));
  const flower = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sway.value * (1 - exit.value)}deg` }, { scaleY: grow.value }, { scaleX: 2 - grow.value * 1 }],
  }));
  const shadow = useAnimatedStyle(() => ({
    opacity: soil.value * 0.8 * (1 - exit.value),
    transform: [{ scaleX: 0.7 + soil.value * 0.5 }],
  }));
  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%`, opacity: 1 - exit.value * 2 }));

  if (done) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, s.layer, layer]}
      onLayout={() => { void SplashScreen.hideAsync().catch(() => {}); }}>
      <Animated.View style={[s.logo, group]}>
        <Animated.View style={[s.soil, shadow]} />
        <Animated.View style={[s.flower, flower]}>
          <Image source={FLOWER} style={StyleSheet.absoluteFill} contentFit="fill" />
        </Animated.View>
        <Image source={WORDMARK} style={s.wordmark} contentFit="fill" />
      </Animated.View>
      <View style={s.track}><Animated.View style={[s.fill, bar]} /></View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  layer: { zIndex: 1000, elevation: 1000, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  logo: { width: LOGO, height: LOGO },
  // Pivot at the stem base (bottom centre of the flower crop).
  flower: { position: 'absolute', left: 0, top: 0, width: 976 * K, height: 684 * K, transformOrigin: 'bottom' },
  wordmark: { position: 'absolute', left: 0, top: 684 * K, width: LOGO, height: 340 * K },
  soil: { position: 'absolute', left: 488 * K - 26, top: 671 * K - 2, width: 52, height: 6, borderRadius: 26, backgroundColor: 'rgba(166,75,67,0.22)', boxShadow: '0 0 8px 4px rgba(166,75,67,0.12)' },
  track: { position: 'absolute', bottom: '22%', width: 96, height: 3, borderRadius: 2, backgroundColor: 'rgba(166,75,67,0.12)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2, backgroundColor: C.wine },
});
