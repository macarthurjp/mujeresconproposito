import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { C, sans } from '@/constants/theme';

import { tapFeedback } from './ui';

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
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
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
 * Speaker/flyer card. Flyers carry text, so the image is shown whole
 * ("contain") over a blurred copy of itself instead of being cropped.
 */
export function PosterCard({
  uri,
  name,
  role,
  onPress,
  style,
}: {
  uri: string;
  name: string;
  role?: string | null;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[name, role].filter(Boolean).join(', ')}
      onPress={() => { tapFeedback(); onPress?.(); }}
      style={({ pressed }) => [m.poster, style, pressed && { transform: [{ scale: 0.985 }] }]}>
      <View style={m.posterMedia}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={30} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,247,246,0.35)' }]} />
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" transition={200} />
      </View>
      <View style={m.posterBody}>
        <Text style={m.posterName} numberOfLines={2}>{name}</Text>
        {role ? <Text style={m.posterRole} numberOfLines={2}>{role}</Text> : null}
      </View>
    </Pressable>
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
  poster: { borderRadius: 24, overflow: 'hidden', backgroundColor: C.card, boxShadow: cardShadow },
  posterMedia: { width: '100%', aspectRatio: 4 / 5, backgroundColor: C.sand },
  posterBody: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 15, gap: 3 },
  posterName: { fontFamily: sans, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3, color: C.ink },
  posterRole: { fontFamily: sans, fontSize: 13, lineHeight: 18, color: C.muted },
});
