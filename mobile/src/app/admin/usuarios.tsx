import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Group, InputRow, Row, SwitchRow } from '@/components/form';
import { tapFeedback } from '@/components/ui';
import { C, sans } from '@/constants/theme';
import { AdminLogin } from '@/components/admin-login';
import { useAdmin } from '@/lib/use-admin';
import {
  changeMyAdminEmail, inviteUser, listUsers, PERMISSIONS, resetUserPassword, restoreUser, revokeUser,
  setMyBirthdayCalendar, setUserRole, type ManagedUser,
} from '@/lib/admin';

type GroupKey = 'super' | 'editorial' | 'dashboard' | 'none' | 'revoked';
const GROUPS: { key: GroupKey; label: string; hint: string; color: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'super', label: 'Super Admin', hint: 'Acceso total', color: C.wine, icon: 'shield-checkmark' },
  { key: 'editorial', label: 'Equipo editorial', hint: 'Devocionales', color: '#6b5b95', icon: 'book' },
  { key: 'dashboard', label: 'Dashboard', hint: 'Registros', color: '#2f6db5', icon: 'stats-chart' },
  { key: 'none', label: 'Sin permisos', hint: 'Solo avisos', color: '#8e8187', icon: 'person' },
  { key: 'revoked', label: 'Acceso revocado', hint: 'No pueden entrar', color: '#b5523b', icon: 'ban' },
];
function groupOf(u: ManagedUser): GroupKey {
  if (u.isRevoked) return 'revoked';
  if (u.isSuperAdmin) return 'super';
  if (u.permissions.includes('editor') || u.permissions.includes('reviewer')) return 'editorial';
  if (u.permissions.includes('read_export') || u.permissions.includes('read_only')) return 'dashboard';
  return 'none';
}
const CHIP_LABEL: Record<string, string> = { editor: 'Editora', reviewer: 'Revisora', read_export: 'Manager', read_only: 'Vista simple', birthday_calendar: '🎂 Cumpleaños' };
function chipsOf(u: ManagedUser) {
  if (u.isRevoked) return ['Revocado'];
  const list = u.isSuperAdmin ? ['Super Admin'] : [];
  const order = ['editor', 'reviewer', 'read_export', 'read_only', 'birthday_calendar'];
  for (const key of order) {
    if (!u.permissions.includes(key)) continue;
    if (u.isSuperAdmin && key !== 'birthday_calendar') continue;
    if (key === 'read_only' && u.permissions.includes('read_export')) continue;
    list.push(CHIP_LABEL[key]);
  }
  return list.length ? list : ['Sin permisos'];
}
const initialsOf = (u: ManagedUser) => (u.nombre || u.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function UserCard({ u, color, onPress }: { u: ManagedUser; color: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={() => { tapFeedback(); onPress(); }} style={({ pressed }) => [s.userRow, pressed && { backgroundColor: C.fill }]}>
      <View style={[s.userAvatar, { backgroundColor: color }]}><Text style={s.userAvatarText}>{initialsOf(u)}</Text></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.nameLine}>
          <Text style={s.rowName} numberOfLines={1}>{u.nombre || u.email}</Text>
          {u.isCurrentUser ? <View style={s.youBadge}><Text style={s.youText}>Tú</Text></View> : null}
        </View>
        <Text style={s.rowMail} numberOfLines={1}>{u.email}</Text>
        <View style={s.chips}>
          {chipsOf(u).map((c) => <View key={c} style={[s.chip, { backgroundColor: `${color}1A` }]}><Text style={[s.chipText, { color }]}>{c}</Text></View>)}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={17} color="rgba(60,40,38,0.3)" />
    </Pressable>
  );
}


function UserSheet({ user, onClose, onChanged }: { user: ManagedUser; onClose: () => void; onChanged: () => void }) {
  const [perms, setPerms] = useState(user.permissions);
  const [superAdmin, setSuperAdmin] = useState(user.isSuperAdmin);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(user.email);
  const self = user.isCurrentUser;

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await fn(); if (ok) Alert.alert(ok); onChanged(); }
    catch (e) { Alert.alert('No se pudo completar', e instanceof Error ? e.message : ''); }
    finally { setBusy(false); }
  };

  const togglePerm = (key: string, on: boolean) => {
    if (self) {
      // Own account: only the birthday reminder may change (rest is protected).
      if (key !== 'birthday_calendar') return;
      setPerms((p) => (on ? [...p, key] : p.filter((x) => x !== key)));
      void run(() => setMyBirthdayCalendar(on));
      return;
    }
    const next = on ? [...perms, key] : perms.filter((x) => x !== key);
    setPerms(next);
    void run(() => setUserRole(user.userId, superAdmin, next));
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={s.sheetBar}>
          <View style={{ width: 70 }} />
          <Text style={s.sheetTitle}>Permisos</Text>
          <Pressable hitSlop={10} onPress={onClose} style={{ width: 70, alignItems: 'flex-end' }}><Text style={s.done}>Listo</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={s.page}>
          <View style={s.userHead}>
            <View style={s.avatar}><Text style={s.avatarText}>{(user.nombre || user.email).charAt(0).toUpperCase()}</Text></View>
            <Text style={s.userName}>{user.nombre || user.email}</Text>
            <Text style={s.userMail}>{user.email}{self ? ' · Tu cuenta' : ''}</Text>
          </View>

          <Group header="Permisos" footer={self ? 'Tu rol está protegido para que no pierdas el acceso. Solo puedes activar el aviso de cumpleaños.' : 'Los cambios se aplican al instante.'}>
            {PERMISSIONS.map((p) => (
              <SwitchRow
                key={p.key}
                label={p.label}
                sub={p.hint}
                value={perms.includes(p.key)}
                disabled={busy || user.isRevoked || (self ? p.key !== 'birthday_calendar' : superAdmin && p.key !== 'birthday_calendar')}
                onValueChange={(v) => togglePerm(p.key, v)}
              />
            ))}
            <SwitchRow
              icon="shield-checkmark"
              label="Super Admin"
              sub="Acceso total al panel"
              value={superAdmin}
              disabled={busy || self || user.isRevoked}
              onValueChange={(v) => {
                setSuperAdmin(v);
                const keep = perms.filter((x) => x === 'birthday_calendar' || !v);
                setPerms(keep);
                void run(() => setUserRole(user.userId, v, keep));
              }}
            />
          </Group>

          {!self ? (
            <Group header="Cuenta">
              <Row icon="key" tint="#8e8187" label="Enviar enlace de contraseña" onPress={() => run(() => resetUserPassword(user.userId), 'Enlace enviado por correo')} />
              {user.isRevoked ? (
                <Row label="Restaurar acceso" onPress={() => run(() => restoreUser(user.userId), 'Acceso restaurado')} />
              ) : (
                <Row label="Revocar acceso" destructive chevron={false} onPress={() => Alert.alert('Revocar acceso', `${user.email} ya no podrá entrar al panel ni al dashboard.`, [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Revocar', style: 'destructive', onPress: () => run(() => revokeUser(user.userId), 'Acceso revocado') },
                ])} />
              )}
            </Group>
          ) : null}
          {self ? <Group header="Correo de acceso" footer="El sistema enviará la confirmación del cambio al correo nuevo.">
            <InputRow label="Correo del Super Admin" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <Row icon="mail-outline" label="Cambiar mi correo" onPress={() => {
              const next = email.trim().toLowerCase();
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) return Alert.alert('Correo no válido', 'Escribe un correo electrónico válido.');
              if (next === user.email.toLowerCase()) return Alert.alert('Sin cambios', 'Ese correo ya está asociado a tu cuenta.');
              Alert.alert('Cambiar correo', `¿Cambiar el correo de acceso a ${next}?`, [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Cambiar', onPress: () => run(() => changeMyAdminEmail(next), 'Solicitud de cambio enviada') },
              ]);
            }} />
          </Group> : null}
          {busy ? <ActivityIndicator color={C.wine} style={{ marginTop: 16 }} /> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function InviteSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [perms, setPerms] = useState<string[]>([]);
  const [superAdmin, setSuperAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return Alert.alert('Correo no válido', 'Escribe el correo de la persona que quieres invitar.');
    setBusy(true);
    try {
      await inviteUser(email.trim().toLowerCase(), nombre.trim(), perms, superAdmin);
      tapFeedback();
      Alert.alert('Invitación enviada', `${email.trim()} recibirá un correo para crear su contraseña.`);
      onDone();
    } catch (e) {
      Alert.alert('No se pudo invitar', e instanceof Error ? e.message : '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={s.sheetBar}>
          <Pressable hitSlop={10} onPress={onClose} style={{ width: 80 }}><Text style={s.cancel}>Cancelar</Text></Pressable>
          <Text style={s.sheetTitle}>Invitar</Text>
          <Pressable hitSlop={10} disabled={busy} onPress={() => { void send(); }} style={{ width: 80, alignItems: 'flex-end' }}>
            <Text style={[s.done, busy && { opacity: 0.5 }]}>{busy ? 'Enviando…' : 'Enviar'}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
          <Group header="Persona">
            <InputRow label="Nombre" value={nombre} onChangeText={setNombre} placeholder="Nombre y apellido" />
            <InputRow label="Correo" value={email} onChangeText={setEmail} placeholder="nombre@correo.com" keyboardType="email-address" autoCapitalize="none" />
          </Group>
          <Group header="Permisos iniciales" footer="Recibirá un correo para crear su contraseña.">
            {PERMISSIONS.map((p) => (
              <SwitchRow key={p.key} label={p.label} sub={p.hint} value={perms.includes(p.key)} disabled={superAdmin && p.key !== 'birthday_calendar'}
                onValueChange={(v) => setPerms((cur) => (v ? [...cur, p.key] : cur.filter((x) => x !== p.key)))} />
            ))}
            <SwitchRow icon="shield-checkmark" label="Super Admin" sub="Acceso total al panel" value={superAdmin} onValueChange={setSuperAdmin} />
          </Group>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function AdminUsuarios() {
  const { access, ready } = useAdmin();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | GroupKey>('all');
  const [open, setOpen] = useState<ManagedUser | null>(null);
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers(await listUsers()); }
    catch (e) { Alert.alert('No se pudieron cargar', e instanceof Error ? e.message : ''); setUsers([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (!ready || !access || access.isRevoked || !access.isSuperAdmin) return;
    let alive = true;
    listUsers()
      .then((list) => { if (alive) setUsers(list); })
      .catch((e) => { if (alive) { setUsers([]); Alert.alert('No se pudieron cargar', e instanceof Error ? e.message : ''); } });
    return () => { alive = false; };
  }, [access, ready]);

  const q = query.trim().toLowerCase();
  const filtered = (users ?? []).filter((u) => {
    const matchesText = !q || u.email.toLowerCase().includes(q) || u.nombre.toLowerCase().includes(q);
    return matchesText && (roleFilter === 'all' || groupOf(u) === roleFilter);
  });
  const counts = Object.fromEntries(GROUPS.map((g) => [g.key, (users ?? []).filter((u) => groupOf(u) === g.key).length])) as Record<GroupKey, number>;

  if (!ready) return <ActivityIndicator color={C.wine} style={{ marginTop: 40 }} />;
  if (!access) return <AdminLogin />;
  if (access.isRevoked || !access.isSuperAdmin) return <View style={{ flex: 1, padding: 18 }}><Row icon="lock-closed" label="Solo Super Admin puede administrar usuarios y roles." chevron={false} /></View>;

  return (
    <>
      <Stack.Screen options={{
        headerRight: () => (
          <Pressable accessibilityLabel="Invitar usuario" hitSlop={10} onPress={() => { tapFeedback(); setInviting(true); }}>
            <Ionicons name="person-add" size={22} color={C.wine} style={{ marginHorizontal: 8 }} />
          </Pressable>
        ),
      }} />
      <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={loading && !!users} onRefresh={load} tintColor={C.wine} />} keyboardShouldPersistTaps="handled">
        <View style={s.search}>
          <Ionicons name="search" size={16} color={C.muted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Buscar por nombre o correo" placeholderTextColor="#b3a3a0" autoCapitalize="none" style={s.searchInput} />
        </View>
        {users ? (
          <View style={s.summary}>
            {GROUPS.filter((g) => g.key !== 'none' || counts.none > 0).map((g) => (
              <Pressable key={g.key} onPress={() => { tapFeedback(); setRoleFilter(roleFilter === g.key ? 'all' : g.key); }} style={[s.tile, roleFilter === g.key && { borderColor: g.color }]}>
                <View style={[s.tileIcon, { backgroundColor: `${g.color}1A` }]}><Ionicons name={g.icon} size={15} color={g.color} /></View>
                <Text style={s.tileValue}>{counts[g.key]}</Text>
                <Text style={s.tileLabel} numberOfLines={1}>{g.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {roleFilter !== 'all' ? (
          <Pressable onPress={() => setRoleFilter('all')} style={s.clearFilter}><Ionicons name="close-circle" size={15} color={C.wine} /><Text style={s.clearFilterText}>Mostrar todos</Text></Pressable>
        ) : null}
        {!users ? <ActivityIndicator color={C.wine} style={{ marginTop: 40 }} /> : null}
        {users && !filtered.length ? <Text style={s.emptyText}>No hay cuentas que coincidan.</Text> : null}
        {GROUPS.map((g) => {
          const list = filtered.filter((u) => groupOf(u) === g.key);
          if (!list.length) return null;
          return (
            <View key={g.key} style={{ marginTop: 22 }}>
              <Text style={s.groupHeader}>{g.label} · {list.length}<Text style={s.groupHint}>  {g.hint}</Text></Text>
              <View style={s.groupCard}>
                {list.map((u, i) => (
                  <View key={u.userId}>
                    {i > 0 ? <View style={s.sep} /> : null}
                    <UserCard u={u} color={g.color} onPress={() => setOpen(u)} />
                  </View>
                ))}
              </View>
            </View>
          );
        })}
        <Text style={s.footnote}>Toca una cuenta para cambiar sus permisos, revocar el acceso o enviarle un enlace de contraseña.</Text>
      </ScrollView>
      {open ? <UserSheet user={open} onClose={() => setOpen(null)} onChanged={() => { void load(); }} /> : null}
      {inviting ? <InviteSheet onClose={() => setInviting(false)} onDone={() => { setInviting(false); void load(); }} /> : null}
    </>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, paddingBottom: 60 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  tile: { flexGrow: 1, flexBasis: '30%', backgroundColor: C.card, borderRadius: 16, padding: 12, borderWidth: 1.5, borderColor: 'transparent' },
  tileIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  tileValue: { fontFamily: sans, fontSize: 22, fontWeight: '700', color: C.ink, fontVariant: ['tabular-nums'] },
  tileLabel: { fontFamily: sans, fontSize: 12, color: C.muted, marginTop: 1 },
  clearFilter: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: C.fill },
  clearFilterText: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.wine },
  emptyText: { fontFamily: sans, fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 30 },
  groupHeader: { fontFamily: sans, fontSize: 13, fontWeight: '700', color: C.ink, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 14, marginBottom: 8 },
  groupHint: { fontWeight: '500', color: C.muted, textTransform: 'none', letterSpacing: 0 },
  groupCard: { backgroundColor: C.card, borderRadius: 16, overflow: 'hidden' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.separator, marginLeft: 70 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  userAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontFamily: sans, fontSize: 16, fontWeight: '700', color: '#fff' },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { fontFamily: sans, fontSize: 16, fontWeight: '600', color: C.ink, letterSpacing: -0.2, flexShrink: 1 },
  youBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: C.wine },
  youText: { fontFamily: sans, fontSize: 10, fontWeight: '800', color: '#fff' },
  rowMail: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipText: { fontFamily: sans, fontSize: 11, fontWeight: '700' },
  footnote: { fontFamily: sans, fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 20, paddingHorizontal: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 12, borderRadius: 11, backgroundColor: 'rgba(118,94,90,0.12)' },
  searchInput: { flex: 1, fontFamily: sans, fontSize: 16, color: C.ink },
  sheetBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  sheetTitle: { fontFamily: sans, fontSize: 17, fontWeight: '600', color: C.ink },
  cancel: { fontFamily: sans, fontSize: 17, color: C.wine },
  done: { fontFamily: sans, fontSize: 17, fontWeight: '700', color: C.wine },
  userHead: { alignItems: 'center', gap: 4, paddingTop: 6 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  avatarText: { fontFamily: sans, fontSize: 26, fontWeight: '700', color: '#fff' },
  userName: { fontFamily: sans, fontSize: 20, fontWeight: '700', letterSpacing: -0.4, color: C.ink },
  userMail: { fontFamily: sans, fontSize: 14, color: C.muted },
});
