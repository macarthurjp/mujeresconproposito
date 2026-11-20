import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { C, sans, serif } from '@/constants/theme';

import { tapFeedback } from './ui';

// Carousels: the poster area is 2:3, the house format for destacadas. 2:3
// flyers fill it edge to edge; any other ratio is shown whole (never cropped)
// over its blurred fill. The editor recommends 1080×1620.
const COMPACT_POSTER_RATIO = 2 / 3;
const MAX_STAGE_RATIO = 1.75;
const cardShadow = '0 1px 2px rgba(63,38,35,0.05), 0 10px 28px rgba(63,38,35,0.10)';

/**
 * Photo tile with a soft bottom gradient for the caption, like Photos/Memories.
 */
export function PhotoTile({
  uri,
  caption,
  onPress,
  style,
  showExpand = true,
}: {
  uri: string;
  caption?: string | null;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  showExpand?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={caption || 'Ver foto'}
      onPress={() => { tapFeedback(); onPress?.(); }}
      style={({ pressed }) => [m.tile, style, pressed && { transform: [{ scale: 0.98 }] }]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={{ duration: 500, effect: 'cross-dissolve' }} />
      {caption ? (
        <LinearGradient
          colors={['rgba(20,12,14,0)', 'rgba(20,12,14,0.18)', 'rgba(20,12,14,0.72)']}
          locations={[0, 0.45, 1]}
          style={m.scrim}
          pointerEvents="none"
        />
      ) : null}
      {caption ? <Text style={m.caption} numberOfLines={2}>{caption}</Text> : null}
      {showExpand ? (
        <View style={m.expand} pointerEvents="none">
          <Ionicons name="expand-outline" size={14} color="#fff" />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Speaker/flyer card. Flyers carry text, so the poster is never cropped: it
 * floats whole, with its real proportions and a soft shadow, over an ambient
 * backdrop made from a blurred copy of itself (like album art in Music).
 * `badge` overlays the top-left corner; `children` render in a light footer
 * (used for the event sign-up block).
 */
export function PosterCard({
  uri,
  name,
  role,
  onPress,
  style,
  eyebrow = 'Voz destacada',
  compact = false,
  badge,
  children,
}: {
  uri: string;
  name: string;
  role?: string | null;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  eyebrow?: string | null;
  compact?: boolean;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  const [ratio, setRatio] = useState(4 / 5);
  const [cardWidth, setCardWidth] = useState(0);
  // Stage size is derived from the card width (not CSS aspect-ratio, which
  // grows to fit its content on web) so the poster can never overflow it.
  // Full cards grow with the flyer so it spans almost the whole width; compact
  // cards (carousels) keep one height so the row stays even.
  const pad = compact ? { x: 12, top: 50, bottom: 4 } : { x: 14, top: 58, bottom: 6 };
  const innerW = Math.max(0, cardWidth - pad.x * 2);
  const stageHeight = compact
    ? pad.top + pad.bottom + innerW / COMPACT_POSTER_RATIO
    : Math.min(pad.top + pad.bottom + innerW / ratio, cardWidth * MAX_STAGE_RATIO);
  const fitted = useMemo(() => {
    if (!cardWidth) return null;
    const innerH = stageHeight - pad.top - pad.bottom;
    const width = Math.min(innerW, innerH * ratio);
    return { width, height: width / ratio };
  }, [cardWidth, innerW, stageHeight, ratio, pad.top, pad.bottom]);
  const onCardLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (Math.abs(width - cardWidth) > 0.5) setCardWidth(width);
  };

  return (
    <View style={[m.poster, style]} onLayout={onCardLayout}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[name, role].filter(Boolean).join(', ')}
        accessibilityHint="Ver el póster completo"
        onPress={() => { tapFeedback(); onPress?.(); }}
        style={({ pressed }) => [m.posterHero, pressed && { opacity: 0.97, transform: [{ scale: 0.985 }] }]}>
        <View style={m.posterAmbientClip} pointerEvents="none">
          <Image source={{ uri }} style={m.posterAmbient} contentFit="cover" blurRadius={46} />
          <LinearGradient
            colors={['rgba(46,20,20,0.18)', 'rgba(46,20,20,0.34)', 'rgba(36,15,16,0.88)']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <View style={[m.posterStage, { height: stageHeight, paddingHorizontal: pad.x, paddingTop: pad.top, paddingBottom: pad.bottom }]}>
          {fitted ? (
            <View style={[m.posterFrame, { width: fitted.width, height: fitted.height }]}>
              <Image
                source={{ uri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={{ duration: 500, effect: 'cross-dissolve' }}
                onLoad={(event) => {
                  const { width, height } = event.source;
                  if (width > 0 && height > 0) setRatio(width / height);
                }}
              />
            </View>
          ) : null}
        </View>
        <View style={[m.posterCaption, compact && m.posterCaptionCompact]}>
          {eyebrow ? <Text style={m.posterEyebrow} numberOfLines={1}>{eyebrow}</Text> : null}
          <Text style={[m.posterName, compact && m.posterNameCompact]} numberOfLines={2}>{name}</Text>
          {role ? <Text style={[m.posterRole, compact && m.posterRoleCompact]} numberOfLines={2}>{role}</Text> : null}
        </View>
        <View style={m.posterExpand} pointerEvents="none">
          <Ionicons name="expand-outline" size={14} color="#fff" />
        </View>
        {badge ? <View style={m.posterBadge} pointerEvents="none">{badge}</View> : null}
      </Pressable>
      {children ? <View style={m.posterFooter}>{children}</View> : null}
    </View>
  );
}

const m = StyleSheet.create({
  tile: { borderRadius: 20, overflow: 'hidden', backgroundColor: C.sand, boxShadow: cardShadow },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  caption: {
    position: 'absolute', left: 14, right: 14, bottom: 13,
    color: '#fff', fontFamily: sans, fontSize: 15, lineHeight: 19, fontWeight: '600', letterSpacing: -0.2,
  },
  expand: {
    position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(20,12,14,0.35)', alignItems: 'center', justifyContent: 'center',
  },
  poster: { borderRadius: 28, overflow: 'hidden', backgroundColor: C.card, boxShadow: '0 2px 4px rgba(63,38,35,0.06), 0 18px 40px rgba(63,38,35,0.16)' },
  posterHero: { overflow: 'hidden', backgroundColor: '#3a1d1c' },
  posterAmbientClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  posterAmbient: { position: 'absolute', top: -40, left: -40, right: -40, bottom: -40 },
  posterStage: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  posterFrame: {
    borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.28)',
    boxShadow: '0 4px 10px rgba(0,0,0,0.22), 0 22px 44px rgba(0,0,0,0.38)',
  },
  posterCaption: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 22, gap: 4, alignItems: 'center' },
  posterCaptionCompact: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 16 },
  posterEyebrow: { fontFamily: sans, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', color: '#efcfa0' },
  posterName: { fontFamily: serif, fontSize: 25, lineHeight: 30, letterSpacing: -0.3, color: '#fff', textAlign: 'center' },
  posterNameCompact: { fontSize: 19, lineHeight: 23 },
  posterRole: { fontFamily: sans, fontSize: 14, lineHeight: 19, color: 'rgba(255,236,231,0.82)', textAlign: 'center' },
  posterRoleCompact: { fontSize: 12.5, lineHeight: 17 },
  posterExpand: {
    position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  posterBadge: { position: 'absolute', top: 14, left: 14 },
  posterFooter: { paddingTop: 16, backgroundColor: C.card },
});

/**
 * Album card: cover photo with two photos peeking behind it (like the
 * website's stacked cards), title and photo count.
 */
export function AlbumCard({
  title,
  coverUri,
  count,
  onPress,
  width,
}: {
  title: string;
  coverUri: string;
  count: number;
  onPress: () => void;
  width: number;
}) {
  const height = width * 1.05;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir galería ${title}, ${count} fotos`}
      onPress={() => { tapFeedback(); onPress(); }}
      style={({ pressed }) => [{ width }, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={{ height: height + 10 }}>
        {count > 2 ? <View style={[a.stack, { top: 0, left: 16, right: 16, height }]} /> : null}
        {count > 1 ? <View style={[a.stack, a.stack2, { top: 5, left: 8, right: 8, height }]} /> : null}
        <View style={[a.cover, { top: 10, height }]}>
          <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={{ duration: 500, effect: 'cross-dissolve' }} />
          <View style={a.countPill}>
            <Ionicons name="images" size={12} color="#fff" />
            <Text style={a.countText}>{count}</Text>
          </View>
        </View>
      </View>
      <Text style={a.title} numberOfLines={2}>{title}</Text>
      <Text style={a.sub}>{count === 1 ? '1 foto' : `${count} fotos`}</Text>
    </Pressable>
  );
}

const a = StyleSheet.create({
  stack: { position: 'absolute', borderRadius: 18, backgroundColor: '#ead6d2' },
  stack2: { backgroundColor: '#f2e2de' },
  cover: { position: 'absolute', left: 0, right: 0, borderRadius: 18, overflow: 'hidden', backgroundColor: C.sand, boxShadow: '0 1px 2px rgba(63,38,35,0.05), 0 10px 26px rgba(63,38,35,0.12)' },
  countPill: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(20,12,14,0.5)' },
  countText: { fontFamily: sans, color: '#fff', fontSize: 12, fontWeight: '700' },
  title: { fontFamily: sans, fontSize: 15, lineHeight: 19, fontWeight: '600', letterSpacing: -0.2, color: C.ink, marginTop: 10 },
  sub: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 2 },
});
