import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Group, InputRow, Row, SwitchRow } from '@/components/form';
import { tapFeedback } from '@/components/ui';
import { C, sans } from '@/constants/theme';
import {
  inviteUser, listUsers, PERMISSIONS, resetUserPassword, restoreUser, revokeUser,
  setMyBirthdayCalendar, setUserRole, type ManagedUser,
} from '@/lib/admin';

function roleSummary(u: ManagedUser) {
  if (u.isRevoked) return 'Acceso revocado';
  if (u.isSuperAdmin) return 'Super Admin';
  const labels = PERMISSIONS.filter((p) => u.permissions.includes(p.key)).map((p) => p.label.split(' (')[0]);
  return labels.length ? labels.join(' · ') : 'Vista simple';
}

function UserSheet({ user, onClose, onChanged }: { user: ManagedUser; onClose: () => void; onChanged: () => void }) {
  const [perms, setPerms] = useState(user.permissions);
  const [superAdmin, setSuperAdmin] = useState(user.isSuperAdmin);
  const [busy, setBusy] = useState(false);
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
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<ManagedUser | null>(null);
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers(await listUsers()); }
    catch (e) { Alert.alert('No se pudieron cargar', e instanceof Error ? e.message : ''); setUsers([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let alive = true;
    listUsers()
      .then((list) => { if (alive) setUsers(list); })
      .catch((e) => { if (alive) { setUsers([]); Alert.alert('No se pudieron cargar', e instanceof Error ? e.message : ''); } });
    return () => { alive = false; };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (users ?? []).filter((u) => !q || u.email.toLowerCase().includes(q) || u.nombre.toLowerCase().includes(q));

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
        {!users ? <ActivityIndicator color={C.wine} style={{ marginTop: 40 }} /> : (
          <Group header={`${filtered.length} ${filtered.length === 1 ? 'cuenta' : 'cuentas'}`}>
            {filtered.map((u) => (
              <Row
                key={u.userId}
                icon={u.isRevoked ? 'ban' : u.isSuperAdmin ? 'shield-checkmark' : 'person'}
                tint={u.isRevoked ? '#8e8187' : u.isSuperAdmin ? C.wine : '#6b5b95'}
                label={u.nombre || u.email}
                sub={`${u.nombre ? u.email + ' · ' : ''}${roleSummary(u)}`}
                onPress={() => setOpen(u)}
              />
            ))}
          </Group>
        )}
      </ScrollView>
      {open ? <UserSheet user={open} onClose={() => setOpen(null)} onChanged={() => { void load(); }} /> : null}
      {inviting ? <InviteSheet onClose={() => setInviting(false)} onDone={() => { setInviting(false); void load(); }} /> : null}
    </>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, paddingBottom: 60 },
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
