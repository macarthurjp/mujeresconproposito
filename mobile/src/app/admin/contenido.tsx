import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Group, InputRow, Row } from '@/components/form';
import { C, sans } from '@/constants/theme';
import { AdminGestureRow } from '@/components/admin-gesture-row';
import { uploadImage } from '@/lib/admin';
import { supabase } from '@/lib/supabase';
import { useAdmin } from '@/lib/use-admin';

type Kind = 'destacadas' | 'youtube' | 'banner';
type Item = { id: string; titulo: string; subtitulo?: string; nombre?: string; foto_url?: string; video_id?: string; etiqueta?: string; orden: number; activa: boolean };

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
  const [kind, setKind] = useState<Kind>('destacadas');
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
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerActive, setBannerActive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (kind === 'banner') {
        const { data, error } = await supabase.from('site_banner').select('titulo,mensaje,activa').eq('id', 1).maybeSingle();
        if (error) throw error;
        setBannerTitle(data?.titulo ?? ''); setBannerMessage(data?.mensaje ?? ''); setBannerActive(Boolean(data?.activa));
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

  useFocusEffect(useCallback(() => { if (access?.isSuperAdmin && !access.isRevoked) void load(); }, [access, load]));

  const beginEdit = (item?: Item) => {
    setModalVisible(true);
    setEditing(item ?? null);
    setTitle(item?.titulo ?? ''); setSubtitle(item?.subtitulo ?? ''); setImageUrl(item?.foto_url ?? '');
    setVideo(item?.video_id ?? ''); setTag(item?.etiqueta ?? 'Conferencia'); setOrder(String(item?.orden ?? items.length + 1));
    setActive(item?.activa ?? true); setPicked(null);
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Permite el acceso a Fotos', 'Necesitamos acceso para escoger la imagen del destacado.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setPicked({ uri: asset.uri, width: asset.width, height: asset.height });
  };

  const save = async () => {
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
        const payload = { foto_url: photo, nombre: title.trim(), titulo: subtitle.trim(), orden: nextOrder, activa: active };
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
  if (access.isRevoked || !access.isSuperAdmin) return <View style={s.page}><Row icon="lock-closed" label="Solo Super Admin puede administrar este contenido." chevron={false} /></View>;

  const types: { key: Kind; label: string }[] = [{ key: 'destacadas', label: 'Destacadas' }, { key: 'youtube', label: 'YouTube' }, { key: 'banner', label: 'Banner' }];

  return (
    <>
      <Stack.Screen options={{ title: 'Contenido', headerRight: () => kind !== 'banner' ? (
        <Pressable accessibilityLabel="Nueva publicación" onPress={() => beginEdit()} hitSlop={12} style={{ paddingHorizontal: 8 }}><Ionicons name="add-circle" size={27} color={C.wine} /></Pressable>
      ) : null }} />
      <ScrollView contentContainerStyle={s.page} refreshControl={undefined}>
        <Text style={s.kicker}>CENTRO DE GESTIÓN</Text>
        <Text style={s.title}>Contenido</Text>
        <Text style={s.subtitle}>Publica y organiza las historias que aparecen en la comunidad.</Text>
        <View style={s.segment}>
          {types.map((type) => <Pressable key={type.key} onPress={() => setKind(type.key)} style={[s.segmentOption, kind === type.key && s.segmentActive]}><Text style={[s.segmentText, kind === type.key && s.segmentTextActive]}>{type.label}</Text></Pressable>)}
        </View>
        <View style={s.devotionLink}><Row icon="book-outline" label="Devocionales" sub="Escribir, revisar y publicar" onPress={() => router.push('/admin/devocionales')} /></View>
        {kind === 'banner' ? (
          <Group header="Aviso de bienvenida" footer="El banner aparece en la página de inicio mientras esté activado.">
            <InputRow label="Título" value={bannerTitle} onChangeText={setBannerTitle} placeholder="Título del aviso" />
            <View style={s.messageField}><Text style={s.fieldLabel}>Mensaje</Text><TextInput multiline value={bannerMessage} onChangeText={setBannerMessage} placeholder="Escribe el aviso para la comunidad" placeholderTextColor="#a28f8c" style={s.messageInput} /></View>
            <View style={s.toggle}><Text style={s.toggleLabel}>Mostrar banner</Text><Switch value={bannerActive} onValueChange={setBannerActive} trackColor={{ true: C.wine, false: '#e5dcda' }} /></View>
            <Pressable onPress={() => void save()} disabled={busy} style={s.saveButton}><Text style={s.saveText}>{busy ? 'Guardando…' : 'Guardar banner'}</Text></Pressable>
          </Group>
        ) : loading ? <ActivityIndicator color={C.wine} style={{ marginTop: 40 }} /> : (
          <Group header={`${items.length} ${kind === 'destacadas' ? 'destacadas' : 'videos'}`} footer="Desliza a la derecha para editar, a la izquierda para eliminar o mantén pulsado y arrastra para ordenar.">
            {items.map((item) => (
              <AdminGestureRow key={item.id} onEdit={() => beginEdit(item)} onDelete={() => remove(item)} onReorder={(steps) => void moveItem(item, steps)} stepHeight={82}>
              <View style={s.item}>
                <Pressable onPress={() => beginEdit(item)} style={s.itemMain}>
                  {kind === 'destacadas' && item.foto_url ? <Image source={{ uri: item.foto_url }} style={s.thumb} contentFit="cover" /> : <View style={s.thumbIcon}><Ionicons name="logo-youtube" size={21} color={C.wine} /></View>}
                  <View style={{ flex: 1 }}><Text numberOfLines={2} style={s.itemTitle}>{item.titulo || item.nombre}</Text><Text numberOfLines={1} style={s.itemMeta}>{item.activa ? 'Publicado' : 'Oculto'} · Orden {item.orden}</Text></View>
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
            </> : <Group header="Video"><InputRow label="Enlace o ID de YouTube" value={video} onChangeText={setVideo} placeholder="https://youtu.be/…" autoCapitalize="none" keyboardType="url" /><InputRow label="Título" value={title} onChangeText={setTitle} placeholder="Título del video" /><InputRow label="Subtítulo" value={subtitle} onChangeText={setSubtitle} placeholder="Descripción breve" /><InputRow label="Etiqueta" value={tag} onChangeText={setTag} placeholder="Conferencia" /></Group>}
            <Group header="Publicación"><InputRow label="Orden" value={order} onChangeText={(value) => setOrder(value.replace(/\D/g, ''))} keyboardType="number-pad" /><View style={s.toggle}><Text style={s.toggleLabel}>Visible en la web y la app</Text><Switch value={active} onValueChange={setActive} trackColor={{ true: C.wine, false: '#e5dcda' }} /></View></Group>
            {editing ? <Group><Row label="Eliminar" destructive chevron={false} onPress={() => { const row = editing; setEditing(null); setModalVisible(false); remove(row); }} /></Group> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
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
});
