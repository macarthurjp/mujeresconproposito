import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chips, FieldRow, Group, InputRow, Row, SwitchRow } from '@/components/form';
import { meetingPlatform } from '@/components/meeting-card';
import { tapFeedback } from '@/components/ui';
import { AdminLogin } from '@/components/admin-login';
import { WheelPicker } from '@/components/wheel-picker';
import { C, sans } from '@/constants/theme';
import { buildSchedule, deleteEvento, EVENT_TIMEZONES, listEventos, parseScheduleForEdit, saveEvento, uploadImage, WEEK_DAYS } from '@/lib/admin';
import { useAdmin } from '@/lib/use-admin';

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: String(h).padStart(2, '0') }));
const MINUTES = ['00', '15', '30', '45'].map((m) => ({ value: m, label: m }));
// Values remain stable because existing events store the selected emoji.
const ICONS = [
  '🙏', '📖', '✝️', '🌅', '🌇', '⛪', '💬', '👧', '❤️', '✨',
  '🕊️', '🎵', '🎤', '🎧', '🙌', '🛐', '📿', '🫶', '🤍', '🌿',
  '🌸', '🌻', '☀️', '🌙', '⭐', '🔥', '💡', '🧡', '👥', '🤝',
  '👩‍👩‍👧', '🧒', '🏠', '🌍', '📅', '🎉', '🗣️', '💭', '📝', '🔔',
];

export default function AdminEvento() {
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
        <Group header="Reunión">
          <InputRow label="Nombre" value={titulo} onChangeText={setTitulo} placeholder="Ej. Oración Matutina" />
          <FieldRow label="Icono">
            {isImageIcon || pickedIcon ? <View style={s.imageIconPreview}><Image source={{ uri: pickedIcon?.uri ?? icono }} style={s.imageIcon} contentFit="contain" /><Text style={s.imageIconLabel}>Imagen personalizada</Text></View> : <Chips options={ICONS} selected={[icono]} onToggle={(o) => setIcono(o)} iconOptions />}
            <Pressable accessibilityRole="button" onPress={() => { void chooseIcon(); }} style={s.chooseIcon}><Text style={s.chooseIconText}>{isImageIcon || pickedIcon ? 'Cambiar imagen' : 'Elegir imagen del evento'}</Text></Pressable>
            {isImageIcon || pickedIcon ? <Pressable onPress={() => { setPickedIcon(null); setIcono('🙏'); }} style={s.removeIcon}><Text style={s.removeIconText}>Usar un emoji</Text></Pressable> : null}
          </FieldRow>
        </Group>

        <Group header="Horario" footer={preview ? `Se mostrará como "${preview}" y cada persona lo verá en su hora local.` : 'Elige al menos un día.'}>
          <FieldRow label="Días">
            <Chips options={WEEK_DAYS} selected={days} onToggle={(d) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))} />
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
