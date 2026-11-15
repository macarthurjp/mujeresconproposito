import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { tapFeedback } from '@/components/ui';
import { C, sans } from '@/constants/theme';
import { deleteEvento, listEventos, setEventoActiva, type AdminEvento } from '@/lib/admin';
import { meetingPlatform } from '@/components/meeting-card';

export default function AdminEventos() {
  const [items, setItems] = useState<AdminEvento[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await listEventos()); }
    catch (e) { Alert.alert('No se pudieron cargar', e instanceof Error ? e.message : ''); }
    finally { setLoading(false); }
  }, []);

  // Reload whenever we come back from the editor.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const toggle = async (item: AdminEvento, activa: boolean) => {
    setItems((list) => list?.map((x) => (x.id === item.id ? { ...x, activa } : x)) ?? null);
    try { await setEventoActiva(item.id, activa); }
    catch (e) {
      setItems((list) => list?.map((x) => (x.id === item.id ? { ...x, activa: !activa } : x)) ?? null);
      Alert.alert('No se pudo actualizar', e instanceof Error ? e.message : '');
    }
  };

  const remove = (item: AdminEvento) =>
    Alert.alert('Eliminar evento', `¿Eliminar "${item.titulo.trim()}"? Esta acción no se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try { await deleteEvento(item.id); await load(); }
        catch (e) { Alert.alert('No se pudo eliminar', e instanceof Error ? e.message : ''); }
      } },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityLabel="Nuevo evento" hitSlop={10} onPress={() => { tapFeedback(); router.push('/admin/evento'); }}>
              <Ionicons name="add-circle" size={28} color={C.wine} style={{ marginHorizontal: 8 }} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={loading && !!items} onRefresh={load} tintColor={C.wine} />}>
        {!items ? <ActivityIndicator color={C.wine} style={{ marginTop: 40 }} /> : null}
        {items && !items.length ? (
          <View style={s.empty}>
            <Ionicons name="calendar-outline" size={40} color={C.rose} />
            <Text style={s.emptyTitle}>Sin eventos</Text>
            <Text style={s.emptyText}>Crea la primera reunión con el botón +.</Text>
          </View>
        ) : null}
        <View style={{ gap: 10 }}>
          {items?.map((item) => {
            const isImage = !!item.icono && /^https?:\/\//.test(item.icono);
            const platform = meetingPlatform(item.link);
            return (
              <Pressable
                key={item.id}
                onPress={() => { tapFeedback(); router.push({ pathname: '/admin/evento', params: { id: item.id } }); }}
                onLongPress={() => remove(item)}
                style={({ pressed }) => [s.card, !item.activa && { opacity: 0.6 }, pressed && { backgroundColor: '#fbf6f5' }]}>
                <View style={s.icon}>
                  {isImage ? <Image source={{ uri: item.icono! }} style={{ width: 30, height: 30 }} contentFit="contain" /> : <Text style={{ fontSize: 20 }}>{item.icono || '✦'}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.title} numberOfLines={1}>{item.titulo.trim()}</Text>
                  <Text style={s.meta} numberOfLines={1}>{item.horario}</Text>
                  <Text style={s.platform} numberOfLines={1}>{platform ? platform.name : 'Sin enlace'}</Text>
                </View>
                <Switch
                  value={item.activa}
                  onValueChange={(v) => { tapFeedback(); void toggle(item, v); }}
                  trackColor={{ true: C.wine, false: '#e5dcda' }}
                  thumbColor="#fff"
                  {...({ activeThumbColor: '#fff' } as object)}
                  ios_backgroundColor="#e5dcda"
                  accessibilityLabel={item.activa ? 'Visible en la web y la app' : 'Oculto'}
                />
              </Pressable>
            );
          })}
        </View>
        {items?.length ? <Text style={s.hint}>Toca para editar · mantén pulsado para eliminar · el interruptor publica u oculta.</Text> : null}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, paddingBottom: 60 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: C.card },
  icon: { width: 46, height: 46, borderRadius: 12, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: sans, fontSize: 16, fontWeight: '600', letterSpacing: -0.2, color: C.ink },
  meta: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 1 },
  platform: { fontFamily: sans, fontSize: 12, fontWeight: '600', color: C.wine, marginTop: 2 },
  hint: { fontFamily: sans, fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 16 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 6 },
  emptyTitle: { fontFamily: sans, fontSize: 18, fontWeight: '600', color: C.ink },
  emptyText: { fontFamily: sans, fontSize: 14, color: C.muted },
});
