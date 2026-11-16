import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chips, FieldRow, Group, InputRow, Row, SwitchRow } from '@/components/form';
import { EventArtwork, meetingPlatform } from '@/components/meeting-card';
import { tapFeedback } from '@/components/ui';
import { AdminLogin } from '@/components/admin-login';
import { WheelPicker } from '@/components/wheel-picker';
import { C, sans } from '@/constants/theme';
import { buildSchedule, deleteEvento, type AdminEvento, EVENT_TIMEZONES, listEventos, parseScheduleForEdit, saveEvento, uploadImage, WEEK_DAYS } from '@/lib/admin';
import { useAdmin } from '@/lib/use-admin';

const LETTERS: Record<string, string> = { Lunes: 'L', Martes: 'M', 'Miércoles': 'X', Jueves: 'J', Viernes: 'V', 'Sábado': 'S', Domingo: 'D' };
const PRESETS: { label: string; days: string[] }[] = [
  { label: 'Lunes a Viernes', days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'] },
  { label: 'Fin de semana', days: ['Sábado', 'Domingo'] },
  { label: 'Todos los días', days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] },
];
const fmtAudit = (iso?: string | null) => iso
  ? new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace('.', '')
  : null;

/** Start time expressed in the phone's time zone (for "Tu hora local"). */
function localTimeLabel(hour: number, minute: number, zone: string) {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(now);
    const off = parts.find((p) => p.type === 'timeZoneName')?.value.replace('GMT', '') || '+0';
    const [h, m] = off.split(':').map(Number);
    const zoneOffset = (Number.isFinite(h) ? h : 0) * 60 + (off.startsWith('-') ? -(m || 0) : (m || 0));
    const localOffset = -now.getTimezoneOffset();
    let total = hour * 60 + minute - zoneOffset + localOffset;
    total = ((total % 1440) + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: String(h).padStart(2, '0') }));
const MINUTES = ['00', '15', '30', '45'].map((m) => ({ value: m, label: m }));
// Values remain stable because existing events store the selected emoji.
const ICONS = [
  '🙏', '📖', '✝️', '🌅', '🌇', '⛪', '💬', '👧', '❤️', '✨',
  '🕊️', '🎵', '🎤', '🎧', '🙌', '🛐', '📿', '🫶', '🤍', '🌿',
  '🌸', '🌻', '☀️', '🌙', '⭐', '🔥', '💡', '🧡', '👥', '🤝',
  '👩‍👩‍👧', '🧒', '🏠', '🌍', '📅', '🎉', '🗣️', '💭', '📝', '🔔',
  'ion:calendar-outline', 'ion:people-outline', 'ion:book-outline', 'ion:heart-outline',
  'ion:hand-left-outline', 'ion:business-outline', 'ion:chatbubble-ellipses-outline',
  'ion:musical-notes-outline', 'ion:mic-outline', 'ion:headset-outline', 'ion:sparkles-outline',
  'ion:leaf-outline', 'ion:flower-outline', 'ion:sunny-outline', 'ion:moon-outline',
  'ion:star-outline', 'ion:flame-outline', 'ion:home-outline', 'ion:globe-outline',
  'ion:notifications-outline', 'ion:camera-outline', 'ion:videocam-outline', 'ion:gift-outline',
];

export default function AdminEventoScreen() {
  const { access, ready } = useAdmin();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = typeof id === 'string' && id.length > 0;
  const [loaded, setLoaded] = useState(!editing);
  const [saving, setSaving] = useState(false);

  const [titulo, setTitulo] = useState('');
  const [icono, setIcono] = useState('🙏');
  const [days, setDays] = useState<string[]>(['Martes']);
  const [hour, setHour] = useState('19');
  const [minute, setMinute] = useState('00');
  const [zona, setZona] = useState('Europe/Luxembourg');
  const [link, setLink] = useState('');
  const [activa, setActiva] = useState(true);
  const [notificar, setNotificar] = useState(true);
  const [orden, setOrden] = useState('1');
  const [audit, setAudit] = useState<AdminEvento | null>(null);
  const [pickedIcon, setPickedIcon] = useState<{ uri: string; width: number; height: number } | null>(null);

  useEffect(() => {
    if (!editing || !access?.isSuperAdmin || access.isRevoked) return;
    listEventos().then((rows) => {
      const e = rows.find((r) => r.id === id);
      if (!e) return;
      const sched = parseScheduleForEdit(e.horario);
      setTitulo(e.titulo.trim());
      setIcono(e.icono || '✦');
      setDays(sched.days.length ? sched.days : ['Martes']);
      setHour(String(sched.hour));
      setMinute(String(sched.minute).padStart(2, '0'));
      setZona(e.zona_horaria || 'Europe/Luxembourg');
      setLink(e.link || '');
      setActiva(e.activa);
      setNotificar(e.notificar !== false);
      setOrden(String(e.orden || 1));
      setAudit(e);
    }).catch(() => {}).finally(() => setLoaded(true));
  }, [access, editing, id]);

  const preview = useMemo(() => (days.length ? buildSchedule(days, Number(hour), Number(minute)) : ''), [days, hour, minute]);
  const platform = meetingPlatform(/^https?:\/\//i.test(link.trim()) ? link.trim() : null);
  const isImageIcon = /^https?:\/\//.test(icono);

  const chooseIcon = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Permite el acceso a Fotos', 'Necesitamos permiso para elegir el icono del evento.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled) return;
    const image = result.assets[0];
    setPickedIcon({ uri: image.uri, width: image.width, height: image.height });
  };

  const save = async () => {
    const url = link.trim();
    if (titulo.trim().length < 3) return Alert.alert('Falta el nombre', 'Escribe el nombre de la reunión.');
    if (!days.length) return Alert.alert('Elige los días', 'Selecciona al menos un día de la semana.');
    if (url && !/^https:\/\/\S+\.\S+/i.test(url)) return Alert.alert('Enlace no válido', 'Pega el enlace completo, empezando por https://');
    setSaving(true);
    try {
      const icon = pickedIcon ? await uploadImage(pickedIcon.uri, pickedIcon, 'eventos') : icono;
      await saveEvento({
        titulo: titulo.trim(),
        icono: icon,
        horario: preview,
        link: url,
        orden: Math.max(1, Number(orden) || 1),
        activa,
        zona_horaria: zona,
        notificar,
      }, editing ? id : undefined);
      tapFeedback();
      router.back();
    } catch (e) {
      Alert.alert('No se pudo guardar', e instanceof Error ? e.message : '');
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return <ActivityIndicator color={C.wine} style={{ marginTop: 40 }} />;
  if (!access) return <AdminLogin />;
  if (access.isRevoked || !access.isSuperAdmin) return <View style={{ flex: 1, padding: 18 }}><Text style={s.cancel}>Solo Super Admin puede editar reuniones.</Text></View>;
  if (!loaded) return <ActivityIndicator color={C.wine} style={{ marginTop: 40 }} />;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: editing ? 'Editar evento' : 'Nuevo evento',
          headerLeft: () => <Pressable hitSlop={10} onPress={() => router.back()}><Text style={s.cancel}>Cancelar</Text></Pressable>,
          headerRight: () => (
            <Pressable hitSlop={10} disabled={saving} onPress={() => { void save(); }}>
              <Text style={[s.done, saving && { opacity: 0.5 }]}>{saving ? 'Guardando…' : 'Guardar'}</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <View style={s.previewCard}>
          <Text style={s.previewKicker}>VISTA PREVIA</Text>
          <View style={s.previewRow}>
            <View style={s.previewArt}>
              {pickedIcon ? <Image source={{ uri: pickedIcon.uri }} style={{ width: 34, height: 34 }} contentFit="contain" /> : <EventArtwork icon={icono} size={30} tint={C.wine} emojiSize={22} />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.previewTitle} numberOfLines={2}>{titulo.trim() || 'Nombre de la reunión'}</Text>
              <Text style={s.previewSub} numberOfLines={1}>{preview || 'Elige los días'}{platform && link ? ` · ${platform.name}` : ''}</Text>
            </View>
            <Text style={s.previewTime}>{hour.padStart(2, '0')}:{minute}</Text>
          </View>
          {(() => {
            const local = localTimeLabel(Number(hour), Number(minute), zona);
            const own = `${hour.padStart(2, '0')}:${minute}`;
            return local && local !== own ? <Text style={s.previewLocal}>En tu hora local: {local}</Text> : null;
          })()}
          {!activa ? <View style={s.hiddenTag}><Ionicons name="eye-off" size={12} color="#fff" /><Text style={s.hiddenTagText}>Oculta en la web y la app</Text></View> : null}
        </View>

        <Group header="Reunión">
          <InputRow label="Nombre" value={titulo} onChangeText={setTitulo} placeholder="Ej. Oración Matutina" />
          <FieldRow label="Icono">
            {isImageIcon || pickedIcon ? <View style={s.imageIconPreview}><Image source={{ uri: pickedIcon?.uri ?? icono }} style={s.imageIcon} contentFit="contain" /><Text style={s.imageIconLabel}>Imagen personalizada</Text></View> : <Chips options={ICONS} selected={[icono]} onToggle={(o) => { setPickedIcon(null); setIcono(o); }} iconOptions />}
            <Pressable accessibilityRole="button" onPress={() => { void chooseIcon(); }} style={s.chooseIcon}><Text style={s.chooseIconText}>{isImageIcon || pickedIcon ? 'Cambiar imagen' : 'Usar una imagen propia'}</Text></Pressable>
            {isImageIcon || pickedIcon ? <Pressable onPress={() => { setPickedIcon(null); setIcono('🙏'); }} style={s.removeIcon}><Text style={s.removeIconText}>Usar icono predeterminado</Text></Pressable> : null}
          </FieldRow>
        </Group>

        <Group header="Cuándo" footer={preview ? `Se mostrará como “${preview}”. Cada persona lo ve en su hora local.` : 'Elige al menos un día.'}>
          <FieldRow label="Días">
            <View style={s.dayRow}>
              {WEEK_DAYS.map((d) => {
                const on = days.includes(d);
                return (
                  <Pressable key={d} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={d}
                    onPress={() => { tapFeedback(); setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d])); }}
                    style={[s.dayBtn, on && s.dayBtnOn]}>
                    <Text style={[s.dayBtnText, on && { color: '#fff' }]}>{LETTERS[d]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={s.presets}>
              {PRESETS.map((p) => (
                <Pressable key={p.label} onPress={() => { tapFeedback(); setDays(p.days); }} style={s.preset}><Text style={s.presetText}>{p.label}</Text></Pressable>
              ))}
            </View>
          </FieldRow>
          <FieldRow label="Hora de inicio">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}><WheelPicker title="Hora" value={hour} options={HOURS} onChange={setHour} renderValue={(o) => `${o?.label ?? hour} h`} /></View>
              <Text style={s.colon}>:</Text>
              <View style={{ flex: 1 }}><WheelPicker title="Minutos" value={minute} options={MINUTES} onChange={setMinute} renderValue={(o) => `${o?.label ?? minute} min`} /></View>
            </View>
          </FieldRow>
          <FieldRow label="Zona horaria del horario">
            <WheelPicker title="Zona horaria" value={zona} options={EVENT_TIMEZONES} onChange={setZona} />
          </FieldRow>
        </Group>

        <Group header="Enlace de la llamada" footer={platform ? `Detectado: ${platform.name}. Las personas se unirán con un toque desde la app, la web y las notificaciones.` : 'Pega el enlace de Google Meet, Zoom, Teams, YouTube o WhatsApp.'}>
          <InputRow label="Enlace" value={link} onChangeText={setLink} placeholder="https://meet.google.com/…" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          {platform && link ? <Row icon="open-outline" label="Probar enlace" onPress={() => Linking.openURL(link.trim())} /> : null}
        </Group>

        <Group header="Publicación">
          <SwitchRow icon="eye" label="Visible" sub="En la web y la app" value={activa} onValueChange={setActiva} />
          <SwitchRow icon="notifications" tint="#d64545" label="Avisar por notificación" sub="15 min antes y al empezar" value={notificar} onValueChange={setNotificar} />
          <InputRow label="Orden" value={orden} onChangeText={(v) => setOrden(v.replace(/\D/g, ''))} keyboardType="number-pad" />
        </Group>

        {editing && audit ? (
          <View style={s.audit}>
            <View style={s.auditRow}><Ionicons name="add-circle-outline" size={16} color={C.muted} /><Text style={s.auditText}><Text style={s.auditLabel}>Agregado: </Text>{fmtAudit(audit.creado_at) ? `${fmtAudit(audit.creado_at)}${audit.creado_por_nombre ? ` · ${audit.creado_por_nombre}` : ''}` : 'Sin registro (anterior al control de cambios)'}</Text></View>
            <View style={s.auditRow}><Ionicons name="create-outline" size={16} color={C.muted} /><Text style={s.auditText}><Text style={s.auditLabel}>Modificado: </Text>{fmtAudit(audit.modificado_at) ? `${fmtAudit(audit.modificado_at)}${audit.modificado_por_nombre ? ` · ${audit.modificado_por_nombre}` : ''}` : 'Sin cambios registrados'}</Text></View>
          </View>
        ) : null}

        {editing ? (
          <Group>
            <Row label="Eliminar evento" destructive chevron={false} onPress={() => Alert.alert('Eliminar evento', 'Esta acción no se puede deshacer.', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Eliminar', style: 'destructive', onPress: async () => {
                try { await deleteEvento(id!); router.back(); } catch (e) { Alert.alert('No se pudo eliminar', e instanceof Error ? e.message : ''); }
              } },
            ])} />
          </Group>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, paddingBottom: 80 },
  previewCard: { borderRadius: 20, padding: 16, backgroundColor: C.card, boxShadow: '0 1px 2px rgba(63,38,35,0.04), 0 10px 26px rgba(63,38,35,0.07)', gap: 10 },
  previewKicker: { fontFamily: sans, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: C.wine },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  previewArt: { width: 50, height: 50, borderRadius: 14, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  previewTitle: { fontFamily: sans, fontSize: 17, fontWeight: '600', color: C.ink, letterSpacing: -0.3 },
  previewSub: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 2 },
  previewTime: { fontFamily: sans, fontSize: 24, fontWeight: '700', color: C.ink, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  previewLocal: { fontFamily: sans, fontSize: 12, fontWeight: '600', color: C.wine },
  hiddenTag: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(40,24,22,0.85)' },
  hiddenTagText: { fontFamily: sans, fontSize: 11, fontWeight: '700', color: '#fff' },
  dayRow: { flexDirection: 'row', gap: 6 },
  dayBtn: { flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.fill },
  dayBtnOn: { backgroundColor: C.wine },
  dayBtnText: { fontFamily: sans, fontSize: 15, fontWeight: '700', color: C.wine },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  preset: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.line },
  presetText: { fontFamily: sans, fontSize: 12, fontWeight: '600', color: C.muted },
  audit: { marginTop: 22, padding: 14, borderRadius: 14, backgroundColor: C.card, gap: 8 },
  auditRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  auditText: { flex: 1, fontFamily: sans, fontSize: 13, lineHeight: 18, color: C.muted },
  auditLabel: { fontWeight: '700', color: C.ink },
  cancel: { fontFamily: sans, fontSize: 17, color: C.wine, marginHorizontal: 8 },
  done: { fontFamily: sans, fontSize: 17, fontWeight: '700', color: C.wine, marginHorizontal: 8 },
  colon: { fontFamily: sans, fontSize: 20, fontWeight: '600', color: C.muted },
  imageIconPreview: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 },
  imageIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: C.blush },
  imageIconLabel: { fontFamily: sans, color: C.muted, fontSize: 14 },
  chooseIcon: { alignSelf: 'flex-start', paddingVertical: 10 },
  chooseIconText: { fontFamily: sans, color: C.wine, fontWeight: '600' },
  removeIcon: { alignSelf: 'flex-start', paddingVertical: 7 },
  removeIconText: { fontFamily: sans, color: C.muted, fontSize: 13 },
});
