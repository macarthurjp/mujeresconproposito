/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutated inside gesture worklets. */
import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { C, sans } from '@/constants/theme';

import { tapFeedback } from './ui';

type Props = {
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  onReorder?: (steps: number) => void;
  stepHeight?: number;
};

/**
 * Admin content row (iOS Mail style):
 * swipe right → "Editar", swipe left → "Eliminar" (tap the revealed button),
 * long-press and drag up/down to reorder.
 */
export function AdminGestureRow({ children, onEdit, onDelete, onReorder, stepHeight = 88 }: Props) {
  const swipeRef = useRef<SwipeableMethods>(null);
  const offset = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }], zIndex: offset.value ? 2 : 0 }));

  const drag = usePanGesture({
    enabled: !!onReorder,
    activateAfterLongPress: 350,
    onActivate: () => { 'worklet'; offset.value = 0; },
    onUpdate: (event) => { 'worklet'; offset.value = event.translationY; },
    onDeactivate: (event) => {
      'worklet';
      const steps = Math.round(event.translationY / stepHeight);
      if (steps && onReorder) runOnJS(onReorder)(steps);
      offset.value = 0;
    },
    onFinalize: () => { 'worklet'; offset.value = 0; },
  });

  const run = (action?: () => void) => {
    tapFeedback();
    swipeRef.current?.close();
    action?.();
  };

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={1.6}
      leftThreshold={40}
      rightThreshold={40}
      overshootLeft={false}
      overshootRight={false}
      dragOffsetFromLeft={12}
      dragOffsetFromRight={-12}
      simultaneousWith={drag}
      renderLeftActions={onEdit ? () => (
        <Pressable accessibilityRole="button" accessibilityLabel="Editar" onPress={() => run(onEdit)} style={[styles.action, styles.edit]}>
          <Ionicons name="create-outline" size={21} color="#fff" /><Text style={styles.actionText}>Editar</Text>
        </Pressable>
      ) : undefined}
      renderRightActions={onDelete ? () => (
        <Pressable accessibilityRole="button" accessibilityLabel="Eliminar" onPress={() => run(onDelete)} style={[styles.action, styles.delete]}>
          <Ionicons name="trash-outline" size={21} color="#fff" /><Text style={styles.actionText}>Eliminar</Text>
        </Pressable>
      ) : undefined}>
      <GestureDetector gesture={drag}>
        <Animated.View style={[styles.row, animatedStyle]}>{children}</Animated.View>
      </GestureDetector>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: C.card },
  action: { width: 96, alignItems: 'center', justifyContent: 'center', gap: 4 },
  edit: { backgroundColor: C.wine },
  delete: { backgroundColor: '#d64545' },
  actionText: { fontFamily: sans, fontSize: 12, fontWeight: '700', color: '#fff' },
});
