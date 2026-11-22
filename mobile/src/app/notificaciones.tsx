import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdminGestureRow } from '@/components/admin-gesture-row';
import { tapFeedback } from '@/components/ui';
import { C, sans } from '@/constants/theme';
import { clearInbox, markAllSeen, removeNotification, useInbox, type InboxItem, type InboxKind } from '@/lib/notification-inbox';

const KIND: Record<InboxKind, { icon: keyof typeof Ionicons.glyphMap; tint: string; label: string }> = {
  broadcast: { icon: 'megaphone', tint: C.wine, label: 'Aviso' },
  meeting: { icon: 'videocam', tint: '#2f6db5', label: 'Reunión' },
  content: { icon: 'sparkles', tint: '#b8864a', label: 'Nuevo' },
  birthday: { icon: 'gift', tint: '#c0567a', label: 'Cumpleaños' },
  other: { icon: 'notifications', tint: '#6b5b95', label: 'Aviso' },
};

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function sectionOf(date: number, now = new Date()) {
  const today = startOfDay(now);
  if (date >= today) return 'Hoy';
  if (date >= today - DAY) return 'Ayer';
  if (date >= today - 6 * DAY) return 'Esta semana';
  return 'Anteriores';
}

function timeLabel(date: number) {
  const diff = Date.now() - date;
  if (diff < 60_000) return 'ahora';
  if (diff < 60 * 60_000) return `hace ${Math.floor(diff / 60_000)} min`;
  const d = new Date(date);
  const hm = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const section = sectionOf(date);
  if (section === 'Hoy') return hm;
  if (section === 'Ayer') return `ayer ${hm}`;
  if (section === 'Esta semana') return `${d.toLocaleDateString('es', { weekday: 'short' })} ${hm}`;
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

/** Where tapping an inbox item goes. Old meeting links are not reopened: the agenda shows the current one. */
function destination(item: InboxItem): (() => void) | null {
  const ruta = typeof item.data.ruta === 'string' ? item.data.ruta : null;
  if (item.kind === 'content' && ruta?.startsWith('/')) return () => router.push(ruta as never);
  if (item.kind === 'meeting') return () => router.push('/(tabs)/eventos');
  if (item.kind === 'birthday') return () => router.push('/(tabs)');
  return null;
}

function InboxRow({ item, unread }: { item: InboxItem; unread: boolean }) {
  const kind = KIND[item.kind];
  const go = destination(item);
  const [expanded, setExpanded] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Nueva. ' : ''}${kind.label}: ${item.title}. ${item.body}`}
      onPress={() => { tapFeedback(); if (go) go(); else setExpanded((v) => !v); }}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: C.fill }]}>
      <View style={[s.icon, { backgroundColor: kind.tint }]}><Ionicons name={kind.icon} size={18} color="#fff" /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.rowTop}>
          <Text style={s.kind} numberOfLines={1}>{kind.label}</Text>
          <Text style={s.time}>{timeLabel(item.date)}</Text>
        </View>
        {item.title ? <Text style={[s.title, unread && { fontWeight: '700' }]} numberOfLines={2}>{item.title}</Text> : null}
        {item.body ? <Text style={s.body} numberOfLines={expanded ? undefined : 3}>{item.body}</Text> : null}
      </View>
      {unread ? <View style={s.dot} accessibilityElementsHidden /> : go ? <Ionicons name="chevron-forward" size={16} color="rgba(60,40,38,0.3)" style={{ alignSelf: 'center' }} /> : null}
    </Pressable>
  );
}

export default function Notificaciones() {
  const insets = useSafeAreaInsets();
  const items = useInbox();
  const [refreshing, setRefreshing] = useState(false);
  // Items that were unread when the screen opened keep their dot during this visit.
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useFocusEffect(useCallback(() => {
    let active = true;
    markAllSeen().then((ids) => { if (active && ids.length) setFresh((prev) => new Set([...prev, ...ids])); }).catch(() => {});
    return () => { active = false; };
  }, []));

  const confirmClear = () => {
    if (!items.length) return;
    Alert.alert('Borrar notificaciones', 'Se borrarán todas las notificaciones de este teléfono.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar todo', style: 'destructive', onPress: () => { void clearInbox(); } },
    ]);
  };

  const sections = ['Hoy', 'Ayer', 'Esta semana', 'Anteriores']
    .map((title) => ({ title, data: items.filter((i) => sectionOf(i.date) === title) }))
    .filter((section) => section.data.length);

  return (
    <>
      <Stack.Screen options={{
        headerRight: items.length ? () => (
          <Pressable accessibilityRole="button" hitSlop={10} onPress={confirmClear}>
            <Text style={s.headerAction}>Borrar</Text>
          </Pressable>
        ) : undefined,
      }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: C.bg }}
        contentContainerStyle={[s.page, { paddingBottom: insets.bottom + 40 }, !items.length && { flexGrow: 1 }]}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.wine} colors={[C.wine]} onRefresh={async () => { setRefreshing(true); const ids = await markAllSeen().catch(() => [] as string[]); if (ids.length) setFresh((prev) => new Set([...prev, ...ids])); setRefreshing(false); }} />}>
        {items.length ? sections.map((section) => (
          <View key={section.title} style={{ marginBottom: 22 }}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            <View style={s.card}>
              {section.data.map((item, i) => (
                <View key={item.id}>
                  {i > 0 ? <View style={s.sep} /> : null}
                  <AdminGestureRow onDelete={() => { void removeNotification(item.id); }}>
                    <InboxRow item={item} unread={fresh.has(item.id)} />
                  </AdminGestureRow>
                </View>
              ))}
            </View>
          </View>
        )) : (
          <View style={s.empty}>
            <View style={s.emptyIcon}><Ionicons name="notifications-outline" size={30} color={C.wine} /></View>
            <Text style={s.emptyTitle}>Sin notificaciones</Text>
            <Text style={s.emptyText}>Aquí verás los avisos de la comunidad, las reuniones y el contenido nuevo que lleguen a este teléfono.</Text>
            <Pressable accessibilityRole="button" onPress={() => { tapFeedback(); router.push('/(tabs)/mas'); }} style={s.emptyLink}>
              <Text style={s.emptyLinkText}>Ajustes de avisos</Text>
              <Ionicons name="chevron-forward" size={14} color={C.wine} />
            </Pressable>
          </View>
        )}
        {items.length ? <Text style={s.footer}>Desliza a la izquierda para borrar una. Se guardan en este teléfono durante 90 días.</Text> : null}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  page: { padding: 16 },
  headerAction: { fontFamily: sans, fontSize: 17, color: C.wine },
  sectionTitle: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginLeft: 16, marginBottom: 7 },
  card: { backgroundColor: C.card, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(63,38,35,0.04)' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.separator, marginLeft: 64 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 13, backgroundColor: C.card },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  kind: { flex: 1, fontFamily: sans, fontSize: 12, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  time: { fontFamily: sans, fontSize: 13, color: C.muted },
  title: { fontFamily: sans, fontSize: 16, fontWeight: '600', color: C.ink, letterSpacing: -0.2, marginTop: 2 },
  body: { fontFamily: sans, fontSize: 15, lineHeight: 20, color: 'rgba(63,38,35,0.82)', marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.wine, alignSelf: 'center' },
  footer: { fontFamily: sans, fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 4, paddingHorizontal: 24 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 80 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontFamily: sans, fontSize: 20, fontWeight: '700', color: C.ink, letterSpacing: -0.4 },
  emptyText: { fontFamily: sans, fontSize: 15, lineHeight: 21, color: C.muted, textAlign: 'center', marginTop: 6 },
  emptyLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 16, padding: 6 },
  emptyLinkText: { fontFamily: sans, fontSize: 15, fontWeight: '600', color: C.wine },
});
