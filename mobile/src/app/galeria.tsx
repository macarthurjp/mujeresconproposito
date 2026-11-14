import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ErrorNote, Loading, Screen, useAsync } from '@/components/ui';
import { C } from '@/constants/theme';
import { api } from '@/lib/api';

// Same three regions as the website gallery tabs.
const REGIONS = [
  { key: 'usa', label: 'Estados Unidos', match: /estados|usa|eeuu|united/i },
  { key: 'rd', label: 'Rep. Dominicana', match: /dominicana|\brd\b/i },
  { key: 'eu', label: 'Europa', match: /europa|europe|luxem|belg|españa|francia/i },
];

export default function Galeria() {
  const { data, error, loading, reload } = useAsync(api.galeria);
  const [region, setRegion] = useState('usa');
  const { width } = useWindowDimensions();
  const size = (width - 40 - 8) / 2;

  const fotos = useMemo(() => {
    const r = REGIONS.find((x) => x.key === region)!;
    return (data ?? []).filter((f) => r.match.test(f.categoria));
  }, [data, region]);

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <View style={{ paddingHorizontal: 20 }}>
        <View style={s.tabs}>
          {REGIONS.map((r) => (
            <Pressable key={r.key} onPress={() => setRegion(r.key)} style={[s.tab, region === r.key && s.tabActive]}>
              <Text style={[s.tabText, region === r.key && { color: C.ink }]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
        {loading && !data ? <Loading /> : null}
        {error ? <ErrorNote message={error} onRetry={reload} /> : null}
        <View style={s.grid}>
          {fotos.map((f) => (
            <Image key={f.id} source={{ uri: f.foto_url }} style={{ width: size, height: size, borderRadius: 14, backgroundColor: C.sand }} contentFit="cover" transition={200} accessibilityLabel={f.texto ?? undefined} />
          ))}
        </View>
        {!loading && !fotos.length && !error ? <Text style={{ color: C.muted, marginTop: 20 }}>Aún no hay fotos en esta región.</Text> : null}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: C.sand, borderRadius: 999, padding: 4, marginBottom: 18 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: 'center' },
  tabActive: { backgroundColor: C.paper },
  tabText: { color: C.muted, fontWeight: '600', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
