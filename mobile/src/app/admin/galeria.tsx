import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { FieldRow, Group, InputRow, Row, SwitchRow } from '@/components/form';
import { AdminLogin } from '@/components/admin-login';
import { tapFeedback } from '@/components/ui';
import { WheelPicker } from '@/components/wheel-picker';
import { C, sans } from '@/constants/theme';
import { AdminGestureRow } from '@/components/admin-gesture-row';
import { supabase } from '@/lib/supabase';
import { useAdmin } from '@/lib/use-admin';
import { addGalleryPhoto, canAdmin, listGalleryAlbums, listGalleryPhotos, removeGalleryPhoto, reorderGalleryAlbum, saveGalleryPhoto, setGalleryCover, uploadImage, type GalleryPhoto, type GalleryRegion } from '@/lib/admin';
import { SheetModal } from '@/components/sheet-modal';
import { usePullToRefresh } from '@/components/pull-refresh';

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
  const [mode, setMode] = useState<'upload' | 'manage'>('manage');
  const [managed, setManaged] = useState<GalleryPhoto[]>([]);
  const [managedLoading, setManagedLoading] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<GalleryPhoto | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editRegion, setEditRegion] = useState<GalleryRegion>('usa');
  const [editOrder, setEditOrder] = useState('1');
  const [replacePhoto, setReplacePhoto] = useState<Picked | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [openAlbum, setOpenAlbum] = useState<string | null>(null);

  const loadManaged = async () => {
    setManagedLoading(true);
    try { setManaged(await listGalleryPhotos(region)); }
    catch (error) { Alert.alert('No se pudo cargar la galería', error instanceof Error ? error.message : ''); }
    finally { setManagedLoading(false); }
  };

  const refreshAll = async () => {
    const [list, galleryPhotos] = await Promise.all([listGalleryAlbums(region), listGalleryPhotos(region)]);
    setAlbums(list);
    setManaged(galleryPhotos);
  };
  const pull = usePullToRefresh(refreshAll);

  useEffect(() => {
    if (!canAdmin(access,'gallery','view')) return;
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
  const toggleVisible = async (photo: GalleryPhoto) => {
    tapFeedback();
    const next = !photo.activa;
    setManaged((cur) => cur.map((p) => (p.id === photo.id ? { ...p, activa: next } : p)));
    try { await saveGalleryPhoto(photo.id, { activa: next }); }
    catch (error) {
      setManaged((cur) => cur.map((p) => (p.id === photo.id ? { ...p, activa: !next } : p)));
      Alert.alert('No se pudo actualizar', error instanceof Error ? error.message : '');
    }
  };
  const deletePhoto = (photo: GalleryPhoto) => Alert.alert('Eliminar foto', 'Esta foto dejará de aparecer en la galería. Esta acción no se puede deshacer.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: () => { void manage(() => removeGalleryPhoto(photo.id)); } },
  ]);

  if (!ready) return <ActivityIndicator color={C.wine} style={{ marginTop: 40 }} />;
  if (!access) return <AdminLogin />;
  if (!canAdmin(access,'gallery','view') && !canAdmin(access,'gallery','add') && !canAdmin(access,'gallery','edit') && !canAdmin(access,'gallery','delete')) return <View style={s.page}><Row icon="lock-closed" label="Tu cuenta no tiene acceso a la galería." chevron={false} /></View>;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerLeft: () => <Pressable hitSlop={10} disabled={busy} onPress={() => router.back()}><Text style={s.cancel}>Cancelar</Text></Pressable>,
          headerRight: () => mode === 'upload' && canAdmin(access,'gallery','add') ? (
            <Pressable hitSlop={10} disabled={busy} onPress={() => { void upload(); }}>
              <Text style={[s.done, (busy || !photos.length) && { opacity: 0.45 }]}>{busy ? `${progress!.done}/${progress!.total}` : 'Subir'}</Text>
            </Pressable>
          ) : null,
        }}
      />
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" refreshControl={pull.control}>
        <View style={s.modeSwitch}>
          {canAdmin(access,'gallery','view') || canAdmin(access,'gallery','edit') ? <Pressable onPress={() => { setMode('manage'); void loadManaged(); }} style={[s.modeOption, mode === 'manage' && s.modeSelected]}><Text style={[s.modeText, mode === 'manage' && s.modeTextSelected]}>Administrar galería</Text></Pressable> : null}
          {canAdmin(access,'gallery','add') ? <Pressable onPress={() => setMode('upload')} style={[s.modeOption, mode === 'upload' && s.modeSelected]}><Text style={[s.modeText, mode === 'upload' && s.modeTextSelected]}>Subir fotos</Text></Pressable> : null}
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
          {openAlbum && groups.some((g) => g.title === openAlbum) ? (() => {
            const group = groups.find((g) => g.title === openAlbum)!;
            const hidden = group.photos.filter((p) => !p.activa).length;
            const tile = (width - 32 - 16) / 3;
            return <>
              <Pressable accessibilityRole="button" onPress={() => setOpenAlbum(null)} style={s.backRow}>
                <Ionicons name="chevron-back" size={18} color={C.wine} /><Text style={s.backText}>Galerías</Text>
              </Pressable>
              <Text style={s.albumHeading}>{group.title}</Text>
              <Text style={s.albumSub}>{group.photos.length} {group.photos.length === 1 ? 'foto' : 'fotos'}{hidden ? ` · ${hidden} ${hidden === 1 ? 'oculta' : 'ocultas'}` : ''}</Text>
              <View style={s.legend}>
                <View style={s.legendItem}><Ionicons name="eye" size={14} color={C.wine} /><Text style={s.legendText}>Visible en la web y la app</Text></View>
                <View style={s.legendItem}><Ionicons name="eye-off" size={14} color={C.muted} /><Text style={s.legendText}>Oculta</Text></View>
              </View>
              <View style={s.photoGrid}>
                {group.photos.map((photo) => (
                  <Pressable key={photo.id} onPress={canAdmin(access,'gallery','edit') || canAdmin(access,'gallery','delete') ? () => editManagedPhoto(photo) : undefined} accessibilityLabel={`Foto ${photo.orden}`} style={[s.tile, { width: tile, height: tile }]}>
                    <Image source={{ uri: photo.foto_url }} style={[s.tileImage, !photo.activa && { opacity: 0.35 }]} contentFit="cover" />
                    {photo.portada ? <View style={s.tileStar}><Ionicons name="star" size={11} color="#fff" /></View> : null}
                    <Pressable
                      accessibilityRole="switch"
                      accessibilityState={{ checked: photo.activa }}
                      accessibilityLabel={photo.activa ? 'Visible. Toca para ocultar' : 'Oculta. Toca para mostrar'}
                      hitSlop={6}
                      disabled={!canAdmin(access,'gallery','edit')}
                      onPress={() => void toggleVisible(photo)}
                      style={[s.eye, !photo.activa && s.eyeOff]}>
                      <Ionicons name={photo.activa ? 'eye' : 'eye-off'} size={16} color={photo.activa ? C.wine : '#fff'} />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
              <Text style={s.hint}>Toca el ojo para mostrar u ocultar. Las opciones disponibles dependen de tus permisos.</Text>
            </>;
          })() : <>
          <Group header="Comunidad"><FieldRow label="País"><WheelPicker title="Comunidad de la galería" value={region} options={REGIONS} onChange={(value) => { setOpenAlbum(null); setRegion(value as GalleryRegion); }} /></FieldRow></Group>
          {managedLoading ? <ActivityIndicator color={C.wine} style={{ marginTop: 24 }} /> : groups.length ? <>
            <Text style={s.sectionHeader}>Galerías · {groups.length}</Text>
            <View style={s.albumList}>
              {groups.map((group) => {
                const coverPhoto = group.photos.find((p) => p.portada) ?? group.photos[0];
                const hidden = group.photos.filter((p) => !p.activa).length;
                return (
                  <AdminGestureRow key={group.title} onReorder={canAdmin(access,'gallery','edit') ? (steps) => void manage(async () => { for (let i = 0; i < Math.abs(steps); i += 1) await reorderGalleryAlbum(region, group.title, steps < 0 ? -1 : 1); }) : undefined} stepHeight={96}>
                    <Pressable accessibilityRole="button" onPress={() => { tapFeedback(); setOpenAlbum(group.title); }} style={({ pressed }) => [s.albumCard, pressed && { opacity: 0.85 }]}>
                      <Image source={{ uri: coverPhoto?.foto_url }} style={s.albumCover} contentFit="cover" />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.albumTitle} numberOfLines={2}>{group.title}</Text>
                        <Text style={s.albumMeta}>{group.photos.length} {group.photos.length === 1 ? 'foto' : 'fotos'}{hidden ? ` · ${hidden} ${hidden === 1 ? 'oculta' : 'ocultas'}` : ''}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="rgba(60,40,38,0.3)" />
                    </Pressable>
                  </AdminGestureRow>
                );
              })}
            </View>
            <Text style={s.hint}>Mantén pulsada una galería y arrástrala para cambiar el orden.</Text>
          </> : <Group><Row icon="images-outline" label="Todavía no hay fotos" sub="Elige otra comunidad o sube tus primeras imágenes." chevron={false} /></Group>}
          </>}
        </>}
      </ScrollView>
      <SheetModal visible={!!editingPhoto} onRequestClose={() => setEditingPhoto(null)}>
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalBar}><Pressable onPress={() => setEditingPhoto(null)}><Text style={s.cancel}>Cancelar</Text></Pressable><Text style={s.modalTitle}>Gestionar foto</Text>{canAdmin(access,'gallery','edit') ? <Pressable disabled={savingEdit} onPress={() => void saveManagedPhoto()}><Text style={s.done}>{savingEdit ? 'Guardando…' : 'Guardar'}</Text></Pressable> : <View />}</View>
          <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
            <Image source={{ uri: replacePhoto?.uri ?? editingPhoto?.foto_url }} style={s.editPreview} contentFit="cover" />
            {canAdmin(access,'gallery','edit') ? <Pressable onPress={() => void pickReplacement()} style={s.replaceButton}><Text style={s.replaceText}>Cambiar imagen</Text></Pressable> : null}
            <FieldRow label="Comunidad"><WheelPicker title="Comunidad" value={editRegion} options={REGIONS} onChange={(value) => setEditRegion(value as GalleryRegion)} /></FieldRow>
            <InputRow label="Categoría" value={editTitle} onChangeText={setEditTitle} editable={canAdmin(access,'gallery','edit')} />
            <InputRow label="Orden" value={editOrder} onChangeText={(value) => setEditOrder(value.replace(/\D/g, ''))} editable={canAdmin(access,'gallery','edit')} keyboardType="number-pad" />
            {editingPhoto ? <Group>
              {canAdmin(access,'gallery','edit') ? <Row icon={editingPhoto.portada ? 'star' : 'star-outline'} tint="#c08a3e" label={editingPhoto.portada ? 'Es la portada de la galería' : 'Usar como portada'} chevron={false} onPress={editingPhoto.portada ? undefined : () => { const photo = editingPhoto; setEditingPhoto(null); void manage(() => setGalleryCover(photo), 'Portada actualizada'); }} /> : null}
              {canAdmin(access,'gallery','delete') ? <Row icon="trash-outline" tint={C.live} label="Eliminar foto" destructive chevron={false} onPress={() => { const photo = editingPhoto; setEditingPhoto(null); deletePhoto(photo); }} /> : null}
            </Group> : null}
          </ScrollView>
        </View>
      </SheetModal>
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
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 6 },
  backText: { fontFamily: sans, fontSize: 16, color: C.wine, fontWeight: '600' },
  albumHeading: { fontFamily: sans, fontSize: 26, fontWeight: '700', letterSpacing: -0.5, color: C.ink, marginTop: 6 },
  albumSub: { fontFamily: sans, fontSize: 14, color: C.muted, marginTop: 2 },
  legend: { flexDirection: 'row', gap: 16, marginTop: 12, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontFamily: sans, fontSize: 12, color: C.muted },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { borderRadius: 14, overflow: 'hidden', backgroundColor: C.sand },
  tileImage: { width: '100%', height: '100%' },
  tileStar: { position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#c08a3e', alignItems: 'center', justifyContent: 'center' },
  eye: { position: 'absolute', top: 6, right: 6, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' },
  eyeOff: { backgroundColor: 'rgba(40,24,22,0.78)' },
  sectionHeader: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 24, marginBottom: 8, marginLeft: 16 },
  albumList: { gap: 10 },
  albumCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, borderRadius: 18, backgroundColor: C.card, boxShadow: '0 1px 2px rgba(63,38,35,0.04), 0 6px 18px rgba(63,38,35,0.05)' },
  albumCover: { width: 72, height: 72, borderRadius: 13, backgroundColor: C.sand },
  albumTitle: { fontFamily: sans, fontSize: 16, fontWeight: '600', color: C.ink },
  albumMeta: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 3 },
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
