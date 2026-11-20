import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';

import { C } from '@/constants/theme';

import { tapFeedback } from './ui';

/**
 * Pull down to refresh, the same everywhere: brand-coloured spinner (iOS and
 * Android), a light haptic when it triggers, and a short minimum spin so a
 * fast reload still reads as "refreshed". Pass the screen's own loader.
 */
export function usePullToRefresh(load: () => unknown) {
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  const onRefresh = useCallback(async () => {
    tapFeedback();
    setRefreshing(true);
    const started = Date.now();
    try { await loadRef.current(); }
    catch { /* each screen already reports its own load errors */ }
    finally {
      const wait = Math.max(0, 500 - (Date.now() - started));
      setTimeout(() => setRefreshing(false), wait);
    }
  }, []);

  const control = <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} {...refreshColors} />;
  return { refreshing, onRefresh: () => void onRefresh(), control };
}

/** Brand colours for any RefreshControl (iOS tint + Android spinner). */
export const refreshColors = { tintColor: C.wine, colors: [C.wine], progressBackgroundColor: '#ffffff' } as const;
