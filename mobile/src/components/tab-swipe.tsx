import { router, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Directions, GestureDetector, useCompetingGestures, useFlingGesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { tapFeedback } from './ui';

// Visible tabs, left to right (same order as the tab bar).
const TABS = ['/', '/eventos', '/unirse', '/devocionales', '/mas'] as const;
const EDGE = 28;

function go(pathname: string, step: number) {
  const current = TABS.indexOf((pathname === '' ? '/' : pathname) as (typeof TABS)[number]);
  if (current < 0) return;
  const next = current + step;
  if (next < 0 || next >= TABS.length) return;
  tapFeedback();
  router.navigate(TABS[next] as never);
}

/**
 * Swipe between tabs from the screen edges (so carousels keep working):
 * from the right edge towards the left → next tab; from the left edge → previous tab.
 */
export function TabSwipe({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const next = useFlingGesture({
    direction: Directions.LEFT,
    hitSlop: { right: 0, width: EDGE },
    onActivate: () => { 'worklet'; runOnJS(go)(pathname, 1); },
  });
  const previous = useFlingGesture({
    direction: Directions.RIGHT,
    hitSlop: { left: 0, width: EDGE },
    onActivate: () => { 'worklet'; runOnJS(go)(pathname, -1); },
  });
  const gesture = useCompetingGestures(next, previous);

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ flex: 1 }} collapsable={false}>{children}</View>
    </GestureDetector>
  );
}
