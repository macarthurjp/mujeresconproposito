/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutated inside gesture worklets. */
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { SwipeDirection } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { StyleSheet, Text, View } from 'react-native';

import { C, sans } from '@/constants/theme';

type Props = {
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  onReorder?: (steps: number) => void;
  stepHeight?: number;
};

function Action({ icon, label, destructive = false }: { icon: 'create-outline' | 'trash-outline'; label: string; destructive?: boolean }) {
  return <View style={[styles.action, destructive ? styles.delete : styles.edit]}><Ionicons name={icon} size={21} color="#fff" /><Text style={styles.actionText}>{label}</Text></View>;
}

/** Admin content row: swipe right to edit, left to delete, long-press and drag to reorder. */
export function AdminGestureRow({ children, onEdit, onDelete, onReorder, stepHeight = 88 }: Props) {
  const offset = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const drag = (onReorder ? Gesture.Pan() : Gesture.Pan().enabled(false))
    .activateAfterLongPress(320)
    .runOnJS(false)
    .onStart(() => { offset.value = 0; })
    .onUpdate((event) => { offset.value = event.translationY; })
    .onEnd((event) => {
      const steps = Math.round(event.translationY / stepHeight);
      if (steps && onReorder) runOnJS(onReorder)(steps);
      offset.value = 0;
    })
    .onFinalize(() => { offset.value = 0; });

  return <ReanimatedSwipeable
    friction={1.8}
    leftThreshold={48}
    rightThreshold={48}
    overshootLeft={false}
    overshootRight={false}
    onSwipeableOpen={(direction) => direction === SwipeDirection.RIGHT ? onEdit?.() : onDelete?.()}
    renderLeftActions={onEdit ? () => <Action icon="create-outline" label="Editar" /> : undefined}
    renderRightActions={onDelete ? () => <Action icon="trash-outline" label="Eliminar" destructive /> : undefined}
  >
    <GestureDetector gesture={drag}>
      <Animated.View style={[styles.row, animatedStyle]}>{children}</Animated.View>
    </GestureDetector>
  </ReanimatedSwipeable>;
}

const styles = StyleSheet.create({
  row: { backgroundColor: C.card },
  action: { flex: 1, minWidth: 92, alignItems: 'center', justifyContent: 'center', gap: 4 },
  edit: { backgroundColor: C.wine },
  delete: { backgroundColor: '#b94440' },
  actionText: { fontFamily: sans, fontSize: 12, fontWeight: '700', color: '#fff' },
});
