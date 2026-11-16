import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Group, Row, SwitchRow } from '@/components/form';
import { C, sans } from '@/constants/theme';
import { ADMIN_MODULES, ADMIN_PERMISSION_CATALOG, assignAdminRole, listAdminRoleAssignments, listAdminRolePermissions, listAdminRoles, listAdminUserOverrides, listUsers, removeAdminRoleAssignment, saveAdminRole, saveAdminRolePermissions, saveAdminUserOverrides, type AdminRole, type ManagedUser } from '@/lib/admin';
import { useAdmin } from '@/lib/use-admin';

type Assignment = { user_id: string; role_id: string; assigned_at: string };
export default function AdminRoles() {
  const { access, ready } = useAdmin();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [selected, setSelected] = useState<AdminRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [savedPermissions, setSavedPermissions] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [roleModal, setRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [draftOverrides, setDraftOverrides] = useState<Record<string, boolean | null>>({});

  const refresh = useCallback(async () => {
    const [nextRoles, nextAssignments, nextUsers] = await Promise.all([listAdminRoles(), listAdminRoleAssignments(), listUsers()]);
    setRoles(nextRoles); setAssignments(nextAssignments as Assignment[]); setUsers(nextUsers);
    setSelected((current) => current ? nextRoles.find((role) => role.id === current.id) ?? null : null);
  }, []);
  useEffect(() => { if (ready && access?.isSuperAdmin && !access.isRevoked) void Promise.resolve().then(refresh).catch((e) => Alert.alert('No se pudo cargar Roles y permisos', e instanceof Error ? e.message : '')); }, [access, ready, refresh]);
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    void listAdminRolePermissions(selected.id).then((value) => { if (alive) { setPermissions(value); setSavedPermissions(value); } }).catch((e) => Alert.alert('No se pudieron leer los permisos', e instanceof Error ? e.message : ''));
    return () => { alive = false; };
  }, [selected]);

  const assignedUsers = useMemo(() => assignments.filter((item) => item.role_id === selected?.id).map((item) => ({ assignment: item, user: users.find((entry) => entry.userId === item.user_id) })).filter((row): row is { assignment: Assignment; user: ManagedUser } => Boolean(row.user)), [assignments, selected?.id, users]);
  const run = async (task: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    try { await task(); after?.(); }
    catch (e) { Alert.alert('No se pudo guardar', e instanceof Error ? e.message : 'Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  };

  const openRole = (role?: AdminRole) => { setEditingRole(role ?? null); setRoleName(role?.name ?? ''); setRoleDescription(role?.description ?? ''); setRoleModal(true); };
  const saveRoleDetails = () => {
    if (!roleName.trim()) return Alert.alert('Falta el nombre', 'Escribe un nombre para este rol.');
    void run(async () => {
      const id = await saveAdminRole(roleName.trim(), roleDescription.trim(), editingRole?.id);
      await refresh();
      const savedRole = { id, name: roleName.trim(), description: roleDescription.trim() };
      setSelected(editingRole ? (current) => current?.id === id ? savedRole : current : savedRole);
      setRoleModal(false);
    });
  };
  const savePermissions = () => void run(() => saveAdminRolePermissions(selected!.id, permissions), () => setSavedPermissions(permissions));
  const addAssignment = () => {
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return Alert.alert('Correo no válido', 'Escribe el correo de una cuenta existente.');
    void run(() => assignAdminRole(value, selected!.id), async () => { setEmail(''); await refresh(); });
  };
  const openOverrides = async (user: ManagedUser) => {
    try {
      const current = await listAdminUserOverrides(user.userId);
      const draft: Record<string, boolean | null> = {};
      ADMIN_PERMISSION_CATALOG.forEach((permission) => { draft[permission.key] = current[permission.key] ?? null; });
      setDraftOverrides(draft); setEditingUser(user);
    } catch (e) { Alert.alert('No se pudieron leer las excepciones', e instanceof Error ? e.message : ''); }
  };
  const effective = (key: string) => (draftOverrides[key] === null || draftOverrides[key] === undefined ? permissions.includes(key) : draftOverrides[key] === true);
  const cycleOverride = (key: string) => setDraftOverrides((old) => {
    const current = old[key] ?? null;
    const next = current === null ? !permissions.includes(key) : current === true ? false : null;
    return { ...old, [key]: next };
  });
  const saveOverrides = () => {
    const explicit = Object.fromEntries(Object.entries(draftOverrides).filter(([, value]) => value !== null)) as Record<string, boolean>;
    void run(() => saveAdminUserOverrides(editingUser!.userId, explicit), () => { setEditingUser(null); });
  };

  if (!ready || !access) return <ActivityIndicator color={C.wine} style={{ marginTop: 40 }} />;
  if (!access.isSuperAdmin || access.isRevoked) return <View style={s.page}><Group><Row icon="lock-closed" label="Solo Super Admin puede administrar roles y permisos." chevron={false} /></Group></View>;

  return <>
    <Stack.Screen options={{ title: 'Roles y permisos', headerRight: () => <Pressable onPress={() => openRole()} hitSlop={12}><Text style={s.add}>＋</Text></Pressable> }} />
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.kicker}>ACCESO CENTRALIZADO</Text>
      <Text style={s.title}>Roles y permisos</Text>
      <Text style={s.copy}>Configura permisos para los seis módulos y asigna cada rol por correo. Los roles iniciales no reciben permisos automáticamente.</Text>
      <Group header="Roles">
        {roles.map((role) => <Row key={role.id} icon="shield-outline" label={role.name} sub={role.description || 'Sin descripción'} value={selected?.id === role.id ? 'Seleccionado' : undefined} onPress={() => setSelected(role)} />)}
      </Group>
      {selected ? <>
        <Group header={`Permisos predeterminados · ${selected.name}`} footer="Los cambios quedan pendientes hasta que pulses Guardar permisos.">
          <Row icon="create-outline" label="Editar nombre y descripción" onPress={() => openRole(selected)} />
          {ADMIN_MODULES.map((module) => <View key={module.key} style={s.module}><Text style={s.moduleTitle}>{module.label}</Text>{module.permissions.map((permission) => {
            const key = `${module.key}.${permission.key}`;
            return <SwitchRow key={key} label={permission.label} value={permissions.includes(key)} onValueChange={(enabled) => setPermissions((current) => enabled ? [...new Set([...current,key])] : current.filter((item) => item !== key))} />;
          })}</View>)}
          <View style={s.actions}><Pressable onPress={() => setPermissions(savedPermissions)} disabled={busy} style={s.secondary}><Text style={s.secondaryText}>Cancelar</Text></Pressable><Pressable onPress={savePermissions} disabled={busy} style={s.primary}><Text style={s.primaryText}>{busy ? 'Guardando…' : 'Guardar permisos'}</Text></Pressable></View>
        </Group>
        <Group header={`Personas asignadas · ${assignedUsers.length}`} footer="Solo se asignan cuentas existentes. Las excepciones personales prevalecen sobre los permisos del rol.">
          <View style={s.assign}><TextInput value={email} onChangeText={setEmail} placeholder="correo@ejemplo.com" autoCapitalize="none" keyboardType="email-address" style={s.input} /><Pressable onPress={addAssignment} disabled={busy} style={s.primary}><Text style={s.primaryText}>Asignar</Text></Pressable></View>
          {assignedUsers.map(({ user }) => <View key={user.userId} style={s.userRow}><View style={{ flex: 1 }}><Text style={s.userEmail}>{user.email}</Text><Text style={s.userSub}>{user.nombre || 'Cuenta de usuario'}</Text></View><Pressable onPress={() => void openOverrides(user)}><Text style={s.inlineAction}>Excepciones</Text></Pressable><Pressable onPress={() => Alert.alert('Revocar asignación', `¿Quitar ${selected.name} de ${user.email}?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Quitar', style: 'destructive', onPress: () => void run(() => removeAdminRoleAssignment(user.userId), () => { if (editingUser?.userId === user.userId) setEditingUser(null); void refresh(); }) }])}><Text style={s.remove}>Quitar</Text></Pressable></View>)}
        </Group>
      </> : <Text style={s.copy}>Selecciona un rol para configurar sus permisos y las personas asignadas.</Text>}
    </ScrollView>
    <Modal visible={roleModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setRoleModal(false)}>
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.title}>{editingRole ? 'Editar rol' : 'Crear rol'}</Text>
        <TextInput value={roleName} onChangeText={setRoleName} placeholder="Nombre del rol" style={s.modalInput} maxLength={80} />
        <TextInput value={roleDescription} onChangeText={setRoleDescription} placeholder="Descripción" style={[s.modalInput,{minHeight:100}]} multiline maxLength={300} />
        <Text style={s.copy}>Crear o renombrar un rol no le asigna permisos. Se configuran por separado.</Text>
        <View style={s.actions}><Pressable onPress={() => setRoleModal(false)} style={s.secondary}><Text style={s.secondaryText}>Cancelar</Text></Pressable><Pressable onPress={saveRoleDetails} disabled={busy} style={s.primary}><Text style={s.primaryText}>Guardar</Text></Pressable></View>
      </ScrollView>
    </Modal>
    <Modal visible={!!editingUser} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingUser(null)}>
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.kicker}>EXCEPCIONES INDIVIDUALES</Text><Text style={s.title}>{editingUser?.email}</Text><Text style={s.copy}>Toca cada permiso para alternar: Heredar → Permitir → Denegar.</Text>
        {ADMIN_MODULES.map((module) => <Group key={module.key} header={module.label}>{module.permissions.map((permission) => {
          const key = `${module.key}.${permission.key}`; const value = draftOverrides[key] ?? null;
          const state = value === null ? 'Heredar' : value ? 'Permitir' : 'Denegar';
          return <Pressable key={key} style={s.overrideRow} onPress={() => cycleOverride(key)}><View style={{flex:1}}><Text style={s.userEmail}>{permission.label}</Text><Text style={s.userSub}>Efectivo: {effective(key) ? 'Permitido' : 'Sin acceso'}</Text></View><View style={[s.statePill,value===true&&s.stateAllow,value===false&&s.stateDeny]}><Text style={[s.overrideState,value===true&&{color:'#2e7d4f'},value===false&&{color:C.live}]}>{state}</Text></View></Pressable>;
        })}</Group>)}
        <View style={s.actions}><Pressable onPress={() => setEditingUser(null)} style={s.secondary}><Text style={s.secondaryText}>Cancelar</Text></Pressable><Pressable onPress={saveOverrides} disabled={busy} style={s.primary}><Text style={s.primaryText}>{busy ? 'Guardando…' : 'Guardar cambios'}</Text></Pressable></View>
      </ScrollView>
    </Modal>
  </>;
}

const s = StyleSheet.create({ page:{padding:18,paddingBottom:48,backgroundColor:C.bg}, kicker:{fontFamily:sans,fontSize:12,fontWeight:'700',letterSpacing:2,color:C.wine,marginTop:12}, title:{fontFamily:sans,fontSize:28,fontWeight:'700',color:C.ink,marginTop:8}, copy:{fontFamily:sans,fontSize:15,lineHeight:22,color:C.muted,marginTop:8,marginBottom:12}, add:{fontSize:30,color:C.wine,paddingHorizontal:8}, module:{paddingHorizontal:14,paddingTop:14}, moduleTitle:{fontFamily:sans,fontSize:16,fontWeight:'700',color:C.ink,marginBottom:4}, actions:{flexDirection:'row',justifyContent:'flex-end',gap:10,padding:12}, primary:{borderRadius:14,backgroundColor:C.wine,paddingHorizontal:18,paddingVertical:13,alignItems:'center',justifyContent:'center'}, primaryText:{fontFamily:sans,fontSize:14,fontWeight:'700',color:'#fff'}, secondary:{borderRadius:14,backgroundColor:C.fill,paddingHorizontal:18,paddingVertical:13,alignItems:'center',justifyContent:'center'}, secondaryText:{fontFamily:sans,fontSize:14,fontWeight:'600',color:C.wine}, assign:{flexDirection:'row',gap:8,padding:12}, input:{flex:1,minWidth:0,borderWidth:1,borderColor:C.line,borderRadius:14,paddingHorizontal:14,fontFamily:sans,fontSize:15,color:C.ink,backgroundColor:'#fff'}, userRow:{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:14,paddingVertical:14,borderTopWidth:StyleSheet.hairlineWidth,borderColor:C.line}, userEmail:{fontFamily:sans,fontWeight:'600',fontSize:14,color:C.ink}, userSub:{fontFamily:sans,fontSize:12,color:C.muted,marginTop:3}, inlineAction:{fontFamily:sans,fontSize:12,fontWeight:'700',color:C.wine}, remove:{fontFamily:sans,fontSize:12,fontWeight:'700',color:C.live}, modalInput:{backgroundColor:'#fff',borderWidth:1,borderColor:C.line,borderRadius:16,padding:15,fontFamily:sans,fontSize:16,color:C.ink,marginTop:14}, overrideRow:{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:14,paddingVertical:14}, overrideState:{fontFamily:sans,fontSize:13,fontWeight:'700',color:C.muted}, statePill:{minWidth:84,alignItems:'center',paddingHorizontal:12,paddingVertical:6,borderRadius:999,backgroundColor:C.fill}, stateAllow:{backgroundColor:'rgba(46,125,79,0.12)'}, stateDeny:{backgroundColor:'rgba(214,69,69,0.12)'} });
