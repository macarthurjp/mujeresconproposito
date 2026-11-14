import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Eyebrow, ErrorNote, Section, styles as ui, Title, useAsync } from '@/components/ui';
import { C, TAB_BAR_SPACE, serif, SOUNDCLOUD_URL, sans } from '@/constants/theme';
import { api } from '@/lib/api';

const galleryRegions = [
  { key: 'usa', label: 'Estados Unidos', match: /estados|usa|eeuu|united/i },
  { key: 'rd', label: 'República Dominicana', match: /dominicana|\brd\b/i },
  { key: 'eu', label: 'Europa', match: /europa|europe|luxem|belg|españa|francia/i },
];

// Accepts "MM-DD" (public API, no year) or a full "YYYY-MM-DD".
function birthdayDateLabel(value: string) {
  const iso = /^\d{2}-\d{2}$/.test(value) ? `2000-${value}` : value;
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${iso}T12:00:00Z`))
    .replace('.', '')
    .toUpperCase();
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const posterWidth = screenWidth - 48;
  const destacadas = useAsync(api.destacadas);
  const galeria = useAsync(api.galeria);
  const videos = useAsync(api.videos);
  const birthdays = useAsync(api.birthdays);
  const [selectedGalleryRegion, setSelectedGalleryRegion] = useState('usa');
  const galleryCardWidth = screenWidth - 72;
  const galleryImages = useMemo(() => {
    const region = galleryRegions.find((item) => item.key === selectedGalleryRegion)!;
    return (galeria.data ?? []).filter((photo) => region.match.test(photo.categoria)).slice(0, 8);
  }, [galeria.data, selectedGalleryRegion]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_SPACE }}>
      {/* Hero */}
      <View style={[s.hero, { paddingTop: insets.top + 20 }]}>
        <View style={s.brandRow}>
          <View style={s.mark}>
            <Image source={require('@/assets/images/mcp-mark.png')} style={{ width: 70, height: 70 }} />
          </View>
          <View>
            <Text style={s.brand}>Mujeres con Propósito</Text>
            <Text style={s.brandSub}>930 A.S.B.L.</Text>
          </View>
        </View>
        <Eyebrow>Comunidad cristiana internacional</Eyebrow>
        <Title size={42} editorial>
          Bienvenida a <Text style={{ fontStyle: 'italic', color: C.wine }}>Mujeres</Text> con Propósito
        </Title>
        <Text style={s.heroCopy}>
          Un espacio donde la fe, la hermandad y el propósito se unen para transformar vidas.
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
          <Button label="Únete a la comunidad" icon="person-add-outline" variant="primary" onPress={() => router.push('/(tabs)/unirse')} />
          <Pressable onPress={() => router.push('/eventos')} style={s.heroLink}><Text style={s.heroLinkText}>Ver actividades</Text><Ionicons name="arrow-forward" size={16} color={C.wine} /></Pressable>
        </View>
        <View style={s.heroStats}>
          {[['Fe', 'Devocionales y oración'], ['Comunidad', 'Mujeres creciendo juntas'], ['Propósito', 'Encuentros y enseñanzas']].map(([label, note]) => <View key={label} style={s.heroStat}><Text style={s.heroStatTitle}>{label}</Text><Text style={s.heroStatText}>{note}</Text></View>)}
        </View>
      </View>

      {/* Destacadas — first content section, matching the website */}
      {destacadas.data?.length ? (
        <Section eyebrow="Voces que inspiran" title="Destacadas">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={posterWidth + 18} decelerationRate="fast" contentContainerStyle={s.portraitList}>
            {destacadas.data.slice(0, 8).map((d) => (
              <Pressable key={d.id} onPress={() => router.push('/destacadas')} style={[s.portrait, { width: posterWidth }]}>
                <View style={s.portraitGlow}>
                  <View style={s.portraitShell}>
                  <View style={s.portraitFrame}>
                    <Image source={{ uri: d.foto_url }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={24} transition={200} />
                    <View style={s.portraitWarmGlow} />
                    <Image source={{ uri: d.foto_url }} style={StyleSheet.absoluteFill} contentFit="contain" transition={200} />
                  </View>
                  </View>
                </View>
                <Text style={s.portraitName}>{d.nombre}</Text>
                {d.titulo ? <Text style={s.portraitRole}>{d.titulo}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
        </Section>
      ) : null}

      {/* Scripture */}
      <View style={s.verse}>
        <Text style={s.quote}>“</Text>
        <Text style={s.verseText}>El Señor cumplirá en mí su propósito. Tu gran amor, Señor, perdura para siempre; ¡no abandones la obra de tus manos!</Text>
        <Text style={[ui.eyebrow, { textAlign: 'center', marginTop: 14 }]}>Salmo 138:8</Text>
      </View>

      {/* About */}
      <Section eyebrow="Nosotras" title="¿Quiénes somos?">
        <Text style={ui.body}>Nuestra misión, visión y propósito</Text>
        <Text style={[ui.body, { marginTop: 12 }]}>Somos una comunidad internacional cristiana de mujeres que crecen en la fe, caminan juntas y se impulsan a vivir su propósito y transformar su entorno.</Text>
      </Section>

      {/* Timeline */}
      <Section eyebrow="Desde 2023" title="Nuestra historia">
        <Text style={[ui.body, { marginBottom: 14 }]}>El camino que Dios ha trazado para Mujeres con Propósito.</Text>
        <View style={s.timeline}>{[
          ['2023', 'Nacimiento', 'Nace Mujeres con Propósito.'], ['2024', 'Primer retiro', 'Primer retiro espiritual.'],
          ['2025', 'Expansión', 'Expansión a nuevas ciudades.'], ['2026', 'Comunidad', 'Fortalecimiento de la comunidad y crecimiento digital.'],
        ].map(([year, title, copy]) => <View key={year} style={s.timelineItem}><Text style={s.timelineYear}>{year}</Text><View style={s.timelineRule} /><View style={{ flex: 1 }}><Text style={s.timelineTitle}>{title}</Text><Text style={s.timelineText}>{copy}</Text></View></View>)}</View>
      </Section>

      {/* Ministry */}
      <Section eyebrow="Ministerio" title="Lo que hacemos">
        <Text style={[ui.body, { marginBottom: 18 }]}>Espacios para crecer en la fe, encontrarnos y acompañarnos en oración.</Text>
        <View style={s.ministryGrid}>{[
          { icon: 'book-open-outline', title: 'Devocionales', copy: 'Reflexiones semanales para fortalecer tu caminar con Dios.', action: () => router.push('/(tabs)/devocionales') },
          { icon: 'calendar-outline', title: 'Encuentros', copy: 'Reuniones y actividades para crecer juntas en fe.', action: () => router.push('/eventos') },
          { icon: 'hand-left-outline', title: 'Oración', copy: 'Comparte tus peticiones y permite que oremos contigo.', action: null },
        ].map((item, index) => {
          const content = <>
            <View style={s.ministryCardTop}>
              <View style={s.ministryIcon}><Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={23} color={C.wine} /></View>
              <Text style={s.ministryIndex}>0{index + 1}</Text>
            </View>
            <Text style={s.ministryTitle}>{item.title}</Text>
            <Text style={s.ministryText}>{item.copy}</Text>
            {item.action ? <View style={s.ministryAction}><Text style={s.ministryActionText}>Explorar</Text><Ionicons name="arrow-forward" size={15} color={C.wine} /></View> : null}
          </>;
          return item.action
            ? <Pressable key={item.title} onPress={item.action} style={({ pressed }) => [s.ministryCard, pressed && s.ministryCardPressed]}>{content}</Pressable>
            : <View key={item.title} style={s.ministryCard}>{content}</View>;
        })}</View>
      </Section>

      {/* Join section */}
      <View style={s.joinSection}>
        <Eyebrow>Únete hoy</Eyebrow>
        <Title size={30}>Conecta con mujeres que inspiran, crecen y sirven juntas.</Title>
        <Text style={[ui.body, { marginTop: 12 }]}>Forma parte de una comunidad de fe, apoyo y propósito con actividades para tu crecimiento personal y espiritual.</Text>
        <View style={s.joinHighlight}><Text style={s.joinHighlightTitle}>+ Mentorías</Text><Text style={s.joinHighlightText}>Charlas para líderes femeninas.</Text></View>
        <View style={s.joinHighlight}><Text style={s.joinHighlightTitle}>+ Red de apoyo</Text><Text style={s.joinHighlightText}>Un espacio seguro para crecer juntas.</Text></View>
        <Button label="Quiero unirme" icon="arrow-forward" onPress={() => router.push('/(tabs)/unirse')} style={{ alignSelf: 'flex-start', marginTop: 12 }} />
      </View>

      {/* YouTube */}
      {videos.data?.length ? (
        <Section eyebrow="Canal de YouTube" title="Mensajes que fortalecen tu fe">
          <Text style={[ui.body, { marginTop: -8, marginBottom: 16 }]}>Mensajes, reflexiones y contenido para tu crecimiento espiritual.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.videoTrack}>
            {videos.data.map((v) => (
              <Pressable key={v.id} style={s.video} onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${v.video_id}`)}>
                <Image source={{ uri: `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg` }} style={s.videoImg} contentFit="cover" />
                <View style={s.play}><Ionicons name="play" size={18} color="#fff" /></View>
                <Text style={s.videoTitle} numberOfLines={2}>{v.titulo}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={() => Linking.openURL('https://www.youtube.com/@MujeresconProposito930')} style={s.moreLink}><Text style={s.moreLinkText}>Ver más videos</Text><Ionicons name="arrow-forward" size={16} color={C.wine} /></Pressable>
        </Section>
      ) : null}

      {/* Application promotion: native app content follows the site order */}
      <View style={s.appPromo}>
        <Eyebrow>Nuestra app</Eyebrow>
        <Title size={29}>Tu comunidad, siempre contigo.</Title>
        <Text style={[ui.body, { marginTop: 10 }]}>Devocionales, eventos, música y donaciones en un solo lugar.</Text>
        {['Avisos al instante cuando empieza una reunión.', 'Aportes con QR y datos de cuenta.', 'Galería, destacadas y música a tu alcance.'].map((item) => <View key={item} style={s.appFeature}><Ionicons name="checkmark-circle" size={19} color={C.wine} /><Text style={s.appFeatureText}>{item}</Text></View>)}
      </View>

      {/* Donations */}
      <Section eyebrow="Siembra con nosotras" title="Apoya nuestra misión">
        <Text style={ui.body}>Tu generosidad nos permite seguir compartiendo esperanza, fe y propósito con mujeres alrededor del mundo. Cada aporte es una semilla que Dios multiplica.</Text>
        <Text style={s.donateVerse}>“Cada uno dé como propuso en su corazón; no con tristeza, ni por obligación, porque Dios ama al dador alegre.” — 2 Corintios 9:7</Text>
        <Button label="Quiero aportar" icon="heart-outline" onPress={() => router.push('/aportar')} style={{ alignSelf: 'flex-start', marginTop: 16 }} />
      </Section>

      {/* Gallery */}
      <Section eyebrow="Momentos" title="Galería">
        <View style={s.galleryRegion}><Text style={s.galleryRegionTitle}>{galleryRegions.find((item) => item.key === selectedGalleryRegion)?.label}</Text><Pressable onPress={() => router.push('/galeria')}><Text style={s.moreLinkText}>Ver toda la galería  →</Text></Pressable></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.regionPills}>
          {galleryRegions.map((region) => <Pressable key={region.key} onPress={() => setSelectedGalleryRegion(region.key)} style={[s.regionPill, selectedGalleryRegion === region.key && s.regionPillActive]}><Text style={[s.regionPillText, selectedGalleryRegion === region.key && s.regionPillTextActive]}>{region.label}</Text></Pressable>)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={galleryCardWidth + 16} contentContainerStyle={s.galleryTrack}>
          {galleryImages.map((photo, index) => <Pressable key={photo.id} onPress={() => router.push('/galeria')} style={[s.galleryCard, { width: galleryCardWidth, height: index % 2 === 0 ? 270 : 236 }]}>
            <Image source={{ uri: photo.foto_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
            <View style={s.galleryGlow} />
            <View style={s.galleryCaption}><Text style={s.galleryCaptionEyebrow}>{galleryRegions.find((item) => item.key === selectedGalleryRegion)?.label}</Text><Text style={s.galleryCaptionText} numberOfLines={2}>{photo.texto || 'Un momento juntas, creciendo en fe y propósito'}</Text></View>
            <View style={s.galleryOpen}><Ionicons name="expand-outline" size={16} color="#fff" /></View>
          </Pressable>)}
        </ScrollView>
        {!galeria.loading && !galleryImages.length ? <Text style={[ui.body, { paddingHorizontal: 20 }]}>Explora fotos de nuestra comunidad por región.</Text> : null}
      </Section>

      {/* SoundCloud */}
      <Section eyebrow="Celebramos juntas" title="Cumpleaños">
        {birthdays.error ? <ErrorNote message={birthdays.error} onRetry={birthdays.reload} /> : null}
        {birthdays.data?.cumpleanerasHoy?.length ? (
          <Card style={s.birthdayToday}>
            <View style={s.birthdayIcon}><Ionicons name="gift-outline" size={22} color={C.wine} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.birthdayTodayEyebrow}>Hoy celebramos</Text>
              {birthdays.data.cumpleanerasHoy.map((person, index) => <Text key={`${person.nombreCompleto}-${index}`} style={s.birthdayTodayName}>{person.nombreCompleto}</Text>)}
              <Text style={s.birthdayTodayCopy}>¡Que tengas un día lleno de alegría y bendiciones!</Text>
            </View>
          </Card>
        ) : !birthdays.error ? <View style={s.birthdayQuiet}><Ionicons name="heart-outline" size={19} color={C.wine} /><Text style={s.birthdayQuietText}>Hoy no tenemos cumpleaños registrados.</Text></View> : null}
        <Text style={s.upcomingBirthdayHeading}>Esta semana</Text>
        {birthdays.data?.proximosCumpleanos?.length ? (
          <View style={s.upcomingBirthdayList}>{birthdays.data.proximosCumpleanos.map((person, index) => (
            <View key={`${person.nombreCompleto}-${person.fecha}-${index}`} style={s.upcomingBirthdayRow}>
              <View style={s.birthdayDateBadge}><Text style={s.birthdayDateText}>{person.fecha ? birthdayDateLabel(person.fecha) : 'PRONTO'}</Text></View>
              <Text style={s.upcomingBirthdayName}>{person.nombreCompleto}</Text>
              <Text style={s.daysUntil}>{person.dias === 1 ? 'Mañana' : `En ${person.dias} días`}</Text>
            </View>
          ))}</View>
        ) : !birthdays.error ? <Text style={s.noUpcomingBirthdays}>No hay cumpleaños próximos registrados.</Text> : null}
      </Section>

      <Pressable onPress={() => Linking.openURL(SOUNDCLOUD_URL)} style={s.audioCard}>
        <View style={s.audioIcon}><Ionicons name="headset-outline" size={23} color={C.wine} /></View>
        <View style={{ flex: 1 }}><Eyebrow>Porción</Eyebrow><Text style={s.audioTitle}>Escucha nuestros audios</Text><Text style={s.audioCopy}>Mensajes y reflexiones de Mujeres con Propósito.</Text></View>
        <Ionicons name="arrow-forward-circle" size={26} color={C.wine} />
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: '#f9e1dc', paddingHorizontal: 22, paddingBottom: 36, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 32 },
  mark: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: '#fff7f5', alignItems: 'center', justifyContent: 'center' },
  brand: { fontFamily: serif, color: C.ink, fontSize: 18 },
  brandSub: { color: C.muted, fontSize: 10, letterSpacing: 2, marginTop: 2 },
  heroCopy: { color: C.muted, fontSize: 16, lineHeight: 24, marginTop: 14 },
  heroLink: { minHeight: 50, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  heroLinkText: { color: C.wine, fontSize: 14, fontWeight: '700' },
  heroStats: { flexDirection: 'row', marginTop: 28, gap: 8 },
  heroStat: { flex: 1, borderLeftWidth: 2, borderLeftColor: C.rose, paddingLeft: 8 },
  heroStatTitle: { color: C.ink, fontSize: 12, fontWeight: '800' },
  heroStatText: { color: C.muted, fontSize: 10, lineHeight: 14, marginTop: 4 },
  verse: { marginTop: 44, paddingHorizontal: 28, alignItems: 'center' },
  quote: { fontFamily: serif, fontSize: 64, lineHeight: 64, color: C.gold, height: 44 },
  verseText: { fontFamily: serif, fontStyle: 'italic', fontSize: 22, lineHeight: 30, color: C.ink, textAlign: 'center' },
  portraitList: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 10, gap: 18 },
  portrait: { width: '100%' },
  portraitGlow: { borderRadius: 36, padding: 2, backgroundColor: 'rgba(166,75,67,0.12)', boxShadow: '0 0 34px rgba(166,75,67,0.28), 0 12px 32px rgba(63,38,35,0.12)' },
  portraitShell: { borderRadius: 32, padding: 5, backgroundColor: '#fff8f7', borderWidth: 1, borderColor: 'rgba(166,75,67,0.34)' },
  portraitFrame: { width: '100%', aspectRatio: 3 / 4, borderRadius: 18, overflow: 'hidden', backgroundColor: C.ivory, borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  portraitWarmGlow: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(246,205,166,0.16)' },
  portraitName: { fontFamily: sans, fontWeight: '600', letterSpacing: -0.3, fontSize: 18, lineHeight: 23, color: C.ink, marginTop: 12, flexWrap: 'wrap' },
  portraitRole: { color: C.wine, fontSize: 11, lineHeight: 16, marginTop: 3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700', flexWrap: 'wrap' },
  timeline: { gap: 16 },
  timelineItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timelineYear: { fontFamily: serif, fontSize: 24, color: C.wine, width: 56 },
  timelineRule: { width: 2, alignSelf: 'stretch', backgroundColor: C.rose, borderRadius: 1 },
  timelineTitle: { color: C.ink, fontSize: 15, fontWeight: '700' },
  timelineText: { color: C.muted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  ministryGrid: { gap: 13 },
  ministryCard: { backgroundColor: C.paper, borderRadius: 20, padding: 19, borderWidth: 1, borderColor: 'rgba(184,134,74,0.24)', boxShadow: '0 6px 18px rgba(63,38,35,0.07)' },
  ministryCardPressed: { backgroundColor: '#fffaf5', borderColor: 'rgba(166,75,67,0.45)', transform: [{ scale: 0.985 }] },
  ministryCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  ministryIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  ministryIndex: { color: 'rgba(166,75,67,0.35)', fontFamily: sans, fontWeight: '700', fontSize: 22 },
  ministryTitle: { color: C.ink, fontFamily: sans, fontWeight: '600', letterSpacing: -0.3, fontSize: 19 },
  ministryText: { color: C.muted, fontSize: 14, lineHeight: 21, marginTop: 5 },
  ministryAction: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 13 },
  ministryActionText: { color: C.wine, fontSize: 13, fontWeight: '700' },
  joinSection: { marginTop: 36, marginHorizontal: 20, padding: 22, borderRadius: 24, backgroundColor: '#f8e4df' },
  joinHighlight: { marginTop: 16, borderLeftWidth: 2, borderLeftColor: C.wine, paddingLeft: 12 },
  joinHighlightTitle: { color: C.ink, fontSize: 14, fontWeight: '800' },
  joinHighlightText: { color: C.muted, fontSize: 13, marginTop: 3 },
  videoTrack: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 10, gap: 14 },
  video: { width: 260, padding: 5, borderRadius: 20, backgroundColor: '#fffaf5', borderWidth: 1, borderColor: 'rgba(201,164,107,0.32)', boxShadow: '0 6px 16px rgba(63,38,35,0.1)' },
  videoImg: { width: '100%', height: 146, borderRadius: 15, backgroundColor: C.sand },
  play: { position: 'absolute', top: 57, left: 110, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(28,17,23,0.7)', alignItems: 'center', justifyContent: 'center' },
  videoTitle: { color: C.text, fontSize: 14, fontWeight: '600', marginTop: 8, lineHeight: 19 },
  moreLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start' },
  moreLinkText: { color: C.wine, fontWeight: '700', fontSize: 13 },
  appPromo: { marginTop: 38, marginHorizontal: 20, padding: 22, borderRadius: 22, backgroundColor: C.sand },
  appFeature: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 14 },
  appFeatureText: { flex: 1, color: C.text, fontSize: 13, lineHeight: 19 },
  donateVerse: { color: C.wine, fontFamily: serif, fontStyle: 'italic', fontSize: 17, lineHeight: 24, marginTop: 16 },
  galleryRegion: { paddingHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  galleryRegionTitle: { color: C.ink, fontFamily: sans, fontWeight: '600', letterSpacing: -0.3, fontSize: 17 },
  regionPills: { paddingHorizontal: 20, paddingBottom: 14, gap: 8 },
  regionPill: { minHeight: 34, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(166,75,67,0.2)', backgroundColor: C.sand, justifyContent: 'center' },
  regionPillActive: { backgroundColor: C.wine, borderColor: C.wine },
  regionPillText: { color: C.muted, fontSize: 11, fontWeight: '700' },
  regionPillTextActive: { color: '#fff' },
  galleryTrack: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 14, gap: 16 },
  galleryCard: { borderRadius: 22, overflow: 'hidden', backgroundColor: C.sand, borderWidth: 1, borderColor: 'rgba(201,164,107,0.42)', boxShadow: '0 8px 22px rgba(63,38,35,0.16)' },
  galleryGlow: { ...StyleSheet.absoluteFill, top: '48%', backgroundColor: 'rgba(31,19,17,0.42)' },
  galleryCaption: { position: 'absolute', left: 16, right: 16, bottom: 16 },
  galleryCaptionEyebrow: { color: '#ffe3c5', fontSize: 10, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 5 },
  galleryCaptionText: { color: '#fff', fontFamily: sans, fontWeight: '600', letterSpacing: -0.3, fontSize: 18, lineHeight: 23 },
  galleryOpen: { position: 'absolute', right: 12, top: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(28,17,23,0.46)', alignItems: 'center', justifyContent: 'center' },
  audioCard: { marginTop: 36, marginHorizontal: 20, borderRadius: 20, padding: 18, backgroundColor: C.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, flexDirection: 'row', gap: 12, alignItems: 'center' },
  audioIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  audioTitle: { fontFamily: sans, fontWeight: '600', letterSpacing: -0.3, color: C.ink, fontSize: 18 },
  audioCopy: { color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  birthdayToday: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, backgroundColor: '#fff0ef', borderColor: 'rgba(166,75,67,0.2)' },
  birthdayIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  birthdayTodayEyebrow: { color: C.wine, fontSize: 10, letterSpacing: 1.3, fontWeight: '800', textTransform: 'uppercase', marginBottom: 3 },
  birthdayTodayName: { color: C.ink, fontFamily: sans, fontWeight: '600', letterSpacing: -0.3, fontSize: 19, lineHeight: 24 },
  birthdayTodayCopy: { color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 6 },
  birthdayQuiet: { borderRadius: 15, backgroundColor: C.sand, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  birthdayQuietText: { color: C.muted, fontSize: 13, flex: 1 },
  upcomingBirthdayHeading: { color: C.ink, fontSize: 14, fontWeight: '800', marginTop: 18, marginBottom: 9 },
  upcomingBirthdayList: { backgroundColor: C.paper, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, overflow: 'hidden' },
  upcomingBirthdayRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  birthdayDateBadge: { minWidth: 53, height: 42, borderRadius: 12, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  birthdayDateText: { color: C.wine, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  upcomingBirthdayName: { color: C.ink, fontSize: 14, fontWeight: '700', flex: 1 },
  daysUntil: { color: C.muted, fontSize: 11, fontWeight: '600' },
  noUpcomingBirthdays: { color: C.muted, fontSize: 13, paddingVertical: 10 },
});
