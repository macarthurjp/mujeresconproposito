import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { tapFeedback } from '@/components/ui';
import { AdminLogin } from '@/components/admin-login';
import { C, sans } from '@/constants/theme';
import { deleteEvento, listEventos, setEventoActiva, setEventoOrden, type AdminEvento } from '@/lib/admin';
import { meetingPlatform , EventArtwork } from '@/components/meeting-card';
import { AdminGestureRow } from '@/components/admin-gesture-row';
import { useAdmin } from '@/lib/use-admin';
import { parseSchedule } from '@/lib/schedule';

const DAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DAY_INDEX = [1, 2, 3, 4, 5, 6, 0];
const region = (e: AdminEvento) => (/^europe\//i.test(e.zona_horaria || '') || /europ/i.test(e.titulo) ? 'Europa' : 'América');
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

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
        {items?.length ? (
          <View style={s.summary}>
            <View style={s.stat}><Text style={s.statValue}>{items.length}</Text><Text style={s.statLabel}>reuniones</Text></View>
            <View style={s.stat}><Text style={s.statValue}>{items.filter((e) => e.activa).length}</Text><Text style={s.statLabel}>visibles</Text></View>
            <View style={s.stat}><Text style={s.statValue}>{items.filter((e) => e.notificar !== false).length}</Text><Text style={s.statLabel}>con aviso push</Text></View>
          </View>
        ) : null}
        {(['Europa', 'América'] as const).map((group) => {
          const list = (items ?? []).filter((e) => region(e) === group);
          if (!list.length) return null;
          return (
            <View key={group} style={{ marginTop: 22 }}>
              <Text style={s.groupTitle}>{group}<Text style={s.groupSub}>  ·  hora de {group === 'Europa' ? 'Luxemburgo' : 'Santo Domingo'}</Text></Text>
              <View style={{ gap: 10 }}>
                {list.map((item) => {
                  const platform = meetingPlatform(item.link);
                  const schedule = parseSchedule(item.horario);
                  const open = () => { tapFeedback(); router.push({ pathname: '/admin/evento', params: { id: item.id } }); };
                  return (
                    <AdminGestureRow key={item.id} onEdit={open} onDelete={() => remove(item)} onReorder={(steps) => void move(item, steps)} stepHeight={112}>
                      <Pressable onPress={open} style={[s.card, !item.activa && s.cardHidden]}>
                        <View style={s.cardTop}>
                          <View style={s.icon}><EventArtwork icon={item.icono} size={30} tint={C.wine} emojiSize={20} /></View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={s.title} numberOfLines={1}>{item.titulo.trim()}</Text>
                            <View style={s.badges}>
                              <View style={[s.badge, !platform && s.badgeWarn]}>
                                <Ionicons name={platform ? platform.icon : 'alert-circle-outline'} size={11} color={platform ? C.wine : '#b5523b'} />
                                <Text style={[s.badgeText, !platform && { color: '#b5523b' }]}>{platform ? platform.name : 'Sin enlace'}</Text>
                              </View>
                              {item.notificar !== false ? <View style={s.badge}><Ionicons name="notifications" size={11} color={C.wine} /><Text style={s.badgeText}>Aviso</Text></View> : null}
                            </View>
                          </View>
                          <Text style={s.time}>{schedule ? hhmm(schedule.minutes) : '—'}</Text>
                          <Pressable
                            accessibilityRole="switch"
                            accessibilityState={{ checked: item.activa }}
                            accessibilityLabel={item.activa ? 'Visible. Toca para ocultar' : 'Oculto. Toca para mostrar'}
                            hitSlop={8}
                            onPress={() => { tapFeedback(); void toggle(item, !item.activa); }}
                            style={[s.eye, !item.activa && s.eyeOff]}>
                            <Ionicons name={item.activa ? 'eye' : 'eye-off'} size={17} color={item.activa ? C.wine : '#fff'} />
                          </Pressable>
                        </View>
                        <View style={s.days}>
                          {DAY_LETTERS.map((letter, i) => {
                            const on = !!schedule?.days.includes(DAY_INDEX[i]);
                            return <View key={letter} style={[s.day, on && s.dayOn]}><Text style={[s.dayText, on && s.dayTextOn]}>{letter}</Text></View>;
                          })}
                        </View>
                      </Pressable>
                    </AdminGestureRow>
                  );
                })}
              </View>
            </View>
          );
        })}
        {items?.length ? <Text style={s.hint}>Desliza a la derecha para editar o a la izquierda para eliminar. Mantén pulsado y arrastra para ordenar. El ojo muestra u oculta la reunión en la web y la app.</Text> : null}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, paddingBottom: 60 },
  summary: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: C.card, borderRadius: 16, paddingVertical: 12, alignItems: 'center' },
  statValue: { fontFamily: sans, fontSize: 22, fontWeight: '700', color: C.ink, fontVariant: ['tabular-nums'] },
  statLabel: { fontFamily: sans, fontSize: 12, color: C.muted, marginTop: 1 },
  groupTitle: { fontFamily: sans, fontSize: 20, fontWeight: '700', letterSpacing: -0.4, color: C.ink, marginBottom: 10, marginLeft: 4 },
  groupSub: { fontSize: 13, fontWeight: '500', color: C.muted, letterSpacing: 0 },
  card: { padding: 14, borderRadius: 18, backgroundColor: C.card, gap: 12 },
  cardHidden: { opacity: 0.55 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  time: { fontFamily: sans, fontSize: 20, fontWeight: '700', letterSpacing: -0.5, color: C.ink, fontVariant: ['tabular-nums'] },
  badges: { flexDirection: 'row', gap: 6, marginTop: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: C.fill },
  badgeWarn: { backgroundColor: 'rgba(181,82,59,0.12)' },
  badgeText: { fontFamily: sans, fontSize: 11, fontWeight: '600', color: C.wine },
  eye: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: C.fill },
  eyeOff: { backgroundColor: 'rgba(40,24,22,0.85)' },
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  dayOn: { backgroundColor: C.wine },
  dayText: { fontFamily: sans, fontSize: 12, fontWeight: '700', color: '#c4b3b0' },
  dayTextOn: { color: '#fff' },
  icon: { width: 46, height: 46, borderRadius: 12, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: sans, fontSize: 16, fontWeight: '600', letterSpacing: -0.2, color: C.ink },
  meta: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 1 },
  platform: { fontFamily: sans, fontSize: 12, fontWeight: '600', color: C.wine, marginTop: 2 },
  hint: { fontFamily: sans, fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 16 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 6 },
  emptyTitle: { fontFamily: sans, fontSize: 18, fontWeight: '600', color: C.ink },
  emptyText: { fontFamily: sans, fontSize: 14, color: C.muted },
});
