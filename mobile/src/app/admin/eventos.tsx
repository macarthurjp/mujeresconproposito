import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { tapFeedback } from '@/components/ui';
import { AdminLogin } from '@/components/admin-login';
import { C, sans } from '@/constants/theme';
import { deleteEvento, listEventos, setEventoActiva, setEventoOrden, type AdminEvento } from '@/lib/admin';
import { meetingPlatform , EventArtwork } from '@/components/meeting-card';
import { AdminGestureRow } from '@/components/admin-gesture-row';
import { useAdmin } from '@/lib/use-admin';
import { parseSchedule } from '@/lib/schedule';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const ROW_HEIGHT = 84;

/** "Martes", "Lunes a viernes", "Todos los días", "Lun, Mié y Vie"… */
function daysLabel(days: number[] | undefined) {
  if (!days?.length) return 'Sin día';
  const set = [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const key = set.join(',');
  if (set.length === 7) return 'Todos los días';
  if (key === '1,2,3,4,5') return 'Lunes a viernes';
  if (key === '6,0') return 'Fines de semana';
  if (set.length === 1) return DAY_NAMES[set[0]];
  const names = set.map((d) => DAY_SHORT[d]);
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}
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
            {[
              { value: items.length, label: items.length === 1 ? 'reunión' : 'reuniones', icon: 'calendar' as const },
              { value: items.filter((e) => e.activa).length, label: 'visibles', icon: 'eye' as const },
              { value: items.filter((e) => e.notificar !== false).length, label: 'con aviso', icon: 'notifications' as const },
            ].map((stat, i) => (
              <View key={stat.label} style={[s.stat, i > 0 && s.statSep]}>
                <Ionicons name={stat.icon} size={13} color={C.wine} />
                <Text style={s.statValue}>{stat.value}</Text>
                <Text style={s.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {(['Europa', 'América'] as const).map((group) => {
          const list = (items ?? []).filter((e) => region(e) === group);
          if (!list.length) return null;
          return (
            <View key={group}>
              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>{group}</Text>
                <Text style={s.sectionZone}><Ionicons name="time-outline" size={12} color={C.muted} /> Hora de {group === 'Europa' ? 'Luxemburgo' : 'Santo Domingo'}</Text>
              </View>
              <View style={s.group}>
                {list.map((item, index) => {
                  const platform = meetingPlatform(item.link);
                  const schedule = parseSchedule(item.horario);
                  const open = () => { tapFeedback(); router.push({ pathname: '/admin/evento', params: { id: item.id } }); };
                  return (
                    <AdminGestureRow key={item.id} onEdit={open} onDelete={() => remove(item)} onReorder={(steps) => void move(item, steps)} stepHeight={ROW_HEIGHT}>
                      <Pressable onPress={open} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
                        <View style={[s.rowInner, !item.activa && s.dimmed]}>
                          <View style={s.icon}><EventArtwork icon={item.icono} size={26} tint={C.wine} emojiSize={18} /></View>
                          <View style={s.rowText}>
                            <Text style={s.title} numberOfLines={1}>{item.titulo.trim()}</Text>
                            <Text style={s.when} numberOfLines={1}>
                              <Text style={s.time}>{schedule ? hhmm(schedule.minutes) : '--:--'}</Text>
                              {'  ·  '}{daysLabel(schedule?.days)}
                            </Text>
                            <View style={s.meta}>
                              {platform ? (
                                <><Ionicons name={platform.icon} size={12} color={C.muted} /><Text style={s.metaText}>{platform.name}</Text></>
                              ) : (
                                <><Ionicons name="alert-circle" size={12} color="#c0612b" /><Text style={[s.metaText, { color: '#c0612b' }]}>Sin enlace</Text></>
                              )}
                              {item.notificar !== false ? <><Text style={s.metaDot}>·</Text><Ionicons name="notifications" size={11} color={C.muted} /><Text style={s.metaText}>Aviso</Text></> : null}
                              {!item.activa ? <><Text style={s.metaDot}>·</Text><Text style={[s.metaText, s.hiddenText]}>Oculta</Text></> : null}
                            </View>
                          </View>
                        </View>
                        <Switch
                          accessibilityLabel={item.activa ? `${item.titulo.trim()}: visible en la web y la app` : `${item.titulo.trim()}: oculta`}
                          value={item.activa}
                          onValueChange={(value) => { tapFeedback(); void toggle(item, value); }}
                          trackColor={{ true: C.wine, false: '#e5dcda' }}
                          thumbColor="#fff"
                          ios_backgroundColor="#e5dcda"
                        />
                      </Pressable>
                      {index < list.length - 1 ? <View style={s.separator} /> : null}
                    </AdminGestureRow>
                  );
                })}
              </View>
            </View>
          );
        })}
        {items?.length ? <Text style={s.hint}>Toca una reunión para editarla. Desliza para editar o eliminar y mantén pulsado para ordenar. El interruptor la muestra u oculta en la web y la app.</Text> : null}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 60 },
  summary: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 16, paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statSep: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: C.separator },
  statValue: { fontFamily: sans, fontSize: 20, fontWeight: '700', color: C.ink, fontVariant: ['tabular-nums'], marginTop: 2 },
  statLabel: { fontFamily: sans, fontSize: 12, color: C.muted },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 26, marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontFamily: sans, fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: C.wine },
  sectionZone: { fontFamily: sans, fontSize: 12, color: C.muted },
  group: { backgroundColor: C.card, borderRadius: 18, overflow: 'hidden' },
  row: { minHeight: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14, paddingRight: 14, backgroundColor: C.card },
  rowPressed: { backgroundColor: '#f6efed' },
  rowInner: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dimmed: { opacity: 0.45 },
  icon: { width: 42, height: 42, borderRadius: 11, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  title: { fontFamily: sans, fontSize: 16, fontWeight: '600', letterSpacing: -0.2, color: C.ink },
  when: { fontFamily: sans, fontSize: 14, color: C.muted, marginTop: 2 },
  time: { fontWeight: '700', color: C.ink, fontVariant: ['tabular-nums'] },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  metaText: { fontFamily: sans, fontSize: 12, color: C.muted },
  metaDot: { fontFamily: sans, fontSize: 12, color: C.muted, marginHorizontal: 2 },
  hiddenText: { fontWeight: '600', color: C.ink },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: C.separator, marginLeft: 68 },
  hint: { fontFamily: sans, fontSize: 12, lineHeight: 17, color: C.muted, textAlign: 'center', marginTop: 18, paddingHorizontal: 12 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 6 },
  emptyTitle: { fontFamily: sans, fontSize: 18, fontWeight: '600', color: C.ink },
  emptyText: { fontFamily: sans, fontSize: 14, color: C.muted },
});
