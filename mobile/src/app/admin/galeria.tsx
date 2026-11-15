import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { FieldRow, Group, InputRow, Row, SwitchRow } from '@/components/form';
import { AdminLogin } from '@/components/admin-login';
import { tapFeedback } from '@/components/ui';
import { WheelPicker } from '@/components/wheel-picker';
import { C, sans } from '@/constants/theme';
import { AdminGestureRow } from '@/components/admin-gesture-row';
import { supabase } from '@/lib/supabase';
import { useAdmin } from '@/lib/use-admin';
import { addGalleryPhoto, listGalleryAlbums, listGalleryPhotos, removeGalleryPhoto, reorderGalleryAlbum, reorderGalleryPhoto, saveGalleryPhoto, setGalleryCover, uploadImage, type GalleryPhoto, type GalleryRegion } from '@/lib/admin';

const REGIONS = [
  { value: 'usa', label: 'Estados Unidos' },
  { value: 'rd', label: 'República Dominicana' },
  { value: 'eu', label: 'Europa' },
];
const NEW_ALBUM = '__new__';

type Picked = { uri: string; width: number; height: number };

export default function AdminGaleria() {
  const { access, ready } = useAdmin();
  const { width } = useWindowDimensions();
  const thumb = (width - 32 - 24) / 4;
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [region, setRegion] = useState<GalleryRegion>('usa');
  const [albums, setAlbums] = useState<{ title: string; orden: number }[]>([]);
  const [album, setAlbum] = useState(NEW_ALBUM);
  const [newAlbum, setNewAlbum] = useState('');
  const [cover, setCover] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [mode, setMode] = useState<'upload' | 'manage'>('upload');
  const [managed, setManaged] = useState<GalleryPhoto[]>([]);
  const [managedLoading, setManagedLoading] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<GalleryPhoto | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editRegion, setEditRegion] = useState<GalleryRegion>('usa');
  const [editOrder, setEditOrder] = useState('1');
  const [replacePhoto, setReplacePhoto] = useState<Picked | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const loadManaged = async () => {
    setManagedLoading(true);
    try { setManaged(await listGalleryPhotos(region)); }
    catch (error) { Alert.alert('No se pudo cargar la galería', error instanceof Error ? error.message : ''); }
    finally { setManagedLoading(false); }
  };

  useEffect(() => {
    if (!access?.isSuperAdmin || access.isRevoked) return;
    Promise.all([listGalleryAlbums(region), listGalleryPhotos(region)])
      .then(([list, galleryPhotos]) => { setAlbums(list); setAlbum(list[0]?.title ?? NEW_ALBUM); setManaged(galleryPhotos); })
      .catch(() => setAlbums([]));
  }, [access, region]);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permite el acceso a Fotos', 'Necesitamos acceso para elegir las imágenes que quieres subir.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 30, quality: 1 });
    if (result.canceled) return;
    setPhotos((cur) => [...cur, ...result.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height }))]);
  };

  const albumTitle = album === NEW_ALBUM ? newAlbum.trim() : album;
  const albumOrden = album === NEW_ALBUM
    ? (albums.length * 1000 + 1)
    : Math.max(albums.find((a) => a.title === album)?.orden ?? 1, ...managed.filter((photo) => photo.texto === album).map((photo) => photo.orden)) + 1;

  const upload = async () => {
    if (!photos.length) return Alert.alert('Elige fotos', 'Selecciona al menos una foto de tu teléfono.');
    if (albumTitle.length < 3) return Alert.alert('Nombre de la galería', 'Escribe el nombre de la galería, por ejemplo "Picnic de Verano 2026".');
    setProgress({ done: 0, total: photos.length });
    let failed = 0;
    for (let i = 0; i < photos.length; i += 1) {
      try {
        const url = await uploadImage(photos[i].uri, photos[i], 'galeria');
        await addGalleryPhoto({ url, region, album: albumTitle, orden: albumOrden + i, portada: cover && i === 0 });
      } catch {
        failed += 1;
      }
      setProgress({ done: i + 1, total: photos.length });
    }
    setProgress(null);
    tapFeedback();
    if (failed) Alert.alert('Subida incompleta', `${photos.length - failed} de ${photos.length} fotos se subieron. Revisa tu conexión e inténtalo de nuevo con las que faltan.`);
    else Alert.alert('¡Listo!', `${photos.length} ${photos.length === 1 ? 'foto subida' : 'fotos subidas'} a "${albumTitle}".`, [{ text: 'OK', onPress: () => router.back() }]);
  };

  const busy = progress !== null;
  const groups = [...new Set(managed.map((photo) => photo.texto || 'Sin categoría'))].map((title) => {
    const galleryPhotos = managed.filter((photo) => (photo.texto || 'Sin categoría') === title).sort((a, b) => a.orden - b.orden);
    return { title, photos: galleryPhotos, order: Math.min(...galleryPhotos.map((photo) => photo.orden)) };
  }).sort((a, b) => a.order - b.order);

  const editManagedPhoto = (photo: GalleryPhoto) => { setEditingPhoto(photo); setEditTitle(photo.texto || ''); setEditOrder(String(photo.orden || 1)); setEditRegion(photo.categoria as GalleryRegion); setReplacePhoto(null); };
  const pickReplacement = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Permite el acceso a Fotos', 'Necesitamos acceso para elegir una imagen nueva.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled) return;
    const image = result.assets[0]; setReplacePhoto({ uri: image.uri, width: image.width, height: image.height });
  };
  const saveManagedPhoto = async () => {
    if (!editingPhoto) return;
    setSavingEdit(true);
    try {
      const fotoUrl = replacePhoto ? await uploadImage(replacePhoto.uri, replacePhoto, 'galeria') : editingPhoto.foto_url;
      await saveGalleryPhoto(editingPhoto.id, { foto_url: fotoUrl, categoria: editRegion, texto: editTitle.trim(), orden: Math.max(1, Number(editOrder) || 1) });
      if (editingPhoto.portada && (editTitle.trim() !== editingPhoto.texto || editRegion !== editingPhoto.categoria)) {
        const { error } = await supabase.from('galeria').update({ portada: false }).eq('categoria', editRegion).eq('texto', editTitle.trim()).neq('id', editingPhoto.id);
        if (error) throw error;
        await saveGalleryPhoto(editingPhoto.id, { portada: true });
      }
      setEditingPhoto(null); await loadManaged();
    } catch (error) { Alert.alert('No se pudo guardar', error instanceof Error ? error.message : ''); }
    finally { setSavingEdit(false); }
  };
  const manage = async (action: () => Promise<unknown>, success?: string) => {
    try { await action(); await loadManaged(); if (success) Alert.alert(success); }
    catch (error) { Alert.alert('No se pudo actualizar la galería', error instanceof Error ? error.message : ''); }
  };
  const deletePhoto = (photo: GalleryPhoto) => Alert.alert('Eliminar foto', 'Esta foto dejará de aparecer en la galería. Esta acción no se puede deshacer.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: () => { void manage(() => removeGalleryPhoto(photo.id)); } },
  ]);

  if (!ready) return <ActivityIndicator color={C.wine} style={{ marginTop: 40 }} />;
  if (!access) return <AdminLogin />;
  if (access.isRevoked || !access.isSuperAdmin) return <View style={s.page}><Row icon="lock-closed" label="Solo Super Admin puede administrar la galería." chevron={false} /></View>;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerLeft: () => <Pressable hitSlop={10} disabled={busy} onPress={() => router.back()}><Text style={s.cancel}>Cancelar</Text></Pressable>,
          headerRight: () => mode === 'upload' ? (
            <Pressable hitSlop={10} disabled={busy} onPress={() => { void upload(); }}>
              <Text style={[s.done, (busy || !photos.length) && { opacity: 0.45 }]}>{busy ? `${progress!.done}/${progress!.total}` : 'Subir'}</Text>
            </Pressable>
          ) : null,
        }}
      />
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <View style={s.modeSwitch}>
          <Pressable onPress={() => setMode('upload')} style={[s.modeOption, mode === 'upload' && s.modeSelected]}><Text style={[s.modeText, mode === 'upload' && s.modeTextSelected]}>Subir fotos</Text></Pressable>
          <Pressable onPress={() => { setMode('manage'); void loadManaged(); }} style={[s.modeOption, mode === 'manage' && s.modeSelected]}><Text style={[s.modeText, mode === 'manage' && s.modeTextSelected]}>Administrar galería</Text></Pressable>
        </View>
        {mode === 'upload' ? <>
        <View style={s.grid}>
          {photos.map((p, i) => (
            <Pressable key={p.uri + i} onLongPress={() => setPhotos((cur) => cur.filter((_, j) => j !== i))} style={{ width: thumb, height: thumb }}>
              <Image source={{ uri: p.uri }} style={s.thumb} contentFit="cover" />
              {cover && i === 0 ? <View style={s.coverBadge}><Ionicons name="star" size={11} color="#fff" /></View> : null}
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={() => { tapFeedback(); void pick(); }} style={[s.add, { width: thumb, height: thumb }]} disabled={busy}>
            <Ionicons name="add" size={28} color={C.wine} />
            <Text style={s.addText}>Fotos</Text>
          </Pressable>
        </View>
        <Text style={s.hint}>{photos.length ? `${photos.length} seleccionadas · mantén pulsada una foto para quitarla` : 'Toca “Fotos” para elegir del carrete.'}</Text>

        <Group header="Dónde se publican" footer="Las fotos se optimizan automáticamente antes de subirse, igual que en la web.">
          <FieldRow label="País">
            <WheelPicker title="País" value={region} options={REGIONS} onChange={(v) => setRegion(v as GalleryRegion)} />
          </FieldRow>
          <FieldRow label="Galería">
            <WheelPicker
              title="Galería"
              value={album}
              options={[...albums.map((a) => ({ value: a.title, label: a.title })), { value: NEW_ALBUM, label: '＋ Nueva galería' }]}
              onChange={setAlbum}
            />
          </FieldRow>
          {album === NEW_ALBUM ? (
            <InputRow label="Nombre de la nueva galería" value={newAlbum} onChangeText={setNewAlbum} placeholder="Ej. Picnic de Verano 2026" />
          ) : null}
          <SwitchRow icon="star" tint="#c08a3e" label="Usar la primera como portada" value={cover} onValueChange={setCover} />
        </Group>

        {busy ? (
          <Group>
            <Row label={`Subiendo ${progress!.done} de ${progress!.total}…`} chevron={false} />
          </Group>
        ) : null}
        </> : <>
          <Group header="Comunidad"><FieldRow label="País"><WheelPicker title="Comunidad de la galería" value={region} options={REGIONS} onChange={(value) => setRegion(value as GalleryRegion)} /></FieldRow></Group>
          {managedLoading ? <ActivityIndicator color={C.wine} style={{ marginTop: 24 }} /> : groups.length ? groups.map((group) => <AdminGestureRow key={group.title} onReorder={(steps) => void manage(async () => { for (let i = 0; i < Math.abs(steps); i += 1) await reorderGalleryAlbum(region, group.title, steps < 0 ? -1 : 1); })} stepHeight={320}>
          <Group header={group.title} footer={`${group.photos.length} ${group.photos.length === 1 ? 'foto' : 'fotos'} · Mantén pulsado y arrastra para ordenar galerías`}>
            {group.photos.map((photo) => <AdminGestureRow key={photo.id} onEdit={() => editManagedPhoto(photo)} onDelete={() => deletePhoto(photo)} onReorder={(steps) => void manage(async () => { for (let i = 0; i < Math.abs(steps); i += 1) await reorderGalleryPhoto(region, group.title, photo.id, steps < 0 ? -1 : 1); })} stepHeight={112}>
            <View style={s.photoRow}>
              <Pressable onPress={() => editManagedPhoto(photo)} style={s.photoMain}><Image source={{ uri: photo.foto_url }} style={s.photoThumb} contentFit="cover" /><View style={{ flex: 1 }}><Text style={s.photoTitle} numberOfLines={2}>{photo.texto || 'Foto de galería'}</Text><Text style={s.photoMeta}>Orden {photo.orden}{photo.portada ? ' · Portada' : ''}</Text></View></Pressable>
              <View style={s.photoActions}>
                <Pressable accessibilityLabel={photo.portada ? 'Foto de portada' : 'Marcar como portada'} onPress={() => void manage(() => setGalleryCover(photo), 'Portada actualizada')} style={s.smallAction}><Ionicons name={photo.portada ? 'star' : 'star-outline'} size={17} color={C.wine} /></Pressable>
              </View>
              <View style={s.activeToggle}><SwitchRow label="Visible" value={photo.activa} onValueChange={(value) => void manage(() => saveGalleryPhoto(photo.id, { activa: value }))} /></View>
            </View>
            </AdminGestureRow>)}
          </Group>
          </AdminGestureRow>) : <Group><Row icon="images-outline" label="Todavía no hay fotos" sub="Elige otra comunidad o sube tus primeras imágenes." chevron={false} /></Group>}
        </>}
      </ScrollView>
      <Modal visible={!!editingPhoto} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingPhoto(null)}>
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalBar}><Pressable onPress={() => setEditingPhoto(null)}><Text style={s.cancel}>Cancelar</Text></Pressable><Text style={s.modalTitle}>Editar foto</Text><Pressable disabled={savingEdit} onPress={() => void saveManagedPhoto()}><Text style={s.done}>{savingEdit ? 'Guardando…' : 'Guardar'}</Text></Pressable></View>
          <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
            <Image source={{ uri: replacePhoto?.uri ?? editingPhoto?.foto_url }} style={s.editPreview} contentFit="cover" />
            <Pressable onPress={() => void pickReplacement()} style={s.replaceButton}><Text style={s.replaceText}>Cambiar imagen</Text></Pressable>
            <FieldRow label="Comunidad"><WheelPicker title="Comunidad" value={editRegion} options={REGIONS} onChange={(value) => setEditRegion(value as GalleryRegion)} /></FieldRow>
            <InputRow label="Categoría" value={editTitle} onChangeText={setEditTitle} />
            <InputRow label="Orden" value={editOrder} onChangeText={(value) => setEditOrder(value.replace(/\D/g, ''))} keyboardType="number-pad" />
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, paddingBottom: 80 },
  cancel: { fontFamily: sans, fontSize: 17, color: C.wine, marginHorizontal: 8 },
  done: { fontFamily: sans, fontSize: 17, fontWeight: '700', color: C.wine, marginHorizontal: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  thumb: { width: '100%', height: '100%', borderRadius: 12, backgroundColor: C.sand },
  coverBadge: { position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: '#c08a3e', alignItems: 'center', justifyContent: 'center' },
  add: { borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(166,75,67,0.4)', backgroundColor: C.fill, alignItems: 'center', justifyContent: 'center', gap: 2 },
  addText: { fontFamily: sans, fontSize: 12, fontWeight: '600', color: C.wine },
  hint: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 10, marginLeft: 4 },
  modeSwitch: { flexDirection: 'row', padding: 4, borderRadius: 15, backgroundColor: '#eee5e3', marginBottom: 18 },
  modeOption: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modeSelected: { backgroundColor: C.card, boxShadow: '0 2px 8px rgba(63,38,35,0.09)' },
  modeText: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.muted },
  modeTextSelected: { color: C.wine },
  albumOrder: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  orderLabel: { flex: 1, fontFamily: sans, fontSize: 12, color: C.muted },
  smallAction: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: C.fill },
  photoRow: { padding: 10, gap: 8 },
  photoMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  photoThumb: { width: 62, height: 62, borderRadius: 12, backgroundColor: C.sand },
  photoTitle: { fontFamily: sans, fontSize: 14, fontWeight: '600', color: C.ink },
  photoMeta: { fontFamily: sans, fontSize: 12, color: C.muted, marginTop: 3 },
  photoActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 7 },
  activeToggle: { marginTop: -8 },
  modalBar: { height: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  modalTitle: { fontFamily: sans, fontSize: 16, fontWeight: '600', color: C.ink },
  editPreview: { width: '100%', height: 240, borderRadius: 20, backgroundColor: C.sand, marginBottom: 12 },
  replaceButton: { alignSelf: 'center', padding: 12 },
  replaceText: { fontFamily: sans, color: C.wine, fontWeight: '600' },
});
