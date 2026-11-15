import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sans } from '@/constants/theme';

import { tapFeedback } from './ui';

type Photo = { id: string; foto_url: string };

/**
 * Full-screen album viewer: swipe left/right between photos (Photos-app
 * style), with a counter. Arrows are shown on web where there is no swipe.
 */
export function PhotoViewer({
  title,
  photos,
  startIndex = 0,
  visible,
  onClose,
}: {
  title: string;
  photos: Photo[];
  startIndex?: number;
  visible: boolean;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<Photo>>(null);
  const [index, setIndex] = useState(startIndex);

  // Reset the counter when the viewer closes, so the next album starts clean.
  const close = () => {
    setIndex(startIndex);
    onClose();
  };

  const go = (next: number) => {
    const target = Math.max(0, Math.min(photos.length - 1, next));
    list.current?.scrollToIndex({ index: target, animated: true });
    setIndex(target);
    tapFeedback();
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={v.root}>
        <FlatList
          ref={list}
          data={photos}
          keyExtractor={(p) => p.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(startIndex, Math.max(photos.length - 1, 0))}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          onScroll={Platform.OS === 'web' ? (e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width)) : undefined}
          scrollEventThrottle={64}
          windowSize={3}
          renderItem={({ item }) => (
            <View style={{ width, height, justifyContent: 'center' }}>
              <Image source={{ uri: item.foto_url }} style={{ width, height: height * 0.78 }} contentFit="contain" transition={150} />
            </View>
          )}
        />

        <View style={[v.top, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
          <View style={{ flex: 1 }}>
            <Text style={v.title} numberOfLines={1}>{title}</Text>
            <Text style={v.count}>{photos.length ? `${index + 1} / ${photos.length}` : ''}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar galería" onPress={close} hitSlop={10} style={v.close}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>

        {Platform.OS === 'web' && photos.length > 1 ? (
          <>
            {index > 0 ? (
              <Pressable accessibilityLabel="Foto anterior" onPress={() => go(index - 1)} style={[v.arrow, { left: 12 }]}>
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </Pressable>
            ) : null}
            {index < photos.length - 1 ? (
              <Pressable accessibilityLabel="Foto siguiente" onPress={() => go(index + 1)} style={[v.arrow, { right: 12 }]}>
                <Ionicons name="chevron-forward" size={24} color="#fff" />
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const v = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0809' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 12 },
  title: { fontFamily: sans, color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
  count: { fontFamily: sans, color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 2, fontVariant: ['tabular-nums'] },
  close: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  arrow: { position: 'absolute', top: '50%', marginTop: -22, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
});
