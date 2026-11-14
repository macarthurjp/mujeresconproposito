import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { ErrorNote, Loading, Screen, styles as ui, useAsync } from '@/components/ui';
import { C, serif } from '@/constants/theme';
import { api } from '@/lib/api';

export default function Destacadas() {
  const { data, error, loading, reload } = useAsync(api.destacadas);

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <View style={{ paddingHorizontal: 20, gap: 24 }}>
        {loading && !data ? <Loading /> : null}
        {error ? <ErrorNote message={error} onRetry={reload} /> : null}
        {(data ?? []).map((d) => (
          <View key={d.id}>
            <Image source={{ uri: d.foto_url }} style={s.img} contentFit="cover" transition={200} />
            <Text style={s.name}>{d.nombre}</Text>
            {d.titulo ? <Text style={ui.eyebrow}>{d.titulo}</Text> : null}
          </View>
        ))}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  img: { width: '100%', aspectRatio: 4 / 5, borderRadius: 20, backgroundColor: C.sand },
  name: { fontFamily: serif, fontSize: 26, color: C.ink, marginTop: 14, marginBottom: 4 },
});
