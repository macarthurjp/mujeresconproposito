import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';

import { C } from '@/constants/theme';

/**
 * Deep link target for the Dynamic Island / Lock Screen Live Activity
 * (mcp930://join?link=...): opens the meeting, then shows Reuniones.
 */
export default function Join() {
  const { link } = useLocalSearchParams<{ link?: string }>();

  useEffect(() => {
    const url = typeof link === 'string' && /^https?:\/\//i.test(link) ? link : null;
    if (url) void Linking.openURL(url);
    router.replace('/eventos');
  }, [link]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
      <ActivityIndicator color={C.wine} />
    </View>
  );
}
