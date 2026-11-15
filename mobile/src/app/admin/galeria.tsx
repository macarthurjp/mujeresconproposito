import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { FieldRow, Group, InputRow, Row, SwitchRow } from '@/components/form';
import { tapFeedback } from '@/components/ui';
import { WheelPicker } from '@/components/wheel-picker';
import { C, sans } from '@/constants/theme';
import { addGalleryPhoto, listGalleryAlbums, uploadImage, type GalleryRegion } from '@/lib/admin';

const REGIONS = [
  { value: 'usa', label: 'Estados Unidos' },
  { value: 'rd', label: 'República Dominicana' },
  { value: 'eu', label: 'Europa' },
];
const NEW_ALBUM = '__new__';

type Picked = { uri: string; width: number; height: number };

export default function AdminGaleria() {
  const { width } = useWindowDimensions();
  const thumb = (width - 32 - 24) / 4;
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [region, setRegion] = useState<GalleryRegion>('usa');
  const [albums, setAlbums] = useState<{ title: string; orden: number }[]>([]);
  const [album, setAlbum] = useState(NEW_ALBUM);
  const [newAlbum, setNewAlbum] = useState('');
  const [cover, setCover] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    listGalleryAlbums(region)
      .then((list) => { setAlbums(list); setAlbum(list[0]?.title ?? NEW_ALBUM); })
      .catch(() => setAlbums([]));
  }, [region]);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permite el acceso a Fotos', 'Necesitamos acceso para elegir las imágenes que quieres subir.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 30, quality: 1 });
    if (result.canceled) return;
    setPhotos((cur) => [...cur, ...result.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height }))]);
  };

  const albumTitle = album === NEW_ALBUM ? newAlbum.trim() : album;
  const albumOrden = album === NEW_ALBUM ? (albums.reduce((m, a) => Math.max(m, a.orden), 0) + 1) : (albums.find((a) => a.title === album)?.orden ?? 1);

  const upload = async () => {
    if (!photos.length) return Alert.alert('Elige fotos', 'Selecciona al menos una foto de tu teléfono.');
    if (albumTitle.length < 3) return Alert.alert('Nombre de la galería', 'Escribe el nombre de la galería, por ejemplo "Picnic de Verano 2026".');
    setProgress({ done: 0, total: photos.length });
    let failed = 0;
    for (let i = 0; i < photos.length; i += 1) {
      try {
        const url = await uploadImage(photos[i].uri, photos[i], 'galeria');
        await addGalleryPhoto({ url, region, album: albumTitle, orden: albumOrden, portada: cover && i === 0 });
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

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerLeft: () => <Pressable hitSlop={10} disabled={busy} onPress={() => router.back()}><Text style={s.cancel}>Cancelar</Text></Pressable>,
          headerRight: () => (
            <Pressable hitSlop={10} disabled={busy} onPress={() => { void upload(); }}>
              <Text style={[s.done, (busy || !photos.length) && { opacity: 0.45 }]}>{busy ? `${progress!.done}/${progress!.total}` : 'Subir'}</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
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
      </ScrollView>
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
});
