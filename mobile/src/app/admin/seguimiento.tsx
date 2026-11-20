import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Group, Row } from '@/components/form';
import { tapFeedback } from '@/components/ui';
import { C, sans } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { canAdmin } from '@/lib/admin';
import { useAdmin } from '@/lib/use-admin';
import { SheetModal } from '@/components/sheet-modal';

type Estado = 'nueva' | 'contactada' | 'integrada' | 'sin_respuesta';
type Persona = {
  id: string; nombre: string; apellido: string; email: string | null; telefono: string | null;
  comunidad: string | null; pais_residencia: string | null; created_at: string;
  estado_seguimiento: Estado; contactada_por: string | null; notas_seguimiento: string | null; seguimiento_at: string | null;
};

const ESTADOS: { key: Estado; label: string; color: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'nueva', label: 'Nuevas', color: '#d64545', icon: 'sparkles' },
  { key: 'contactada', label: 'Contactadas', color: '#c08a3e', icon: 'call' },
  { key: 'integrada', label: 'Integradas', color: '#2f7d4f', icon: 'heart' },
  { key: 'sin_respuesta', label: 'Sin respuesta', color: '#8e8187', icon: 'help-circle' },
];
const ESTADO_LABEL: Record<Estado, string> = { nueva: 'Nueva', contactada: 'Contactada', integrada: 'Integrada', sin_respuesta: 'Sin respuesta' };

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)).replace('.', '');
};

function FollowSheet({ persona, me, onClose, onSaved }: { persona: Persona; me: string; onClose: () => void; onSaved: () => void }) {
  const [estado, setEstado] = useState<Estado>(persona.estado_seguimiento === 'nueva' ? 'contactada' : persona.estado_seguimiento);
  const [quien, setQuien] = useState(persona.contactada_por || me);
  const [notas, setNotas] = useState(persona.notas_seguimiento || '');
  const [busy, setBusy] = useState(false);
  const phone = persona.telefono?.replace(/[^+\d]/g, '') || '';

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('set_member_followup', { p_id: persona.id, p_estado: estado, p_contactada_por: quien, p_notas: notas });
    setBusy(false);
    if (error) return Alert.alert('No se pudo guardar', error.message);
    tapFeedback();
    onSaved();
    onClose();
  };

  return (
    <SheetModal visible onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={s.bar}>
          <Pressable hitSlop={10} onPress={onClose} style={{ width: 80 }}><Text style={s.cancel}>Cancelar</Text></Pressable>
          <Text style={s.barTitle}>Seguimiento</Text>
          <Pressable hitSlop={10} disabled={busy} onPress={() => void save()} style={{ width: 80, alignItems: 'flex-end' }}>
            {busy ? <ActivityIndicator color={C.wine} /> : <Text style={s.done}>Guardar</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
          <Text style={s.name}>{`${persona.nombre} ${persona.apellido}`.trim()}</Text>
          <Text style={s.meta}>{[persona.comunidad, persona.pais_residencia].filter(Boolean).join(' · ')} · se registró {ago(persona.created_at)}</Text>

          <View style={s.contactRow}>
            {phone ? <Pressable onPress={() => Linking.openURL(`tel:${phone}`)} style={s.contactBtn}><Ionicons name="call" size={18} color={C.wine} /><Text style={s.contactText}>Llamar</Text></Pressable> : null}
            {phone ? <Pressable onPress={() => Linking.openURL(`https://wa.me/${phone.replace(/\D/g, '')}`)} style={s.contactBtn}><Ionicons name="logo-whatsapp" size={18} color="#25a35a" /><Text style={s.contactText}>WhatsApp</Text></Pressable> : null}
            {persona.email ? <Pressable onPress={() => Linking.openURL(`mailto:${persona.email}`)} style={s.contactBtn}><Ionicons name="mail" size={18} color={C.wine} /><Text style={s.contactText}>Correo</Text></Pressable> : null}
          </View>

          <Text style={s.label}>Estado</Text>
          <View style={s.states}>
            {ESTADOS.map((e) => (
              <Pressable key={e.key} onPress={() => { tapFeedback(); setEstado(e.key); }} style={[s.stateBtn, estado === e.key && { backgroundColor: e.color, borderColor: e.color }]}>
                <Ionicons name={e.icon} size={14} color={estado === e.key ? '#fff' : e.color} />
                <Text style={[s.stateText, estado === e.key && { color: '#fff' }]}>{ESTADO_LABEL[e.key]}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.label}>Contactada por</Text>
          <TextInput value={quien} onChangeText={setQuien} placeholder="Nombre de quien la contactó" placeholderTextColor="#a58e88" style={s.input} />
          <Text style={s.label}>Notas</Text>
          <TextInput value={notas} onChangeText={setNotas} multiline placeholder="Ej. Le encantaría unirse a la oración de la mañana." placeholderTextColor="#a58e88" style={[s.input, { minHeight: 110 }]} textAlignVertical="top" />
          {persona.seguimiento_at ? <Text style={s.hint}>Última actualización {ago(persona.seguimiento_at)}.</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SheetModal>
  );
}

export default function Seguimiento() {
  const { access } = useAdmin();
  const [list, setList] = useState<Persona[] | null>(null);
  const [tab, setTab] = useState<Estado>('nueva');
  const [open, setOpen] = useState<Persona | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const allowed = canAdmin(access, 'dashboard', 'followup');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('unirse')
      .select('id,nombre,apellido,email,telefono,comunidad,pais_residencia,created_at,estado_seguimiento,contactada_por,notas_seguimiento,seguimiento_at')
      .order('created_at', { ascending: false });
    if (error) { Alert.alert('No se pudo cargar', error.message); setList([]); return; }
    setList((data ?? []).map((p) => ({ ...p, id: String(p.id), estado_seguimiento: (p.estado_seguimiento || 'nueva') as Estado })) as Persona[]);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    void supabase.from('unirse')
      .select('id,nombre,apellido,email,telefono,comunidad,pais_residencia,created_at,estado_seguimiento,contactada_por,notas_seguimiento,seguimiento_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (alive) setList((data ?? []).map((p) => ({ ...p, id: String(p.id), estado_seguimiento: (p.estado_seguimiento || 'nueva') as Estado })) as Persona[]); });
    return () => { alive = false; };
  }, [allowed]);

  if (!allowed) return <ScrollView contentContainerStyle={s.page}><Group footer="Disponible para Super Admin y Manager."><Row icon="lock-closed" label="Sin acceso" chevron={false} /></Group></ScrollView>;

  const counts = Object.fromEntries(ESTADOS.map((e) => [e.key, (list ?? []).filter((p) => p.estado_seguimiento === e.key).length])) as Record<Estado, number>;
  const current = (list ?? []).filter((p) => p.estado_seguimiento === tab);
  const color = ESTADOS.find((e) => e.key === tab)!.color;

  return (
    <>
      <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.wine} colors={[C.wine]} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <Text style={s.intro}>Que ninguna nueva hermana se quede sin respuesta. Marca a quién ya contactaste y cómo va.</Text>
        <View style={s.tabs}>
          {ESTADOS.map((e) => (
            <Pressable key={e.key} onPress={() => { tapFeedback(); setTab(e.key); }} style={[s.tab, tab === e.key && { borderColor: e.color, backgroundColor: '#fff' }]}>
              <Text style={[s.tabCount, { color: e.color }]}>{counts[e.key]}</Text>
              <Text style={s.tabLabel} numberOfLines={2}>{e.label}</Text>
            </Pressable>
          ))}
        </View>
        {!list ? <ActivityIndicator color={C.wine} style={{ marginTop: 30 }} /> : null}
        {list && !current.length ? <Text style={s.empty}>{tab === 'nueva' ? '¡Todas las nuevas ya fueron contactadas!' : 'No hay personas en este estado.'}</Text> : null}
        <View style={{ gap: 10, marginTop: 14 }}>
          {current.map((p) => (
            <Pressable key={p.id} onPress={() => { tapFeedback(); setOpen(p); }} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}>
              <View style={[s.dot, { backgroundColor: color }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.cardName} numberOfLines={1}>{`${p.nombre} ${p.apellido}`.trim()}</Text>
                <Text style={s.cardMeta} numberOfLines={1}>{p.comunidad || 'Sin comunidad'} · {ago(p.created_at)}</Text>
                {p.contactada_por ? <Text style={s.cardBy} numberOfLines={1}>Contactada por {p.contactada_por}</Text> : null}
                {p.notas_seguimiento ? <Text style={s.cardNote} numberOfLines={2}>{p.notas_seguimiento}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={17} color="rgba(60,40,38,0.3)" />
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {open ? <FollowSheet persona={open} me={access?.nombre || access?.email || ''} onClose={() => setOpen(null)} onSaved={() => void load()} /> : null}
    </>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, paddingBottom: 60 },
  intro: { fontFamily: sans, fontSize: 14, lineHeight: 20, color: C.muted },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 14 },
  tab: { flex: 1, paddingVertical: 10, paddingHorizontal: 2, borderRadius: 14, alignItems: 'center', backgroundColor: C.card, borderWidth: 1.5, borderColor: 'transparent' },
  tabCount: { fontFamily: sans, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tabLabel: { fontFamily: sans, fontSize: 11, lineHeight: 13, fontWeight: '600', color: C.muted, marginTop: 1, textAlign: 'center' },
  empty: { fontFamily: sans, fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 30 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: C.card },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardName: { fontFamily: sans, fontSize: 16, fontWeight: '600', color: C.ink },
  cardMeta: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 1 },
  cardBy: { fontFamily: sans, fontSize: 12, fontWeight: '600', color: C.wine, marginTop: 3 },
  cardNote: { fontFamily: sans, fontSize: 13, color: C.ink, marginTop: 3 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  barTitle: { fontFamily: sans, fontSize: 17, fontWeight: '600', color: C.ink },
  cancel: { fontFamily: sans, fontSize: 17, color: C.wine },
  done: { fontFamily: sans, fontSize: 17, fontWeight: '700', color: C.wine },
  name: { fontFamily: sans, fontSize: 24, fontWeight: '700', letterSpacing: -0.5, color: C.ink },
  meta: { fontFamily: sans, fontSize: 14, color: C.muted, marginTop: 3 },
  contactRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  contactBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: 14, backgroundColor: C.card },
  contactText: { fontFamily: sans, fontSize: 12, fontWeight: '600', color: C.ink },
  label: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.muted, marginTop: 20, marginBottom: 8, marginLeft: 4 },
  states: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.card },
  stateText: { fontFamily: sans, fontSize: 14, fontWeight: '600', color: C.ink },
  input: { minHeight: 48, borderRadius: 14, backgroundColor: C.card, paddingHorizontal: 14, paddingVertical: 12, fontFamily: sans, fontSize: 16, color: C.ink },
  hint: { fontFamily: sans, fontSize: 12, color: C.muted, marginTop: 10, marginLeft: 4 },
});
