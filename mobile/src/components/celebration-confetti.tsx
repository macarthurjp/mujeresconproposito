import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { C, serif } from '@/constants/theme';
import { api } from '@/lib/api';

const COLORS = [C.wine, C.rose, C.gold, C.blush, '#ffffff'];
const PIECES = 70;
const DURATION = 3600;

/** YYYY-MM-DD in Europe/Luxembourg, the same day for everyone. */
function todayInLuxembourg() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Luxembourg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/**
 * Confetti on the special date set in the admin (site_confetti). Shown each
 * time the app opens or returns to the foreground that day; a few seconds
 * only, never intercepts touches, and skipped when Reduce Motion is on.
 */
export function CelebrationConfetti() {
  const [run, setRun] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        if (await AccessibilityInfo.isReduceMotionEnabled()) return;
        const config = await api.confetti();
        if (cancelled || !config?.activa || config.fecha !== todayInLuxembourg()) return;
        setMessage((config.mensaje || '').trim());
        setRun((n) => n + 1);
      } catch { /* no celebration if anything fails */ }
    };
    // Wait for the launch reveal on a cold start.
    const first = setTimeout(() => { void check(); }, 2400);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') void check(); });
    return () => { cancelled = true; clearTimeout(first); sub.remove(); };
  }, []);

  useEffect(() => {
    if (!run) return;
    const t = setTimeout(() => setRun(0), DURATION + 1400);
    return () => clearTimeout(t);
  }, [run]);

  if (!run) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Burst key={run} seed={run} />
      {message ? (
        <Animated.View entering={FadeIn.delay(300).duration(400)} exiting={FadeOut.duration(400)} style={s.pillWrap}>
          <View style={s.pill}><Text style={s.pillText}>{message}</Text></View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Deterministic pseudo-random in [0,1): pure, so it is safe during render. */
function rand(seed: number, i: number, k: number) {
  const v = Math.sin(seed * 97.13 + i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function Burst({ seed }: { seed: number }) {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(() => Array.from({ length: PIECES }, (_, i) => ({
    id: i,
    x: rand(seed, i, 1) * width,
    drift: (rand(seed, i, 2) - 0.5) * 160,
    delay: rand(seed, i, 3) * 900,
    size: 6 + rand(seed, i, 4) * 7,
    color: COLORS[i % COLORS.length],
    spin: (rand(seed, i, 5) > 0.5 ? 1 : -1) * (360 + rand(seed, i, 6) * 540),
    round: rand(seed, i, 7) > 0.6,
  })), [seed, width]);
  return <>{pieces.map(({ id, ...p }) => <Piece key={id} {...p} fall={height + 40} />)}</>;
}

function Piece({ x, drift, delay, size, color, spin, round, fall }: { x: number; drift: number; delay: number; size: number; color: string; spin: number; round: boolean; fall: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: DURATION - delay, easing: Easing.out(Easing.quad) }));
  }, [delay, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value < 0.85 ? 1 : (1 - progress.value) / 0.15,
    transform: [
      { translateX: x + drift * progress.value },
      { translateY: -30 + fall * progress.value },
      { rotate: `${spin * progress.value}deg` },
    ],
  }));
  return <Animated.View style={[s.piece, { width: size, height: round ? size : size * 0.45, borderRadius: round ? size / 2 : 2, backgroundColor: color, borderWidth: color === '#ffffff' ? StyleSheet.hairlineWidth : 0, borderColor: C.blush }, style]} />;
}

const s = StyleSheet.create({
  piece: { position: 'absolute', top: 0, left: 0 },
  pillWrap: { position: 'absolute', top: 110, left: 20, right: 20, alignItems: 'center' },
  pill: { paddingHorizontal: 20, paddingVertical: 11, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.96)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(201,164,107,0.6)', boxShadow: '0 12px 30px rgba(63,38,35,0.18)' },
  pillText: { fontFamily: serif, fontSize: 16, fontWeight: '700', color: C.wine, textAlign: 'center' },
});

