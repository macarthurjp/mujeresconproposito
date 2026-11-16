import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Group, Row, SwitchRow } from '@/components/form';
import { tapFeedback } from '@/components/ui';
import { C, sans } from '@/constants/theme';
import {
  ADMIN_MODULES, ADMIN_PERMISSION_CATALOG, assignAdminRole, listAdminRoleAssignments, listAdminRoles, listAdminUserOverrides,
  listAllAdminRolePermissions, listUsers, removeAdminRoleAssignment, saveAdminRole, saveAdminRolePermissions, saveAdminUserOverrides,
  type AdminRole, type ManagedUser,
} from '@/lib/admin';
import { useAdmin } from '@/lib/use-admin';

type Assignment = { user_id: string; role_id: string; assigned_at: string };

const actionOf = (key: string) => key.split('.')[1];
const SENSITIVE = new Set(['delete', 'publish', 'send']);
const PRESETS: { key: string; label: string; actions: string[] | null; viewOnlyOk: boolean }[] = [
  { key: 'none', label: 'Nada', actions: [], viewOnlyOk: true },
  { key: 'read', label: 'Solo lectura', actions: ['view'], viewOnlyOk: true },
  { key: 'edit', label: 'Editor', actions: ['view', 'create', 'add', 'edit'], viewOnlyOk: false },
  { key: 'all', label: 'Todo', actions: null, viewOnlyOk: false },
];
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((k) => b.includes(k));
const initials = (u: ManagedUser) => (u.nombre || u.email).trim().charAt(0).toUpperCase();
const countLabel = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Toggles for one role, grouped by module, with quick presets and a readable summary. */
function PermissionEditor({ viewOnly, value, onChange }: { viewOnly: boolean; value: string[]; onChange: (next: string[]) => void }) {
  const preset = (actions: string[] | null) => onChange(ADMIN_PERMISSION_CATALOG
    .filter((p) => (actions === null || actions.includes(actionOf(p.key))) && (!viewOnly || actionOf(p.key) === 'view'))
    .map((p) => p.key));
  const summary = ADMIN_MODULES.map((module) => ({
    label: module.label,
    actions: module.permissions.filter((p) => value.includes(`${module.key}.${p.key}`)).map((p) => p.label.toLowerCase()),
  })).filter((line) => line.actions.length);
  return (
    <View>
      {viewOnly ? (
        <View style={s.note}><Ionicons name="lock-closed" size={15} color={C.wine} /><Text style={s.noteText}>Rol de solo lectura: solo admite permisos de visualizar. Nadie con este rol puede crear, editar, eliminar, publicar ni enviar avisos.</Text></View>
      ) : null}
      <View style={s.summary}>
        <Text style={s.summaryTitle}>Este rol puede</Text>
        {summary.length ? summary.map((line) => (
          <View key={line.label} style={s.summaryLine}>
            <Ionicons name="checkmark-circle" size={15} color="#2e7d4f" style={{ marginTop: 2 }} />
            <Text style={s.summaryText}><Text style={s.summaryModule}>{line.label}: </Text>{line.actions.join(', ')}</Text>
          </View>
        )) : <Text style={s.summaryEmpty}>Todavía no tiene permisos. Elige una opción rápida o activa los permisos abajo.</Text>}
      </View>
      <Text style={[s.miniLabel, { marginTop: 14 }]}>Opciones rápidas</Text>
      <View style={s.presets}>
        {PRESETS.filter((p) => !viewOnly || p.viewOnlyOk).map((p) => (
          <Pressable key={p.key} onPress={() => { tapFeedback(); preset(p.actions); }} style={({ pressed }) => [s.preset, pressed && { opacity: 0.7 }]}>
            <Text style={s.presetText}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      {ADMIN_MODULES.map((module) => (
        <Group key={module.key} header={module.label}>
          {module.permissions.filter((p) => !viewOnly || p.key === 'view').map((p) => {
            const key = `${module.key}.${p.key}`;
            return <SwitchRow key={key} label={p.label} sub={SENSITIVE.has(p.key) ? 'Permiso importante' : undefined} value={value.includes(key)}
              onValueChange={(on) => onChange(on ? [...new Set([...value, key])] : value.filter((k) => k !== key))} />;
          })}
        </Group>
      ))}
    </View>
  );
}

export default function AdminRoles() {
  const { access, ready } = useAdmin();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [rolePerms, setRolePerms] = useState<Record<string, string[]>>({});
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  // Step 1: pick people.
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  // Step 2: assign sheet.
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignRole, setAssignRole] = useState<AdminRole | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  // Role editor (create / edit a role without assigning).
  const [roleSheet, setRoleSheet] = useState<{ role: AdminRole | null } | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  // Exceptions.
  const [overrideUser, setOverrideUser] = useState<ManagedUser | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean | null>>({});

  const refresh = useCallback(async () => {
    const [r, p, a, u] = await Promise.all([listAdminRoles(), listAllAdminRolePermissions(), listAdminRoleAssignments(), listUsers()]);
    setRoles(r); setRolePerms(p); setAssignments(a as Assignment[]); setUsers(u); setLoaded(true);
  }, []);
  useEffect(() => {
    if (ready && access?.isSuperAdmin && !access.isRevoked) {
      void Promise.resolve().then(refresh).catch((e) => Alert.alert('No se pudo cargar Roles y permisos', e instanceof Error ? e.message : ''));
    }
  }, [access, ready, refresh]);

  const assignable = useMemo(() => users.filter((u) => !u.isSuperAdmin && !u.isRevoked), [users]);
  const roleOf = useCallback((userId: string) => {
    const a = assignments.find((x) => x.user_id === userId);
    return a ? roles.find((r) => r.id === a.role_id) ?? null : null;
  }, [assignments, roles]);
  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    if (q.length < 3) return [];
    return assignable.filter((u) => `${u.nombre} ${u.email}`.toLocaleLowerCase('es').includes(q)).slice(0, 8);
  }, [assignable, query]);
  const pickedUsers = picked.map((id) => users.find((u) => u.userId === id)).filter((u): u is ManagedUser => Boolean(u));
  const withRole = assignable.filter((u) => roleOf(u.userId)).sort((a, b) => (roleOf(a.userId)?.name ?? '').localeCompare(roleOf(b.userId)?.name ?? '', 'es') || a.email.localeCompare(b.email));

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    try { await task(); return true; }
    catch (e) { Alert.alert('No se pudo guardar', e instanceof Error ? e.message : 'Inténtalo de nuevo.'); return false; }
    finally { setBusy(false); }
  };
  const confirmSensitive = (role: AdminRole, next: string[], onOk: () => void) => {
    const before = rolePerms[role.id] ?? [];
    const risky = ADMIN_PERMISSION_CATALOG.filter((p) => next.includes(p.key) && SENSITIVE.has(actionOf(p.key)) && !before.includes(p.key));
    if (!risky.length) return onOk();
    const lines = risky.map((p) => `• ${ADMIN_MODULES.find((m) => m.key === p.module)?.label}: ${p.label.toLowerCase()}`).join('\n');
    Alert.alert('Permisos importantes', `Las personas con el rol «${role.name}» podrán:\n${lines}\n\n¿Continuar?`, [
      { text: 'Revisar', style: 'cancel' }, { text: 'Continuar', onPress: onOk },
    ]);
  };

  const togglePick = (u: ManagedUser) => { tapFeedback(); setPicked((cur) => cur.includes(u.userId) ? cur.filter((x) => x !== u.userId) : [...cur, u.userId]); };
  const openAssign = (ids?: string[]) => {
    if (ids) setPicked(ids);
    const current = (ids ?? picked).map((id) => roleOf(id)).find(Boolean) ?? null;
    setAssignRole(current); setDraft(current ? rolePerms[current.id] ?? [] : []); setAssignOpen(true);
  };
  const chooseRole = (r: AdminRole) => { tapFeedback(); setAssignRole(r); setDraft(rolePerms[r.id] ?? []); };
  const saveAndAssign = () => {
    const role = assignRole; if (!role) return;
    const targets = pickedUsers;
    const go = () => void run(async () => {
      if (!sameSet(draft, rolePerms[role.id] ?? [])) await saveAdminRolePermissions(role.id, draft);
      for (const u of targets) await assignAdminRole(u.email, role.id);
      await refresh();
    }).then((ok) => {
      if (!ok) return;
      setAssignOpen(false); setPicked([]); setQuery('');
      Alert.alert('Rol asignado', `${role.name} asignado a ${countLabel(targets.length, 'persona', 'personas')}.`);
    });
    if (!draft.length) {
      return Alert.alert('Rol sin permisos', `«${role.name}» no tiene ningún permiso: estas personas no verán ningún módulo. ¿Asignarlo igualmente?`, [
        { text: 'Revisar', style: 'cancel' }, { text: 'Asignar', onPress: () => confirmSensitive(role, draft, go) },
      ]);
    }
    confirmSensitive(role, draft, go);
  };

  const openRoleSheet = (role: AdminRole | null) => {
    setRoleSheet({ role }); setRoleName(role?.name ?? ''); setRoleDescription(role?.description ?? ''); setDraft(role ? rolePerms[role.id] ?? [] : []);
  };
  const saveRoleSheet = () => {
    const role = roleSheet?.role ?? null;
    if (!roleName.trim()) return Alert.alert('Falta el nombre', 'Escribe un nombre para el rol.');
    const go = () => void run(async () => {
      const id = await saveAdminRole(roleName.trim(), roleDescription.trim(), role?.id);
      await saveAdminRolePermissions(id, draft);
      await refresh();
    }).then((ok) => { if (ok) setRoleSheet(null); });
    if (role) confirmSensitive(role, draft, go); else go();
  };

  const removeRole = (u: ManagedUser) => {
    const r = roleOf(u.userId);
    Alert.alert('Quitar rol', `¿Quitar el rol ${r?.name ?? ''} a ${u.nombre || u.email}? Dejará de ver los módulos del panel.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => void run(async () => { await removeAdminRoleAssignment(u.userId); await refresh(); }) },
    ]);
  };
  const openOverrides = async (u: ManagedUser) => {
    try {
      const current = await listAdminUserOverrides(u.userId);
      const next: Record<string, boolean | null> = {};
      ADMIN_PERMISSION_CATALOG.forEach((p) => { next[p.key] = current[p.key] ?? null; });
      setOverrides(next); setOverrideUser(u);
    } catch (e) { Alert.alert('No se pudieron leer las excepciones', e instanceof Error ? e.message : ''); }
  };
  const overrideRole = overrideUser ? roleOf(overrideUser.userId) : null;
  const inherited = overrideRole ? rolePerms[overrideRole.id] ?? [] : [];
  const cycle = (key: string) => setOverrides((old) => {
    const cur = old[key] ?? null;
    const canAllow = !overrideRole?.view_only || actionOf(key) === 'view';
    const next = cur === null ? (inherited.includes(key) ? false : canAllow ? true : false) : cur === true ? false : null;
    return { ...old, [key]: next };
  });
  const saveOverrides = () => {
    const explicit = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== null)) as Record<string, boolean>;
    void run(() => saveAdminUserOverrides(overrideUser!.userId, explicit)).then((ok) => { if (ok) setOverrideUser(null); });
  };

  if (!ready || !access) return <ActivityIndicator color={C.wine} style={{ marginTop: 40 }} />;
  if (!access.isSuperAdmin || access.isRevoked) return <View style={s.page}>
    <Group footer="Solo el Super Admin puede administrar roles y permisos. Si tienes una cuenta de Super Admin, cierra sesión y entra con ella."><Row icon="lock-closed" label="Sin acceso" chevron={false} /></Group>
    <Group><Row icon="chevron-back" label="Volver a Administración" onPress={() => router.replace('/admin')} /></Group>
  </View>;

  return <>
    <Stack.Screen options={{ title: 'Roles y permisos', headerRight: () => <Pressable accessibilityLabel="Crear rol" onPress={() => openRoleSheet(null)} hitSlop={12}><Ionicons name="add-circle" size={28} color={C.wine} /></Pressable> }} />
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      {!loaded ? <ActivityIndicator color={C.wine} style={{ marginTop: 30 }} /> : <>
        {/* Step 1 — people */}
        <Text style={s.section}>Asignar rol</Text>
        <View style={s.card}>
          <View style={s.search}>
            <Ionicons name="search" size={17} color={C.muted} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Buscar por nombre o correo" placeholderTextColor="#a58e88" autoCapitalize="none" autoCorrect={false} style={s.searchInput} />
            {query ? <Pressable onPress={() => setQuery('')} hitSlop={10}><Ionicons name="close-circle" size={18} color={C.muted} /></Pressable> : null}
          </View>
          {query.trim().length > 0 && query.trim().length < 3 ? <Text style={s.hint}>Escribe al menos 3 letras.</Text> : null}
          {query.trim().length >= 3 && !results.length ? <Text style={s.hint}>No hay cuentas con ese nombre o correo. Invítala primero en Usuarios y roles.</Text> : null}
          {results.map((u) => {
            const on = picked.includes(u.userId); const r = roleOf(u.userId);
            return (
              <Pressable key={u.userId} onPress={() => togglePick(u)} style={({ pressed }) => [s.person, pressed && { backgroundColor: C.fill }]}>
                <View style={s.avatar}><Text style={s.avatarText}>{initials(u)}</Text></View>
                <View style={s.personText}>
                  <Text style={s.personName}>{u.nombre || 'Sin nombre'}</Text>
                  <Text style={s.personEmail}>{u.email}</Text>
                  <Text style={s.personRole}>{r ? `Rol actual: ${r.name}` : 'Sin rol'}</Text>
                </View>
                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? C.wine : '#c9b9b6'} />
              </Pressable>
            );
          })}
          {pickedUsers.length ? (
            <View style={s.chips}>
              {pickedUsers.map((u) => (
                <Pressable key={u.userId} onPress={() => togglePick(u)} style={s.chip}>
                  <Text style={s.chipText}>{u.nombre || u.email}</Text><Ionicons name="close" size={14} color={C.wine} />
                </Pressable>
              ))}
            </View>
          ) : null}
          <Pressable disabled={!pickedUsers.length} onPress={() => openAssign()} style={({ pressed }) => [s.primary, !pickedUsers.length && s.disabled, pressed && { opacity: 0.85 }]}>
            <Ionicons name="shield-checkmark" size={17} color="#fff" />
            <Text style={s.primaryText}>{pickedUsers.length ? `Asignar rol a ${countLabel(pickedUsers.length, 'persona', 'personas')}` : 'Selecciona personas para asignar'}</Text>
          </Pressable>
        </View>

        {/* People with a role */}
        <Text style={s.section}>Personas con rol · {withRole.length}</Text>
        {withRole.length ? <View style={s.card}>
          {withRole.map((u, i) => {
            const r = roleOf(u.userId)!;
            return (
              <View key={u.userId} style={[s.assigned, i > 0 && s.sep]}>
                <View style={s.assignedTop}>
                  <View style={s.avatar}><Text style={s.avatarText}>{initials(u)}</Text></View>
                  <View style={s.personText}>
                    <Text style={s.personName}>{u.nombre || 'Sin nombre'}</Text>
                    <Text style={s.personEmail}>{u.email}</Text>
                  </View>
                  <View style={[s.rolePill, r.view_only && s.rolePillRead]}><Text style={s.rolePillText}>{r.name}</Text></View>
                </View>
                <View style={s.actions}>
                  <Pressable onPress={() => openAssign([u.userId])} style={s.action}><Ionicons name="swap-horizontal" size={14} color={C.wine} /><Text style={s.actionText}>Cambiar rol</Text></Pressable>
                  <Pressable onPress={() => void openOverrides(u)} style={s.action}><Ionicons name="options-outline" size={14} color={C.wine} /><Text style={s.actionText}>Excepciones</Text></Pressable>
                  <Pressable onPress={() => removeRole(u)} style={s.action}><Ionicons name="remove-circle-outline" size={14} color={C.live} /><Text style={[s.actionText, { color: C.live }]}>Quitar</Text></Pressable>
                </View>
              </View>
            );
          })}
        </View> : <Text style={s.hint}>Todavía nadie tiene un rol asignado.</Text>}

        {/* Roles */}
        <Text style={s.section}>Roles</Text>
        <View style={s.card}>
          {roles.map((r, i) => {
            const n = assignments.filter((a) => a.role_id === r.id).length; const p = (rolePerms[r.id] ?? []).length;
            return (
              <Pressable key={r.id} onPress={() => openRoleSheet(r)} style={({ pressed }) => [s.roleRow, i > 0 && s.sep, pressed && { backgroundColor: C.fill }]}>
                <View style={s.roleIcon}><Ionicons name={r.view_only ? 'eye' : 'shield'} size={16} color={C.wine} /></View>
                <View style={s.personText}>
                  <Text style={s.personName}>{r.name}</Text>
                  <Text style={s.personEmail}>{countLabel(n, 'persona', 'personas')} · {p ? countLabel(p, 'permiso', 'permisos') : 'sin configurar'}{r.view_only ? ' · solo lectura' : ''}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#c4b3b0" />
              </Pressable>
            );
          })}
        </View>
        <Text style={s.footnote}>Primero invita a la persona en Usuarios y roles. Luego búscala aquí, asígnale un rol y revisa sus permisos. Los permisos de un rol se aplican a todas las personas con ese rol; para casos puntuales usa Excepciones.</Text>
      </>}
    </ScrollView>

    {/* Assign sheet */}
    <Modal visible={assignOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAssignOpen(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={s.sheetBar}>
          <Pressable onPress={() => setAssignOpen(false)} hitSlop={10}><Text style={s.sheetCancel}>Cancelar</Text></Pressable>
          <Text style={s.sheetTitle}>Asignar rol</Text>
          <Pressable disabled={!assignRole || busy} onPress={saveAndAssign} hitSlop={10}><Text style={[s.sheetDone, (!assignRole || busy) && { opacity: 0.4 }]}>{busy ? 'Guardando…' : 'Guardar'}</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={s.page}>
          <Text style={s.miniLabel}>Para</Text>
          <View style={[s.chips, { paddingHorizontal: 0 }]}>{pickedUsers.map((u) => <View key={u.userId} style={s.chipStatic}><Text style={s.chipText}>{u.nombre || u.email}</Text></View>)}</View>
          <Text style={[s.miniLabel, { marginTop: 18 }]}>Elige un rol</Text>
          <View style={s.card}>
            {roles.map((r, i) => {
              const on = assignRole?.id === r.id; const p = (rolePerms[r.id] ?? []).length;
              return (
                <Pressable key={r.id} onPress={() => chooseRole(r)} style={[s.roleRow, i > 0 && s.sep]}>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? C.wine : '#c9b9b6'} />
                  <View style={s.personText}>
                    <Text style={s.personName}>{r.name}</Text>
                    <Text style={s.personEmail}>{p ? countLabel(p, 'permiso', 'permisos') : 'Sin configurar'}{r.view_only ? ' · solo lectura' : ''}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {assignRole ? <>
            <Text style={[s.miniLabel, { marginTop: 18 }]}>Permisos de {assignRole.name}</Text>
            <Text style={[s.hint, { marginHorizontal: 4 }]}>Los cambios se aplican a todas las personas con el rol {assignRole.name}.</Text>
            <PermissionEditor viewOnly={Boolean(assignRole.view_only)} value={draft} onChange={setDraft} />
          </> : <Text style={[s.hint, { marginHorizontal: 4, marginTop: 10 }]}>Elige un rol para ver y ajustar sus permisos.</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>

    {/* Role sheet: create / edit */}
    <Modal visible={!!roleSheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setRoleSheet(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={s.sheetBar}>
          <Pressable onPress={() => setRoleSheet(null)} hitSlop={10}><Text style={s.sheetCancel}>Cancelar</Text></Pressable>
          <Text style={s.sheetTitle}>{roleSheet?.role ? 'Editar rol' : 'Nuevo rol'}</Text>
          <Pressable disabled={busy} onPress={saveRoleSheet} hitSlop={10}><Text style={[s.sheetDone, busy && { opacity: 0.4 }]}>{busy ? 'Guardando…' : 'Guardar'}</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
          <Text style={s.miniLabel}>Nombre</Text>
          <TextInput value={roleName} onChangeText={setRoleName} placeholder="Ej. Coordinadora Europa" placeholderTextColor="#a58e88" maxLength={80} style={s.input} />
          <Text style={[s.miniLabel, { marginTop: 14 }]}>Descripción</Text>
          <TextInput value={roleDescription} onChangeText={setRoleDescription} placeholder="Para qué sirve este rol" placeholderTextColor="#a58e88" maxLength={300} multiline style={[s.input, { minHeight: 80 }]} textAlignVertical="top" />
          <Text style={[s.miniLabel, { marginTop: 18 }]}>Permisos</Text>
          <PermissionEditor viewOnly={Boolean(roleSheet?.role?.view_only)} value={draft} onChange={setDraft} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>

    {/* Exceptions */}
    <Modal visible={!!overrideUser} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOverrideUser(null)}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={s.sheetBar}>
          <Pressable onPress={() => setOverrideUser(null)} hitSlop={10}><Text style={s.sheetCancel}>Cancelar</Text></Pressable>
          <Text style={s.sheetTitle}>Excepciones</Text>
          <Pressable disabled={busy} onPress={saveOverrides} hitSlop={10}><Text style={[s.sheetDone, busy && { opacity: 0.4 }]}>{busy ? 'Guardando…' : 'Guardar'}</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={s.page}>
          <Text style={s.personName}>{overrideUser?.nombre || 'Sin nombre'}</Text>
          <Text style={s.personEmail}>{overrideUser?.email} · {overrideRole?.name ?? 'Sin rol'}</Text>
          <Text style={[s.hint, { marginHorizontal: 0, marginTop: 10 }]}>Toca un permiso para cambiarlo solo para esta persona: Heredar (lo que diga su rol) → Permitir → Denegar.{overrideRole?.view_only ? ' Su rol es de solo lectura: solo puedes ajustar qué puede ver.' : ''}</Text>
          {ADMIN_MODULES.map((module) => (
            <Group key={module.key} header={module.label}>
              {module.permissions.filter((p) => !overrideRole?.view_only || p.key === 'view').map((p) => {
                const key = `${module.key}.${p.key}`; const v = overrides[key] ?? null;
                const effective = v === null ? inherited.includes(key) : v;
                return (
                  <Pressable key={key} onPress={() => cycle(key)} style={s.overrideRow}>
                    <View style={{ flex: 1 }}><Text style={s.overrideLabel}>{p.label}</Text><Text style={s.overrideSub}>{effective ? 'Puede hacerlo' : 'Sin acceso'}</Text></View>
                    <View style={[s.state, v === true && s.stateAllow, v === false && s.stateDeny]}>
                      <Text style={[s.stateText, v === true && { color: '#2e7d4f' }, v === false && { color: C.live }]}>{v === null ? 'Heredar' : v ? 'Permitir' : 'Denegar'}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </Group>
          ))}
        </ScrollView>
      </View>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  page: { padding: 16, paddingBottom: 60, backgroundColor: C.bg },
  section: { fontFamily: sans, fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: C.muted, marginTop: 22, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: C.card, borderRadius: 18, overflow: 'hidden' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, paddingHorizontal: 12, minHeight: 46, borderRadius: 14, backgroundColor: '#f7f1f0' },
  searchInput: { flex: 1, fontFamily: sans, fontSize: 16, color: C.ink, paddingVertical: 10 },
  hint: { fontFamily: sans, fontSize: 13, lineHeight: 18, color: C.muted, marginHorizontal: 14, marginBottom: 10 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: sans, fontSize: 16, fontWeight: '700', color: C.wine },
  personText: { flex: 1, minWidth: 0 },
  personName: { fontFamily: sans, fontSize: 15, fontWeight: '600', color: C.ink },
  personEmail: { fontFamily: sans, fontSize: 13, lineHeight: 17, color: C.muted, marginTop: 1 },
  personRole: { fontFamily: sans, fontSize: 12, color: C.wine, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: C.fill },
  chipStatic: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: C.card },
  chipText: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.ink },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 12, minHeight: 50, borderRadius: 14, backgroundColor: C.wine },
  primaryText: { fontFamily: sans, fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { backgroundColor: '#d8c9c6' },
  assigned: { paddingHorizontal: 14, paddingVertical: 12 },
  assignedTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  rolePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: C.wine },
  rolePillRead: { backgroundColor: '#8e8187' },
  rolePillText: { fontFamily: sans, fontSize: 12, fontWeight: '700', color: '#fff' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginLeft: 50 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#f7f1f0' },
  actionText: { fontFamily: sans, fontSize: 12, fontWeight: '700', color: C.wine },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  roleIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  footnote: { fontFamily: sans, fontSize: 12, lineHeight: 17, color: C.muted, marginTop: 14, marginHorizontal: 4 },
  sheetBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.separator },
  sheetTitle: { fontFamily: sans, fontSize: 16, fontWeight: '700', color: C.ink },
  sheetCancel: { fontFamily: sans, fontSize: 16, color: C.muted },
  sheetDone: { fontFamily: sans, fontSize: 16, fontWeight: '700', color: C.wine },
  miniLabel: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.muted, marginBottom: 8, marginLeft: 4 },
  input: { backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontFamily: sans, fontSize: 16, color: C.ink },
  note: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 14, backgroundColor: C.fill, marginBottom: 10 },
  noteText: { flex: 1, fontFamily: sans, fontSize: 13, lineHeight: 18, color: C.ink },
  summary: { padding: 14, borderRadius: 14, backgroundColor: C.card, gap: 6 },
  summaryTitle: { fontFamily: sans, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: C.wine, marginBottom: 2 },
  summaryLine: { flexDirection: 'row', gap: 8 },
  summaryText: { flex: 1, fontFamily: sans, fontSize: 14, lineHeight: 20, color: C.ink },
  summaryModule: { fontWeight: '700' },
  summaryEmpty: { fontFamily: sans, fontSize: 14, lineHeight: 20, color: C.muted },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  preset: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.card },
  presetText: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.wine },
  overrideRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  overrideLabel: { fontFamily: sans, fontSize: 15, color: C.ink },
  overrideSub: { fontFamily: sans, fontSize: 12, color: C.muted, marginTop: 2 },
  state: { minWidth: 86, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: C.fill },
  stateAllow: { backgroundColor: 'rgba(46,125,79,0.12)' },
  stateDeny: { backgroundColor: 'rgba(214,69,69,0.12)' },
  stateText: { fontFamily: sans, fontSize: 13, fontWeight: '700', color: C.muted },
});
