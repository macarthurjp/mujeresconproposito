import type { ReactNode } from 'react';
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tapFeedback } from './ui';

/**
 * Horizontal carousel with the App Store / Netflix feel: cards snap one at a
 * time, the focused card sits at full size while its neighbours ease back
 * (slightly smaller, lower and dimmer) as you swipe, and a soft selection
 * haptic marks each new card.
 */
export function SnapCarousel<T>({
  data,
  itemWidth,
  gap = 14,
  inset = 20,
  intensity = 1,
  keyExtractor,
  renderItem,
  style,
  contentContainerStyle,
}: {
  data: T[];
  itemWidth: number;
  gap?: number;
  inset?: number;
  /** 1 = full depth effect (wide posters); lower values suit narrow cards where two are visible. */
  intensity?: number;
  keyExtractor: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const step = itemWidth + gap;
  const scrollX = useSharedValue(0);
  const focused = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
      const index = Math.round(event.contentOffset.x / step);
      if (index !== focused.value) {
        focused.value = index;
        scheduleOnRN(tapFeedback);
      }
    },
  });

  return (
    <Animated.ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      snapToInterval={step}
      snapToAlignment="start"
      decelerationRate="fast"
      disableIntervalMomentum
      // Android only honours one-card-per-swipe on quick flings in paging
      // mode (it then pages by snapToInterval, not by the view width).
      pagingEnabled={Platform.OS === 'android'}
      style={style}
      contentContainerStyle={[{ paddingHorizontal: inset, gap }, styles.track, contentContainerStyle]}>
      {data.map((item, index) => (
        <CarouselItem key={keyExtractor(item, index)} index={index} step={step} scrollX={scrollX} width={itemWidth} intensity={intensity}>
          {renderItem(item, index)}
        </CarouselItem>
      ))}
    </Animated.ScrollView>
  );
}

function CarouselItem({ index, step, scrollX, width, intensity, children }: { index: number; step: number; scrollX: SharedValue<number>; width: number; intensity: number; children: ReactNode }) {
  const animated = useAnimatedStyle(() => {
    // -1 = one card to the left of focus, 0 = focused, 1 = one card to the right.
    const distance = (scrollX.value - index * step) / step;
    const range = [-1, 0, 1];
    const dim = 1 - 0.22 * intensity;
    const shrink = 1 - 0.07 * intensity;
    const drop = 10 * intensity;
    return {
      opacity: interpolate(distance, range, [dim, 1, dim], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(distance, range, [drop, 0, drop], Extrapolation.CLAMP) },
        { scale: interpolate(distance, range, [shrink, 1, shrink], Extrapolation.CLAMP) },
      ],
    };
  });
  return <Animated.View style={[{ width }, animated]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  track: { alignItems: 'flex-start' },
});
