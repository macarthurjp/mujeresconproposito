import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { tapFeedback } from '@/components/ui';
import { AdminLogin } from '@/components/admin-login';
import { C, sans } from '@/constants/theme';
import { deleteEvento, listEventos, setEventoActiva, setEventoOrden, type AdminEvento } from '@/lib/admin';
import { meetingPlatform } from '@/components/meeting-card';
import { AdminGestureRow } from '@/components/admin-gesture-row';
import { EventArtwork } from '@/components/meeting-card';
import { useAdmin } from '@/lib/use-admin';

export default function AdminEventos() {
  const { access, ready } = useAdmin();
  const [items, setItems] = useState<AdminEvento[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await listEventos()); }
    catch (e) { Alert.alert('No se pudieron cargar', e instanceof Error ? e.message : ''); }
    finally { setLoading(false); }
  }, []);

  // Reload whenever we come back from the editor.
  useFocusEffect(useCallback(() => {
    if (access?.isSuperAdmin && !access.isRevoked) void load();
  }, [access, load]));

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

  const move = async (item: AdminEvento, delta: number) => {
    if (!items) return;
    const ordered = [...items].sort((a, b) => a.orden - b.orden);
    const index = ordered.findIndex((entry) => entry.id === item.id);
    const next = Math.max(0, Math.min(ordered.length - 1, index + delta));
    if (index < 0 || next < 0 || next >= ordered.length) return;
    const [moved] = ordered.splice(index, 1);
    ordered.splice(next, 0, moved);
    setItems(ordered.map((entry, i) => ({ ...entry, orden: i + 1 })));
    try {
      await Promise.all(ordered.map((entry, i) => setEventoOrden(entry.id, i + 1)));
      await load();
    } catch (e) { Alert.alert('No se pudo reordenar', e instanceof Error ? e.message : ''); await load(); }
  };

  if (!ready) return <ActivityIndicator color={C.wine} style={{ marginTop: 40 }} />;
  if (!access) return <AdminLogin />;
  if (access.isRevoked || !access.isSuperAdmin) return <View style={s.page}><Text style={s.hint}>Solo Super Admin puede administrar reuniones.</Text></View>;

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
            const platform = meetingPlatform(item.link);
            return (
              <AdminGestureRow key={item.id} onEdit={() => { tapFeedback(); router.push({ pathname: '/admin/evento', params: { id: item.id } }); }} onDelete={() => remove(item)} onReorder={(steps) => void move(item, steps)} stepHeight={74}>
              <View style={[s.card, !item.activa && { opacity: 0.6 }]}>
                <Pressable onPress={() => { tapFeedback(); router.push({ pathname: '/admin/evento', params: { id: item.id } }); }} style={s.cardContent}>
                  <View style={s.icon}><EventArtwork icon={item.icono} size={30} tint={C.wine} emojiSize={20} /></View>
                  <View style={{ flex: 1 }}><Text style={s.title} numberOfLines={1}>{item.titulo.trim()}</Text><Text style={s.meta} numberOfLines={1}>{item.horario}</Text><Text style={s.platform} numberOfLines={1}>{platform ? platform.name : 'Sin enlace'}</Text></View>
                </Pressable>
                <View style={s.eventActions}>
                  <Switch value={item.activa} onValueChange={(v) => { tapFeedback(); void toggle(item, v); }} trackColor={{ true: C.wine, false: '#e5dcda' }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as object)} ios_backgroundColor="#e5dcda" accessibilityLabel={item.activa ? 'Visible en la web y la app' : 'Oculto'} />
                </View>
              </View>
              </AdminGestureRow>
            );
          })}
        </View>
        {items?.length ? <Text style={s.hint}>Desliza a la derecha para editar, a la izquierda para eliminar o mantén pulsado y arrastra para ordenar.</Text> : null}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, paddingBottom: 60 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderRadius: 16, backgroundColor: C.card },
  cardContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  eventActions: { alignItems: 'center', gap: 5 }, orderButtons: { flexDirection: 'row', gap: 4 }, orderButton: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: C.fill },
  icon: { width: 46, height: 46, borderRadius: 12, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: sans, fontSize: 16, fontWeight: '600', letterSpacing: -0.2, color: C.ink },
  meta: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 1 },
  platform: { fontFamily: sans, fontSize: 12, fontWeight: '600', color: C.wine, marginTop: 2 },
  hint: { fontFamily: sans, fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 16 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 6 },
  emptyTitle: { fontFamily: sans, fontSize: 18, fontWeight: '600', color: C.ink },
  emptyText: { fontFamily: sans, fontSize: 14, color: C.muted },
});
