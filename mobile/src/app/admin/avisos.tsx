import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Group, Row } from '@/components/form';
import { tapFeedback } from '@/components/ui';
import { C, sans } from '@/constants/theme';
import { canAdmin } from '@/lib/admin';
import { supabase } from '@/lib/supabase';
import { useAdmin } from '@/lib/use-admin';

const TARGETS = [
  { value: '', label: 'Todas' },
  { value: 'Europa', label: 'Europa' },
  { value: 'Estados Unidos', label: 'Estados Unidos' },
  { value: 'República Dominicana', label: 'Rep. Dominicana' },
];

type Sent = { id: number; titulo: string; mensaje: string; comunidad: string | null; enviados: number; created_at: string };

export default function Avisos() {
  const { access } = useAdmin();
  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [target, setTarget] = useState('');
  const [reach, setReach] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Sent[]>([]);
  const allowed = canAdmin(access,'notices','view');
  const canSend = canAdmin(access,'notices','send');

  const loadHistory = useCallback(async () => {
    const { data } = await supabase.from('push_broadcasts').select('id,titulo,mensaje,comunidad,enviados,created_at').order('created_at', { ascending: false }).limit(10);
    setHistory((data ?? []) as Sent[]);
  }, []);

  useEffect(() => {
    // The reach preview only needs module access (the server checks notices.view for dryRun).
    if (!allowed) return;
    let alive = true;
    void supabase.functions.invoke('send-broadcast', { body: { titulo: 'x', mensaje: 'x', comunidad: target || null, dryRun: true } })
      .then(({ data }) => { if (alive) setReach(typeof data?.destinatarios === 'number' ? data.destinatarios : null); });
    return () => { alive = false; };
  }, [allowed, target]);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    void supabase.from('push_broadcasts').select('id,titulo,mensaje,comunidad,enviados,created_at').order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => { if (alive) setHistory((data ?? []) as Sent[]); });
    return () => { alive = false; };
  }, [allowed]);

  if (!allowed) return <ScrollView contentContainerStyle={s.page}><Group footer="Tu cuenta no tiene acceso a este módulo."><Row icon="lock-closed" label="Sin acceso" chevron={false} /></Group></ScrollView>;

  // Only the history entry is removed: phones that received the notice keep it.
  const removeFromHistory = (h: Sent) => Alert.alert(h.titulo, 'Un aviso enviado no se puede editar ni retirar de los teléfonos que ya lo recibieron. ¿Quieres eliminarlo del historial?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar del historial', style: 'destructive', onPress: async () => {
      const { error } = await supabase.from('push_broadcasts').delete().eq('id', h.id);
      if (error) return Alert.alert('No se pudo eliminar', error.message);
      tapFeedback();
      void loadHistory();
    } },
  ]);

  const send = () => {
    if (titulo.trim().length < 3 || mensaje.trim().length < 3) return Alert.alert('Completa el aviso', 'Escribe un título y un mensaje.');
    const who = target ? `la comunidad de ${target}` : 'todas las personas con la app';
    Alert.alert('Enviar aviso', `Se enviará a ${who}${reach !== null ? ` (${reach} ${reach === 1 ? 'dispositivo' : 'dispositivos'})` : ''}. ¿Continuar?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Enviar', onPress: async () => {
        setBusy(true);
        const { data, error } = await supabase.functions.invoke('send-broadcast', { body: { titulo: titulo.trim(), mensaje: mensaje.trim(), comunidad: target || null } });
        setBusy(false);
        if (error || !data?.ok) return Alert.alert('No se pudo enviar', data?.error || error?.message || 'Inténtalo de nuevo.');
        tapFeedback();
        Alert.alert('Aviso enviado', `Entregado a ${data.enviados} ${data.enviados === 1 ? 'dispositivo' : 'dispositivos'}.`);
        setTitulo(''); setMensaje('');
        void loadHistory();
      } },
    ]);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        {canSend ? <Text style={s.intro}>Envía una notificación al teléfono de la comunidad. Úsalo para avisos importantes: cambios de horario, eventos especiales o mensajes urgentes.</Text>
          : <Group footer="Puedes consultar los avisos enviados. Para enviar avisos necesitas el permiso «Enviar avisos»."><Row icon="eye-outline" label="Acceso de solo lectura" chevron={false} /></Group>}

        {canSend ? <>

        <Text style={s.label}>Para</Text>
        <View style={s.targets}>
          {TARGETS.map((t) => (
            <Pressable key={t.value} onPress={() => { tapFeedback(); setTarget(t.value); }} style={[s.target, target === t.value && s.targetOn]}>
              <Text style={[s.targetText, target === t.value && { color: '#fff' }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.reach}>{reach === null ? 'Calculando destinatarios…' : `${reach} ${reach === 1 ? 'dispositivo recibirá' : 'dispositivos recibirán'} el aviso`}{target ? ' (según la comunidad elegida en la app o, si no eligieron, la zona horaria del teléfono)' : ''}</Text>

        <Text style={s.label}>Título</Text>
        <TextInput value={titulo} onChangeText={setTitulo} maxLength={80} placeholder="Ej. Cambio de horario hoy" placeholderTextColor="#a58e88" style={s.input} />
        <Text style={s.label}>Mensaje</Text>
        <TextInput value={mensaje} onChangeText={setMensaje} maxLength={240} multiline placeholder="Ej. La oración de esta noche empieza a las 20:30." placeholderTextColor="#a58e88" style={[s.input, { minHeight: 100 }]} textAlignVertical="top" />
        <Text style={s.counter}>{mensaje.length}/240</Text>

        <View style={s.preview}>
          <View style={s.previewIcon}><Ionicons name="flower-outline" size={18} color={C.wine} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.previewApp}>MCP930 · ahora</Text>
            <Text style={s.previewTitle} numberOfLines={1}>{titulo || 'Título del aviso'}</Text>
            <Text style={s.previewBody} numberOfLines={3}>{mensaje || 'Así verán el aviso en su teléfono.'}</Text>
          </View>
        </View>

        <Pressable accessibilityRole="button" disabled={busy} onPress={send} style={({ pressed }) => [s.send, (busy || pressed) && { opacity: 0.85 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="paper-plane" size={18} color="#fff" /><Text style={s.sendText}>Enviar aviso</Text></>}
        </Pressable>
        </> : null}

        {history.length ? (
          <Group header="Enviados recientemente" footer={canSend ? 'Toca un aviso para eliminarlo del historial.' : undefined}>
            {history.map((h) => (
              <Row key={h.id} icon="paper-plane-outline" label={h.titulo}
                sub={`${new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(h.created_at)).replace('.', '')} · ${h.comunidad || 'Todas'} · ${h.enviados} entregados`}
                onPress={canSend ? () => removeFromHistory(h) : undefined} chevron={false} />
            ))}
          </Group>
        ) : !canSend ? <Text style={s.reach}>Todavía no se han enviado avisos.</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, paddingBottom: 60 },
  intro: { fontFamily: sans, fontSize: 14, lineHeight: 20, color: C.muted },
  label: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.muted, marginTop: 20, marginBottom: 8, marginLeft: 4 },
  targets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  target: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  targetOn: { backgroundColor: C.wine, borderColor: C.wine },
  targetText: { fontFamily: sans, fontSize: 14, fontWeight: '600', color: C.ink },
  reach: { fontFamily: sans, fontSize: 12, color: C.muted, marginTop: 8, marginLeft: 4 },
  input: { minHeight: 48, borderRadius: 14, backgroundColor: C.card, paddingHorizontal: 14, paddingVertical: 12, fontFamily: sans, fontSize: 16, color: C.ink },
  counter: { fontFamily: sans, fontSize: 11, color: C.muted, textAlign: 'right', marginTop: 4 },
  preview: { flexDirection: 'row', gap: 12, marginTop: 18, padding: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.92)', boxShadow: '0 8px 24px rgba(63,38,35,0.1)' },
  previewIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  previewApp: { fontFamily: sans, fontSize: 11, color: C.muted },
  previewTitle: { fontFamily: sans, fontSize: 15, fontWeight: '700', color: C.ink, marginTop: 2 },
  previewBody: { fontFamily: sans, fontSize: 14, color: C.ink, marginTop: 1 },
  send: { marginTop: 20, minHeight: 52, borderRadius: 16, backgroundColor: C.wine, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sendText: { fontFamily: sans, fontSize: 16, fontWeight: '700', color: '#fff' },
});
