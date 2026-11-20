import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { tapFeedback } from '@/components/ui';
import { FieldRow, Group, InputRow, Row } from '@/components/form';
import { AddressInput } from '@/components/address-input';
import { DateField } from '@/components/date-field';
import { C, sans } from '@/constants/theme';
import { AdminGestureRow } from '@/components/admin-gesture-row';
import { canAdmin, uploadImage } from '@/lib/admin';
import { supabase } from '@/lib/supabase';
import { useAdmin } from '@/lib/use-admin';

type Kind = 'destacadas' | 'youtube' | 'banner';
type Item = {
  id: string; titulo: string; subtitulo?: string; nombre?: string; foto_url?: string; video_id?: string; etiqueta?: string; orden: number; activa: boolean;
  inscripcion_abierta?: boolean | null; cupo?: number | null; fecha_evento?: string | null; lugar?: string | null;
  creado_at?: string | null; creado_por_nombre?: string | null; modificado_at?: string | null; modificado_por_nombre?: string | null;
};
type Inscrita = { id: string; nombre: string; email: string; telefono: string | null; acompanantes: number; created_at: string };

const fmtDateTime = (iso?: string | null) => iso
  ? new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace('.', '')
  : null;

function AuditCard({ item }: { item: Item }) {
  const created = fmtDateTime(item.creado_at);
  const modified = fmtDateTime(item.modificado_at);
  return (
    <View style={s.audit}>
      <View style={s.auditRow}>
        <Ionicons name="add-circle-outline" size={16} color={C.muted} />
        <Text style={s.auditText}><Text style={s.auditLabel}>Agregado: </Text>{created ? `${created}${item.creado_por_nombre ? ` · ${item.creado_por_nombre}` : ''}` : 'Sin registro (anterior al control de cambios)'}</Text>
      </View>
      <View style={s.auditRow}>
        <Ionicons name="create-outline" size={16} color={C.muted} />
        <Text style={s.auditText}><Text style={s.auditLabel}>Modificado: </Text>{modified ? `${modified}${item.modificado_por_nombre ? ` · ${item.modificado_por_nombre}` : ''}` : 'Sin cambios registrados'}</Text>
      </View>
    </View>
  );
}

function videoIdFrom(value: string) {
  const raw = value.trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1).slice(0, 11);
    return url.searchParams.get('v') || url.pathname.match(/\/(?:embed|shorts)\/([\w-]{11})/)?.[1] || '';
  } catch { return ''; }
}

export default function AdminContenido() {
  const { access, ready } = useAdmin();
  const { tipo } = useLocalSearchParams<{ tipo?: string }>();
  const [kind, setKind] = useState<Kind>(tipo === 'youtube' || tipo === 'banner' ? tipo : 'destacadas');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [video, setVideo] = useState('');
  const [tag, setTag] = useState('Conferencia');
  const [order, setOrder] = useState('1');
  const [active, setActive] = useState(true);
  const [picked, setPicked] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [signups, setSignups] = useState(false);
  const [capacity, setCapacity] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [place, setPlace] = useState('');
  const [inscritas, setInscritas] = useState<Inscrita[] | null>(null);
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerActive, setBannerActive] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);
  const [confettiDate, setConfettiDate] = useState('');
  const [confettiMessage, setConfettiMessage] = useState('');
  const [confettiBusy, setConfettiBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (kind === 'banner') {
        const { data, error } = await supabase.from('site_banner').select('titulo,mensaje,activa').eq('id', 1).maybeSingle();
        if (error) throw error;
        setBannerTitle(data?.titulo ?? ''); setBannerMessage(data?.mensaje ?? ''); setBannerActive(Boolean(data?.activa));
        const confetti = await supabase.from('site_confetti').select('activa,fecha,mensaje').eq('id', 1).maybeSingle();
        if (!confetti.error) { setConfettiActive(Boolean(confetti.data?.activa)); setConfettiDate(confetti.data?.fecha ?? ''); setConfettiMessage(confetti.data?.mensaje ?? ''); }
        setItems([]);
      } else {
        const table = kind;
        const { data, error } = await supabase.from(table).select('*').order('orden', { ascending: true });
        if (error) throw error;
        setItems((data ?? []).map((row) => ({ ...row, id: String(row.id), titulo: String(row.titulo || ''), orden: Number(row.orden) || 1, activa: Boolean(row.activa) })) as Item[]);
      }
    } catch (error) { Alert.alert('No se pudo cargar el contenido', error instanceof Error ? error.message : ''); }
    finally { setLoading(false); }
  }, [kind]);

  useFocusEffect(useCallback(() => { if (canAdmin(access,'content','view')) void load(); }, [access, load]));

  const beginEdit = (item?: Item) => {
    setModalVisible(true);
    setEditing(item ?? null);
    setTitle(item?.titulo ?? ''); setSubtitle(item?.subtitulo ?? ''); setImageUrl(item?.foto_url ?? '');
    setVideo(item?.video_id ?? ''); setTag(item?.etiqueta ?? 'Conferencia'); setOrder(String(item?.orden ?? items.length + 1));
    setActive(item?.activa ?? canAdmin(access,'content','publish')); setPicked(null);
    setSignups(Boolean(item?.inscripcion_abierta)); setCapacity(item?.cupo ? String(item.cupo) : ''); setPlace(item?.lugar ?? '');
    const when = item?.fecha_evento ? new Date(item.fecha_evento) : null;
    setEventDate(when ? `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}` : '');
    setEventTime(when ? `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}` : '');
    setInscritas(null);
    if (item && kind === 'destacadas') {
      void supabase.from('inscripciones').select('id,nombre,email,telefono,acompanantes,created_at').eq('destacada_id', item.id).order('created_at')
        .then(({ data }) => setInscritas((data ?? []) as Inscrita[]));
    }
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Permite el acceso a Fotos', 'Necesitamos acceso para escoger la imagen del destacado.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setPicked({ uri: asset.uri, width: asset.width, height: asset.height });
  };

  const saveConfetti = async () => {
    if (confettiActive && !confettiDate) return Alert.alert('Falta la fecha', 'Elige el día de la celebración.');
    setConfettiBusy(true);
    try {
      const { error } = await supabase.from('site_confetti').update({ activa: confettiActive, fecha: confettiDate || null, mensaje: confettiMessage.trim(), updated_at: new Date().toISOString() }).eq('id', 1);
      if (error) throw error;
      tapFeedback();
      Alert.alert(confettiActive ? 'Celebración programada' : 'Confeti desactivado', confettiActive ? 'Ese día, la web y la app mostrarán confeti al abrirse.' : undefined);
    } catch (error) { Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
    finally { setConfettiBusy(false); }
  };

  const save = async () => {
    if (kind === 'banner' && !canAdmin(access,'content','edit')) return Alert.alert('Sin permiso', 'Necesitas permiso para editar el banner.');
    if (kind !== 'banner' && !canAdmin(access,'content',editing ? 'edit' : 'create')) return Alert.alert('Sin permiso', 'No tienes permiso para guardar esta publicación.');
    if (kind !== 'banner' && active && !editing?.activa && !canAdmin(access,'content','publish')) return Alert.alert('Sin permiso', 'Necesitas permiso para publicar. Puedes guardar la publicación como oculta.');
    if (kind === 'banner') {
      setBusy(true);
      try {
        const { error } = await supabase.from('site_banner').update({ titulo: bannerTitle.trim(), mensaje: bannerMessage.trim(), activa: bannerActive, updated_at: new Date().toISOString() }).eq('id', 1);
        if (error) throw error;
        Alert.alert('Banner guardado');
      } catch (error) { Alert.alert('No se pudo guardar', error instanceof Error ? error.message : ''); }
      finally { setBusy(false); }
      return;
    }
    if (title.trim().length < 2) return Alert.alert('Falta el título', 'Escribe un título para la publicación.');
    if (kind === 'destacadas' && !picked && !imageUrl.trim()) return Alert.alert('Falta el póster', 'Elige una imagen o pega una dirección de imagen.');
    const parsedVideo = videoIdFrom(video);
    if (kind === 'youtube' && !parsedVideo) return Alert.alert('Enlace de YouTube no válido', 'Pega el enlace del video o su identificador.');
    setBusy(true);
    try {
      let photo = imageUrl.trim();
      if (kind === 'destacadas' && picked) photo = await uploadImage(picked.uri, picked, 'destacadas');
      const nextOrder = Math.max(1, Number(order) || 1);
      if (kind === 'destacadas') {
        const timeOk = !eventTime || /^([01]?\d|2[0-3]):[0-5]\d$/.test(eventTime);
        if (!timeOk) throw new Error('Escribe la hora como 18:30.');
        const fecha = eventDate ? new Date(`${eventDate}T${eventTime || '00:00'}:00`).toISOString() : null;
        const payload = {
          foto_url: photo, nombre: title.trim(), titulo: subtitle.trim(), orden: nextOrder, activa: active,
          inscripcion_abierta: signups, cupo: capacity ? Math.max(1, Number(capacity)) : null, fecha_evento: fecha, lugar: place.trim() || null,
        };
        const result = editing ? await supabase.from('destacadas').update(payload).eq('id', editing.id) : await supabase.from('destacadas').insert(payload);
        if (result.error) throw result.error;
      } else {
        const payload = { video_id: parsedVideo, titulo: title.trim(), subtitulo: subtitle.trim(), etiqueta: tag.trim() || 'Conferencia', orden: nextOrder, activa: active };
        const result = editing ? await supabase.from('youtube').update(payload).eq('id', editing.id) : await supabase.from('youtube').insert(payload);
        if (result.error) throw result.error;
      }
      setEditing(null); setModalVisible(false);
      await load();
    } catch (error) { Alert.alert('No se pudo guardar', error instanceof Error ? error.message : ''); }
    finally { setBusy(false); }
  };

  const remove = (item: Item) => Alert.alert('Eliminar publicación', `¿Eliminar “${item.titulo}”?`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: async () => {
      const { error } = await supabase.from(kind).delete().eq('id', item.id);
      if (error) Alert.alert('No se pudo eliminar', error.message); else await load();
    } },
  ]);

  const toggleVisible = async (item: Item) => {
    tapFeedback();
    const next = !item.activa;
    setItems((cur) => cur.map((entry) => (entry.id === item.id ? { ...entry, activa: next } : entry)));
    const { error } = await supabase.from(kind).update({ activa: next }).eq('id', item.id);
    if (error) {
      setItems((cur) => cur.map((entry) => (entry.id === item.id ? { ...entry, activa: !next } : entry)));
      Alert.alert('No se pudo actualizar', error.message);
    }
  };

  const moveItem = async (item: Item, delta: number) => {
    const ordered = [...items].sort((a, b) => a.orden - b.orden);
    const index = ordered.findIndex((entry) => entry.id === item.id);
    const next = Math.max(0, Math.min(ordered.length - 1, index + delta));
    if (index < 0 || next < 0 || next >= ordered.length) return;
    const [moved] = ordered.splice(index, 1);
    ordered.splice(next, 0, moved);
    setBusy(true);
    try {
      const results = await Promise.all(ordered.map((entry, position) => supabase.from(kind).update({ orden: position + 1 }).eq('id', entry.id)));
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
      await load();
    } catch (error) { Alert.alert('No se pudo cambiar el orden', error instanceof Error ? error.message : ''); }
    finally { setBusy(false); }
  };

  if (!ready) return <View style={s.center}><ActivityIndicator color={C.wine} /></View>;
  if (!access) return <View style={s.page}><Row icon="lock-closed" label="Inicia sesión para administrar contenido" chevron={false} /></View>;
  if (access.isRevoked || !canAdmin(access,'content','view')) return <View style={s.page}><Row icon="lock-closed" label="Tu cuenta no tiene acceso al contenido y publicaciones." chevron={false} /></View>;

  const types: { key: Kind; label: string }[] = [{ key: 'destacadas', label: 'Destacadas' }, { key: 'youtube', label: 'YouTube' }, { key: 'banner', label: 'Banner' }];

  return (
    <>
      <Stack.Screen options={{ title: kind === 'youtube' ? 'YouTube' : kind === 'banner' ? 'Banner' : 'Destacadas', headerRight: () => kind !== 'banner' && (canAdmin(access,'content','create') || canAdmin(access,'content','edit')) ? (
        <Pressable accessibilityLabel="Nueva publicación" onPress={() => beginEdit()} hitSlop={12} style={{ paddingHorizontal: 8 }}><Ionicons name="add-circle" size={27} color={C.wine} /></Pressable>
      ) : null }} />
      <ScrollView contentContainerStyle={s.page} refreshControl={undefined}>
        <Text style={s.kicker}>CENTRO DE GESTIÓN</Text>
        <Text style={s.title}>Contenido</Text>
        <Text style={s.subtitle}>Publica y organiza las historias que aparecen en la comunidad.</Text>
        <View style={s.segment}>
          {types.filter((type) => type.key !== 'banner' || canAdmin(access,'content','edit')).map((type) => <Pressable key={type.key} onPress={() => setKind(type.key)} style={[s.segmentOption, kind === type.key && s.segmentActive]}><Text style={[s.segmentText, kind === type.key && s.segmentTextActive]}>{type.label}</Text></Pressable>)}
        </View>
        {kind === 'banner' ? (
          <Group header="Aviso de bienvenida" footer="El banner aparece en la página de inicio mientras esté activado.">
            <InputRow label="Título" value={bannerTitle} onChangeText={setBannerTitle} placeholder="Título del aviso" editable={canAdmin(access,'content','edit')} />
            <View style={s.messageField}><Text style={s.fieldLabel}>Mensaje</Text><TextInput multiline value={bannerMessage} onChangeText={setBannerMessage} editable={canAdmin(access,'content','edit')} placeholder="Escribe el aviso para la comunidad" placeholderTextColor="#a28f8c" style={s.messageInput} /></View>
            <View style={s.toggle}><Text style={s.toggleLabel}>Mostrar banner</Text><Switch value={bannerActive} disabled={!canAdmin(access,'content','publish')} onValueChange={setBannerActive} trackColor={{ true: C.wine, false: '#e5dcda' }} thumbColor="#fff" /></View>
            <View style={s.bannerPreview}>
              <View style={s.bannerPreviewTop}><Text style={s.bannerPreviewKicker}>VISTA PREVIA</Text><View style={[s.bannerState, bannerActive && s.bannerStateOn]}><View style={[s.bannerStateDot, bannerActive && s.bannerStateDotOn]} /><Text style={[s.bannerStateText, bannerActive && s.bannerStateTextOn]}>{bannerActive ? 'Activo' : 'Inactivo'}</Text></View></View>
              <View style={s.bannerPreviewCard}>
                <View style={s.bannerPreviewMark}><Ionicons name="sparkles" size={15} color={C.wine} /></View>
                <Text style={s.bannerPreviewEyebrow}>MUJERES CON PROPÓSITO</Text>
                <Text style={s.bannerPreviewTitle}>{bannerTitle.trim() || 'Tu título aparecerá aquí'}</Text>
                <Text style={s.bannerPreviewText}>{bannerMessage.trim() || 'Escribe un mensaje breve para invitar a la comunidad.'}</Text>
              </View>
            </View>
            {canAdmin(access,'content','edit') ? <Pressable onPress={() => void save()} disabled={busy} style={s.saveButton}><Text style={s.saveText}>{busy ? 'Guardando…' : 'Guardar banner'}</Text></Pressable> : null}
          </Group>
        ) : null}
        {kind === 'banner' ? (
          <Group header="Celebración con confeti" footer="Ese día (hora de Luxemburgo), cada vez que alguien abra la web o la app verá confeti unos segundos. Ej.: el primer año en Europa.">
            <View style={s.toggle}><Text style={s.toggleLabel}>Habilitar confeti</Text><Switch value={confettiActive} disabled={!canAdmin(access,'content','publish')} onValueChange={setConfettiActive} trackColor={{ true: C.wine, false: '#e5dcda' }} thumbColor="#fff" /></View>
            <FieldRow label="Fecha"><DateField title="Fecha de la celebración" value={confettiDate} onChange={setConfettiDate} minimumDate={new Date(2024, 0, 1)} maximumDate={new Date(2035, 11, 31)} defaultDate={new Date()} placeholder="Elige el día" /></FieldRow>
            <InputRow label="Mensaje (opcional)" value={confettiMessage} onChangeText={setConfettiMessage} placeholder="¡Celebramos 1 año en Europa!" maxLength={90} editable={canAdmin(access,'content','edit')} />
            {canAdmin(access,'content','edit') ? <Pressable onPress={() => void saveConfetti()} disabled={confettiBusy} style={s.saveButton}><Text style={s.saveText}>{confettiBusy ? 'Guardando…' : 'Guardar celebración'}</Text></Pressable> : null}
          </Group>
        ) : loading ? <ActivityIndicator color={C.wine} style={{ marginTop: 40 }} /> : (
          <Group header={`${items.length} ${kind === 'destacadas' ? 'destacadas' : 'videos'}`} footer="Desliza a la derecha para editar, a la izquierda para eliminar o mantén pulsado y arrastra para ordenar.">
            {items.map((item) => (
              <AdminGestureRow key={item.id} onEdit={canAdmin(access,'content','edit') ? () => beginEdit(item) : undefined} onDelete={canAdmin(access,'content','delete') ? () => remove(item) : undefined} onReorder={canAdmin(access,'content','edit') ? (steps) => void moveItem(item, steps) : undefined} stepHeight={82}>
              <View style={s.item}>
                <Pressable onPress={canAdmin(access,'content','edit') ? () => beginEdit(item) : undefined} style={s.itemMain}>
                  <View>
                    {kind === 'destacadas' && item.foto_url ? <Image source={{ uri: item.foto_url }} style={[s.thumb, !item.activa && { opacity: 0.35 }]} contentFit="cover" /> : <View style={[s.thumbIcon, !item.activa && { opacity: 0.45 }]}><Ionicons name="logo-youtube" size={21} color={C.wine} /></View>}
                    <Pressable
                      accessibilityRole="switch"
                      accessibilityState={{ checked: item.activa }}
                      accessibilityLabel={item.activa ? 'Visible. Toca para ocultar' : 'Oculto. Toca para mostrar'}
                      hitSlop={8}
                      disabled={!canAdmin(access,'content','publish')}
                      onPress={() => void toggleVisible(item)}
                      style={[s.eye, !item.activa && s.eyeOff]}>
                      <Ionicons name={item.activa ? 'eye' : 'eye-off'} size={13} color={item.activa ? C.wine : '#fff'} />
                    </Pressable>
                  </View>
                  <View style={{ flex: 1 }}><Text numberOfLines={2} style={s.itemTitle}>{item.titulo || item.nombre}</Text><Text numberOfLines={1} style={s.itemMeta}>{item.activa ? 'Visible' : 'Oculto'}{item.inscripcion_abierta ? ' · Inscripciones abiertas' : ''}</Text>{item.modificado_at || item.creado_at ? <Text numberOfLines={1} style={s.itemAudit}>{item.modificado_at ? 'Modificado' : 'Agregado'} {fmtDateTime(item.modificado_at || item.creado_at)}{(item.modificado_por_nombre || item.creado_por_nombre) ? ` · ${item.modificado_por_nombre || item.creado_por_nombre}` : ''}</Text> : null}</View>
                  <Ionicons name="chevron-forward" size={18} color="#ab9693" />
                </Pressable>
              </View>
              </AdminGestureRow>
            ))}
            {!items.length ? <Row label="Aún no hay publicaciones" sub="Usa + para crear una." chevron={false} /> : null}
          </Group>
        )}
      </ScrollView>
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setEditing(null); setModalVisible(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalBar}><Pressable onPress={() => { setEditing(null); setModalVisible(false); }}><Text style={s.modalAction}>Cancelar</Text></Pressable><Text style={s.modalTitle}>{editing ? 'Editar' : 'Nueva'} {kind === 'destacadas' ? 'destacada' : 'video'}</Text><Pressable disabled={busy} onPress={() => void save()}><Text style={[s.modalAction, { fontWeight: '700' }]}>{busy ? '…' : 'Guardar'}</Text></Pressable></View>
          <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
            {kind === 'destacadas' ? <>
              {picked ? <Image source={{ uri: picked.uri }} style={s.preview} contentFit="cover" /> : imageUrl ? <Image source={{ uri: imageUrl }} style={s.preview} contentFit="cover" /> : null}
              <Pressable style={s.pickButton} onPress={() => void pickPhoto()}><Ionicons name="image-outline" size={18} color={C.wine} /><Text style={s.pickText}>{picked || imageUrl ? 'Cambiar póster' : 'Elegir póster del carrete'}</Text></Pressable>
              <Group header="Imagen"><InputRow label="URL de la imagen" value={imageUrl} onChangeText={setImageUrl} placeholder="https://…" autoCapitalize="none" keyboardType="url" /></Group>
              <Group header="Texto"><InputRow label="Nombre" value={title} onChangeText={setTitle} placeholder="Nombre de la invitada" /><InputRow label="Título" value={subtitle} onChangeText={setSubtitle} placeholder="Nombre del encuentro" /></Group>
              <Group header="Confirmación de asistencia" footer={signups ? 'Se mostrará el botón “Inscribirme” en la web y la app. Al apagarlo se cierra la inscripción, pero la lista de inscritas se conserva. Deja las plazas vacías si no hay límite.' : 'Apagado: la destacada se muestra solo como anuncio, sin botón. Enciéndelo únicamente para actividades que necesiten confirmar quién asistirá.'}>
                <View style={s.toggle}><Text style={s.toggleLabel}>Requiere inscripción</Text><Switch value={signups} onValueChange={setSignups} trackColor={{ true: C.wine, false: '#e5dcda' }} thumbColor="#fff" /></View>
                {signups ? <>
                  <FieldRow label="Fecha del evento"><DateField title="Fecha del evento" value={eventDate} onChange={setEventDate} minimumDate={new Date(2024, 0, 1)} maximumDate={new Date(2035, 11, 31)} defaultDate={new Date()} placeholder="Elige la fecha" /></FieldRow>
                  <InputRow label="Hora (opcional)" value={eventTime} onChangeText={setEventTime} placeholder="18:30" keyboardType="numbers-and-punctuation" />
                  <FieldRow label="Lugar (opcional)"><AddressInput value={place} onChangeText={setPlace} /></FieldRow>
                  <InputRow label="Plazas (opcional)" value={capacity} onChangeText={(v) => setCapacity(v.replace(/\D/g, ''))} placeholder="Sin límite" keyboardType="number-pad" />
                </> : null}
              </Group>
              {editing && inscritas ? (
                <Group header={`Inscritas · ${inscritas.reduce((n, i) => n + 1 + (i.acompanantes || 0), 0)} personas${editing.cupo ? ` de ${editing.cupo}` : ''}`} footer={inscritas.length ? 'Toca una persona para escribirle.' : undefined}>
                  {inscritas.length ? inscritas.map((i) => (
                    <Row key={i.id} icon="person" tint="#6b5b95" label={i.nombre} sub={`${i.email}${i.telefono ? ` · ${i.telefono}` : ''}${i.acompanantes ? ` · +${i.acompanantes}` : ''}`} onPress={() => { void Linking.openURL(`mailto:${i.email}`); }} />
                  )) : <Row label="Todavía no hay inscripciones" chevron={false} />}
                </Group>
              ) : null}
            </> : <Group header="Video"><InputRow label="Enlace o ID de YouTube" value={video} onChangeText={setVideo} placeholder="https://youtu.be/…" autoCapitalize="none" keyboardType="url" /><InputRow label="Título" value={title} onChangeText={setTitle} placeholder="Título del video" /><InputRow label="Subtítulo" value={subtitle} onChangeText={setSubtitle} placeholder="Descripción breve" /><InputRow label="Etiqueta" value={tag} onChangeText={setTag} placeholder="Conferencia" /></Group>}
            <Group header="Publicación"><InputRow label="Orden" value={order} onChangeText={(value) => setOrder(value.replace(/\D/g, ''))} editable={canAdmin(access,'content','edit') || canAdmin(access,'content','create')} keyboardType="number-pad" /><View style={s.toggle}><Text style={s.toggleLabel}>Visible en la web y la app</Text><Switch value={active} disabled={!canAdmin(access,'content','publish')} onValueChange={setActive} trackColor={{ true: C.wine, false: '#e5dcda' }} thumbColor="#fff" /></View></Group>
            {editing ? <AuditCard item={editing} /> : null}
            {editing && canAdmin(access,'content','delete') ? <Group><Row label="Eliminar" destructive chevron={false} onPress={() => { const row = editing; setEditing(null); setModalVisible(false); remove(row); }} /></Group> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  audit: { marginTop: 22, padding: 14, borderRadius: 14, backgroundColor: C.card, gap: 8 },
  itemAudit: { fontFamily: sans, fontSize: 11, color: C.muted, marginTop: 2 },
  auditRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  auditText: { flex: 1, fontFamily: sans, fontSize: 13, lineHeight: 18, color: C.muted },
  auditLabel: { fontWeight: '700', color: C.ink },
  eye: { position: 'absolute', top: -6, right: -6, width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.18)' },
  eyeOff: { backgroundColor: 'rgba(40,24,22,0.85)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }, page: { padding: 18, paddingBottom: 70 },
  kicker: { fontFamily: sans, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: C.wine, marginTop: 6 },
  title: { fontFamily: sans, fontSize: 31, fontWeight: '700', letterSpacing: -0.8, color: C.ink, marginTop: 5 },
  subtitle: { fontFamily: sans, fontSize: 14, lineHeight: 20, color: C.muted, marginTop: 4, marginBottom: 18 }, devotionLink: { marginBottom: 18, borderRadius: 16, overflow: 'hidden', backgroundColor: C.card },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 15, backgroundColor: '#eee5e3', marginBottom: 22 },
  segmentOption: { flex: 1, minHeight: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, segmentActive: { backgroundColor: C.card, boxShadow: '0 2px 8px rgba(63,38,35,0.09)' },
  segmentText: { fontFamily: sans, fontSize: 12, fontWeight: '600', color: C.muted }, segmentTextActive: { color: C.ink },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10 },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4, paddingHorizontal: 4 },
  orderActions: { gap: 5 }, orderButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: C.fill },
  thumb: { width: 56, height: 70, borderRadius: 12, backgroundColor: C.sand }, thumbIcon: { width: 50, height: 50, borderRadius: 15, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontFamily: sans, fontSize: 15, fontWeight: '600', color: C.ink }, itemMeta: { fontFamily: sans, fontSize: 12, color: C.muted, marginTop: 3 },
  messageField: { paddingHorizontal: 16, paddingVertical: 12 }, fieldLabel: { fontFamily: sans, color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 8 }, messageInput: { minHeight: 100, textAlignVertical: 'top', fontFamily: sans, color: C.ink, fontSize: 16 },
  toggle: { minHeight: 54, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, toggleLabel: { fontFamily: sans, fontSize: 15, fontWeight: '500', color: C.ink },
  saveButton: { minHeight: 48, margin: 14, borderRadius: 14, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center' }, saveText: { fontFamily: sans, color: '#fff', fontWeight: '700', fontSize: 15 },
  modalBar: { height: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line }, modalTitle: { fontFamily: sans, fontSize: 16, fontWeight: '600', color: C.ink }, modalAction: { fontFamily: sans, fontSize: 15, color: C.wine },
  preview: { width: '100%', height: 220, borderRadius: 20, backgroundColor: C.sand, marginBottom: 12 }, pickButton: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', padding: 12 }, pickText: { fontFamily: sans, fontSize: 14, fontWeight: '600', color: C.wine },
  bannerPreview: { marginHorizontal: 16, marginBottom: 14, padding: 14, borderRadius: 18, backgroundColor: C.sand, gap: 12 },
  bannerPreviewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bannerPreviewKicker: { fontFamily: sans, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: C.wine },
  bannerState: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(60,40,38,0.08)' },
  bannerStateOn: { backgroundColor: 'rgba(47,125,79,0.12)' },
  bannerStateDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.muted },
  bannerStateDotOn: { backgroundColor: '#2f7d4f' },
  bannerStateText: { fontFamily: sans, fontSize: 11.5, fontWeight: '600', color: C.muted },
  bannerStateTextOn: { color: '#2f7d4f' },
  bannerPreviewCard: { padding: 16, borderRadius: 16, backgroundColor: C.card, gap: 5, boxShadow: '0 1px 2px rgba(63,38,35,0.05), 0 10px 26px rgba(63,38,35,0.10)' },
  bannerPreviewMark: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  bannerPreviewEyebrow: { fontFamily: sans, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.3, color: C.gold2 },
  bannerPreviewTitle: { fontFamily: sans, fontSize: 17, fontWeight: '700', color: C.ink },
  bannerPreviewText: { fontFamily: sans, fontSize: 14, lineHeight: 20, color: C.muted },
});
