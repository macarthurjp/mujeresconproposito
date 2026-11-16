import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';

import { C } from '@/constants/theme';

const SPLASH = require('../../assets/images/splash-icon.png');
const BG = '#FFF7F6'; // same as the native splash, so the hand-off is invisible
const LOGO = 240; // same width as the native splash image
const MIN_VISIBLE_MS = 1100;

/**
 * Branded launch overlay. It starts pixel-identical to the native splash, then
 * the flower "breathes", a fine progress line fills and the whole layer opens
 * with a soft zoom + fade into the app.
 */
export function LaunchScreen() {
  const [done, setDone] = useState(false);
  const breath = useSharedValue(1);
  const progress = useSharedValue(0);
  const exit = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      const hold = reduce ? 300 : MIN_VISIBLE_MS;
      if (!reduce) {
        breath.value = withRepeat(withSequence(
          withTiming(1.035, { duration: 900, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        ), -1);
      }
      progress.value = withTiming(1, { duration: hold, easing: Easing.out(Easing.cubic) });
      exit.value = withDelay(hold, withTiming(1, { duration: reduce ? 200 : 520, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setDone)(true);
      }));
    });
    return () => { cancelled = true; };
  }, [breath, progress, exit]);

  const layer = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const logo = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value * (1 + exit.value * 0.14) }],
    opacity: 1 - exit.value * 0.6,
  }));
  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%`, opacity: 1 - exit.value * 2 }));

  if (done) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, s.layer, layer]}
      onLayout={() => { void SplashScreen.hideAsync().catch(() => {}); }}>
      <Animated.View style={logo}>
        <Image source={SPLASH} style={{ width: LOGO, height: LOGO }} contentFit="contain" />
      </Animated.View>
      <View style={s.track}><Animated.View style={[s.fill, bar]} /></View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  layer: { zIndex: 1000, elevation: 1000, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  track: { position: 'absolute', bottom: '22%', width: 96, height: 3, borderRadius: 2, backgroundColor: 'rgba(166,75,67,0.12)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2, backgroundColor: C.wine },
});
