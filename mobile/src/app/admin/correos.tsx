import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';

import { FieldRow, Group, InputRow, Row } from '@/components/form';
import { tapFeedback, useAsync } from '@/components/ui';
import { C, sans } from '@/constants/theme';
import {
  addRecipient, COMMUNITIES, listRecipients, removeRecipient, setRecipientActive, type Recipient, type RecipientForm,
} from '@/lib/recipients';
import { useAdmin } from '@/lib/use-admin';

type Target = { form: RecipientForm; comunidad: string | null };

const SECTIONS: { key: string; target: Target; header: string; footer: string; icon: keyof typeof Ionicons.glyphMap; tint: string }[] = [
  { key: 'contact', target: { form: 'contact', comunidad: null }, header: 'Formulario de contacto', footer: 'Reciben los mensajes y las peticiones de oración.', icon: 'mail', tint: C.wine },
  { key: 'join-all', target: { form: 'join', comunidad: null }, header: 'Únete · Todas las comunidades', footer: 'Reciben todos los registros, sin importar la comunidad elegida.', icon: 'people', tint: '#6b5b95' },
  ...COMMUNITIES.map((c) => ({
    key: `join-${c}`,
    target: { form: 'join' as const, comunidad: c },
    header: `Únete · ${c}`,
    footer: `Reciben solo los registros de quienes eligen ${c}.`,
    icon: (c === 'Europa' ? 'earth' : c === 'Estados Unidos' ? 'flag' : 'sunny') as keyof typeof Ionicons.glyphMap,
    tint: c === 'Europa' ? '#2f6db5' : c === 'Estados Unidos' ? '#b5523b' : '#c08a3e',
  })),
];

const sameTarget = (r: Recipient, t: Target) => r.form === t.form && (r.comunidad ?? null) === t.comunidad;

function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.segment}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { tapFeedback(); onChange(o.value); }} style={[s.segmentItem, on && s.segmentOn]}>
            <Text style={[s.segmentText, on && { color: C.ink }]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AddSheet({ initial, onClose, onSaved }: { initial: Target; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<RecipientForm>(initial.form);
  const [comunidad, setComunidad] = useState<string>(initial.comunidad ?? 'all');
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await addRecipient({ form, comunidad: comunidad === 'all' ? null : comunidad, email, nombre });
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert('No se pudo añadir', e instanceof Error ? e.message : '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={s.sheetBar}>
          <Pressable hitSlop={10} onPress={onClose} style={{ width: 80 }}><Text style={s.cancel}>Cancelar</Text></Pressable>
          <Text style={s.sheetTitle}>Nuevo destinatario</Text>
          <Pressable hitSlop={10} disabled={busy || !email.trim()} onPress={save} style={{ width: 80, alignItems: 'flex-end' }}>
            {busy ? <ActivityIndicator color={C.wine} /> : <Text style={[s.done, !email.trim() && { opacity: 0.4 }]}>Añadir</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
          <Group>
            <InputRow label="Correo" value={email} onChangeText={setEmail} placeholder="nombre@correo.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" autoFocus />
            <InputRow label="Nombre (opcional)" value={nombre} onChangeText={setNombre} placeholder="Ej: Ana Pérez" />
          </Group>
          <Group header="Formulario">
            <FieldRow label="Recibirá los correos de">
              <Segmented options={[{ value: 'contact', label: 'Contacto' }, { value: 'join', label: 'Únete' }]} value={form} onChange={setForm} />
            </FieldRow>
          </Group>
          {form === 'join' ? (
            <Group header="Comunidad" footer="Elige «Todas» para recibir cada registro, o una comunidad para recibir solo los de esa comunidad.">
              {[{ value: 'all', label: 'Todas las comunidades' }, ...COMMUNITIES.map((c) => ({ value: c, label: c }))].map((o) => (
                <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: comunidad === o.value }} onPress={() => { tapFeedback(); setComunidad(o.value); }} style={s.radioRow}>
                  <Text style={s.radioLabel}>{o.label}</Text>
                  {comunidad === o.value ? <Ionicons name="checkmark" size={20} color={C.wine} /> : null}
                </Pressable>
              ))}
            </Group>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function RecipientRow({ r, onChanged }: { r: Recipient; onChanged: () => Promise<void> }) {
  // Optimistic value while the update is in flight; falls back to the server value.
  const [pending, setPending] = useState<boolean | null>(null);
  const active = pending ?? r.active;

  const toggle = async (value: boolean) => {
    setPending(value);
    try { await setRecipientActive(r.id, value); await onChanged(); }
    catch (e) { Alert.alert('No se pudo actualizar', e instanceof Error ? e.message : ''); }
    finally { setPending(null); }
  };

  const remove = () => Alert.alert('Quitar destinatario', `${r.email} dejará de recibir estos correos.`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Quitar', style: 'destructive', onPress: async () => {
      try { await removeRecipient(r.id); await onChanged(); }
      catch (e) { Alert.alert('No se pudo quitar', e instanceof Error ? e.message : ''); }
    } },
  ]);

  return (
    <View style={[s.row, !active && { opacity: 0.55 }]}>
      <View style={s.avatar}><Text style={s.avatarText}>{(r.nombre || r.email).slice(0, 1).toUpperCase()}</Text></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.email} numberOfLines={1}>{r.email}</Text>
        <Text style={s.sub} numberOfLines={1}>{r.nombre || (active ? 'Activo' : 'En pausa')}</Text>
      </View>
      <Switch value={active} onValueChange={toggle} trackColor={{ true: C.wine, false: '#e5dcda' }} thumbColor="#fff" ios_backgroundColor="#e5dcda" accessibilityLabel={`Activo ${r.email}`} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${r.email}`} hitSlop={8} onPress={remove} style={s.trash}>
        <Ionicons name="trash-outline" size={19} color={C.live} />
      </Pressable>
    </View>
  );
}

export default function Correos() {
  const { access } = useAdmin();
  const { data: items, error, reload: load } = useAsync(listRecipients);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState<Target | null>(null);

  if (!access?.isSuperAdmin) {
    return <ScrollView contentContainerStyle={s.page}><Group footer="Solo el Super Admin puede definir quién recibe los correos."><Row icon="lock-closed" label="Sin acceso" chevron={false} /></Group></ScrollView>;
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={s.page}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.wine} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <View style={s.hero}>
          <View style={s.heroIcon}><Ionicons name="mail-unread" size={26} color="#fff" /></View>
          <Text style={s.heroTitle}>¿Quién recibe los formularios?</Text>
          <Text style={s.heroCopy}>Define los correos que reciben los mensajes de contacto y los registros de Únete, por comunidad.</Text>
        </View>

        {error ? <Group footer={error}><Row icon="refresh" label="Reintentar" onPress={() => void load()} /></Group> : null}
        {!items && !error ? <ActivityIndicator color={C.wine} style={{ marginTop: 30 }} /> : null}

        {items ? SECTIONS.map((section) => {
          const list = items.filter((r) => sameTarget(r, section.target));
          return (
            <Group key={section.key} header={section.header} footer={list.length ? section.footer : `${section.footer} Si está vacío, se envía al correo principal.`}>
              {list.map((r) => <RecipientRow key={r.id} r={r} onChanged={load} />)}
              <Row icon="add" tint={section.tint} label="Añadir correo" onPress={() => setAdding(section.target)} />
            </Group>
          );
        }) : null}
      </ScrollView>
      {adding ? <AddSheet initial={adding} onClose={() => setAdding(null)} onSaved={() => void load()} /> : null}
    </>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, paddingBottom: 60 },
  hero: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  heroIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center', marginBottom: 12, boxShadow: '0 10px 24px rgba(166,75,67,0.24)' },
  heroTitle: { fontFamily: sans, fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: C.ink, textAlign: 'center' },
  heroCopy: { fontFamily: sans, fontSize: 15, lineHeight: 21, color: C.muted, textAlign: 'center', marginTop: 6, paddingHorizontal: 12 },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: sans, fontSize: 15, fontWeight: '700', color: C.wine },
  email: { fontFamily: sans, fontSize: 16, color: C.ink, letterSpacing: -0.2 },
  sub: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 2 },
  trash: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  sheetBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  sheetTitle: { fontFamily: sans, fontSize: 17, fontWeight: '600', color: C.ink },
  cancel: { fontFamily: sans, fontSize: 17, color: C.wine },
  done: { fontFamily: sans, fontSize: 17, fontWeight: '700', color: C.wine },
  segment: { flexDirection: 'row', backgroundColor: C.fill, borderRadius: 10, padding: 2 },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentOn: { backgroundColor: '#fff', boxShadow: '0 1px 4px rgba(63,38,35,0.14)' },
  segmentText: { fontFamily: sans, fontSize: 14, fontWeight: '600', color: C.muted },
  radioRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  radioLabel: { fontFamily: sans, fontSize: 16, color: C.ink },
});
