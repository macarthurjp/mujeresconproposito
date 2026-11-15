import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Agenda } from '@/components/agenda';
import { BirthdayWeek } from '@/components/birthday-week';
import { PrayerCard } from '@/components/prayer-card';
import { reportScroll } from '@/lib/scroll-activity';
import { AlbumCard, PosterCard } from '@/components/media';
import { PhotoViewer } from '@/components/photo-viewer';
import { PorcionPlayer } from '@/components/porcion-player';
import { Button, Card, Eyebrow, tapFeedback, ErrorNote, Section, styles as ui, Title, useAsync } from '@/components/ui';
import { C, TAB_BAR_SPACE, serif, sans } from '@/constants/theme';
import { api, type Foto } from '@/lib/api';
import { getShowHomeActivities } from '@/lib/app-preferences';
import { albumsFor, GALLERY_REGIONS as galleryRegions, type Album, type RegionKey } from '@/lib/gallery';

export default function Home() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const posterWidth = Math.min(screenWidth - 72, 340);
  const eventos = useAsync(api.eventos);
  const destacadas = useAsync(api.destacadas);
  const galeria = useAsync(api.galeria);
  const videos = useAsync(api.videos);
  const birthdays = useAsync(api.birthdays);
  const [selectedGalleryRegion, setSelectedGalleryRegion] = useState<RegionKey>('usa');
  const [openAlbum, setOpenAlbum] = useState<Album<Foto> | null>(null);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [showHomeActivities, setShowHomeActivities] = useState(true);
  const galleryCardWidth = Math.min(screenWidth * 0.46, 200);
  const galleryAlbums = useMemo(() => albumsFor(galeria.data ?? [], selectedGalleryRegion), [galeria.data, selectedGalleryRegion]);

  useFocusEffect(useCallback(() => {
    let active = true;
    getShowHomeActivities().then((enabled) => { if (active) setShowHomeActivities(enabled); }).catch(() => {});
    return () => { active = false; };
  }, []));

  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_SPACE }}
      onScroll={reportScroll}
      scrollEventThrottle={100}
      refreshControl={
        <RefreshControl
          refreshing={false}
          tintColor={C.wine}
          onRefresh={() => { eventos.reload(); destacadas.reload(); galeria.reload(); videos.reload(); birthdays.reload(); }}
        />
      }>
      {/* Hero */}
      <View style={[s.hero, { paddingTop: insets.top + 20 }]}>
        <View style={s.brandRow}>
          <View style={s.mark}>
            <LinearGradient colors={['#cb685e', '#a64b43', '#863a36']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View pointerEvents="none" style={s.markGlow} />
            <Image source={require('@/assets/images/mcp-mark.png')} style={s.markImage} contentFit="contain" />
            <View pointerEvents="none" style={s.markRim} />
          </View>
          <View>
            <Text style={s.brand}>Mujeres con Propósito</Text>
            <Text style={s.brandSub}>930 A.S.B.L.</Text>
          </View>
        </View>
        <Eyebrow>Comunidad cristiana internacional</Eyebrow>
        <Title size={34} editorial>
          Bienvenida a <Text style={{ fontStyle: 'italic', color: C.wine }}>Mujeres</Text> con Propósito
        </Title>
        <Text style={s.heroCopy}>
          Un espacio donde la <Text style={s.heroAccent}>fe</Text>, la <Text style={s.heroAccent}>hermandad</Text> y el <Text style={s.heroAccent}>propósito</Text> se unen para transformar vidas.
        </Text>
        <View style={{ flexDirection: 'row', marginTop: 20 }}>
          <Button label="Únete a la comunidad" icon="person-add-outline" variant="primary" onPress={() => router.push('/(tabs)/unirse')} />
        </View>
      </View>

      {/* Destacadas — first content section, matching the website */}
      {destacadas.data?.length ? (
        <Section eyebrow="Voces que inspiran" title="Destacadas">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={posterWidth + 14} decelerationRate="fast" contentContainerStyle={s.bleedTrack} style={s.bleed}>
            {destacadas.data.slice(0, 8).map((d) => (
              <PosterCard key={d.id} uri={d.foto_url} name={d.nombre} role={d.titulo} onPress={() => router.push('/destacadas')} style={{ width: posterWidth }} />
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
      <Section eyebrow="Nosotras" title="¿Quiénes somos?" band>
        <Text style={[ui.body, { fontWeight: '700', color: C.ink }]}>Nuestra misión, visión y propósito</Text>
        <Text style={[ui.body, { marginTop: 12 }]}>Somos una comunidad internacional cristiana de mujeres que crecen en la fe, caminan juntas y se impulsan a vivir su propósito y transformar su entorno.</Text>
        <Pressable onPress={() => setAboutVisible(true)} onPressIn={tapFeedback} accessibilityRole="button" accessibilityLabel="Ver misión, visión y valores" style={({ pressed }) => [s.moreLink, pressed && { opacity: 0.72 }]}>
          <Text style={s.moreLinkText}>Ver más</Text><Ionicons name="arrow-forward" size={16} color={C.wine} />
        </Pressable>
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
      <Section eyebrow="Ministerio" title="Lo que hacemos" band>
        <Text style={[ui.body, { marginBottom: 18 }]}>Espacios para crecer en la fe, encontrarnos y acompañarnos en oración.</Text>
        <View style={s.ministryGrid}>{[
          { icon: 'book-cross', title: 'Devocionales', copy: 'Reflexiones semanales para fortalecer tu caminar con Dios.', action: () => router.push('/(tabs)/devocionales') },
          { icon: 'calendar-outline', title: 'Encuentros', copy: 'Reuniones y actividades para crecer juntas en fe.', action: () => router.push('/eventos') },
          { icon: 'hand-left-outline', title: 'Oración', copy: 'Comparte tus peticiones y permite que oremos contigo.', action: null },
        ].map((item, index) => {
          const content = <>
            <View style={s.ministryCardTop}>
              <View style={s.ministryIcon}>{item.icon === 'book-cross' ? <MaterialCommunityIcons name="book-cross" size={23} color={C.wine} /> : <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={23} color={C.wine} />}</View>
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

      {/* Agenda: same place as Eventos on the website: after Únete, before YouTube; the next activities in the viewer's local time */}
      {showHomeActivities ? <Section eyebrow="Agenda" title="Próximas actividades" band>
        {eventos.error ? <ErrorNote message={eventos.error} onRetry={eventos.reload} /> : null}
        {eventos.data ? <Agenda eventos={eventos.data} /> : null}
      </Section> : null}

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
      {/* Prayer requests (the donation card now lives in Aportar, like the website's Donar button) */}
      <Section eyebrow="Oramos contigo" title="¿Necesitas oración?" band>
        <PrayerCard />
      </Section>

      {/* Gallery */}
      <Section eyebrow="Momentos" title="Galería">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.bleedTrack, { gap: 8, paddingBottom: 14 }]} style={s.bleed}>
          {galleryRegions.map((region) => <Pressable key={region.key} onPress={() => { tapFeedback(); setSelectedGalleryRegion(region.key); }} style={[s.regionPill, selectedGalleryRegion === region.key && s.regionPillActive]}><Text style={[s.regionPillText, selectedGalleryRegion === region.key && s.regionPillTextActive]}>{region.label}</Text></Pressable>)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={galleryCardWidth + 14} contentContainerStyle={s.bleedTrack} style={s.bleed}>
          {galleryAlbums.map((album) => (
            <AlbumCard key={album.key} title={album.title} coverUri={album.cover.foto_url} count={album.photos.length} width={galleryCardWidth} onPress={() => setOpenAlbum(album)} />
          ))}
        </ScrollView>
        <Pressable onPress={() => router.push('/galeria')} style={s.seeAll}><Text style={s.seeAllText}>Ver todas las galerías</Text><Ionicons name="chevron-forward" size={16} color={C.wine} /></Pressable>
        {!galeria.loading && !galleryAlbums.length ? <Text style={[ui.body, { paddingHorizontal: 20 }]}>Explora fotos de nuestra comunidad por región.</Text> : null}
      </Section>

      {/* SoundCloud */}
      <Section eyebrow="Celebramos juntas" title="Cumpleaños" band>
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
          <BirthdayWeek people={birthdays.data.proximosCumpleanos} />
        ) : !birthdays.error ? <Text style={s.noUpcomingBirthdays}>No hay cumpleaños próximos registrados.</Text> : null}
      </Section>

      {/* Porción: embedded SoundCloud player with native playlist controls */}
      <PorcionPlayer />
    </ScrollView>
    <PhotoViewer visible={!!openAlbum} title={openAlbum?.title ?? ''} photos={openAlbum?.photos ?? []} onClose={() => setOpenAlbum(null)} />
    <Modal visible={aboutVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAboutVisible(false)}>
      <View style={s.aboutModal}>
        <View style={s.aboutModalHeader}>
          <View style={{ flex: 1 }}><Text style={s.aboutModalEyebrow}>NOSOTRAS</Text><Text style={s.aboutModalTitle}>Misión, visión y valores</Text></View>
          <Pressable onPress={() => setAboutVisible(false)} accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={12} style={s.aboutClose}><Ionicons name="close" size={22} color={C.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={s.aboutModalContent} showsVerticalScrollIndicator={false}>
          <View style={s.aboutDetailCard}><Text style={s.aboutDetailTitle}>Misión</Text><Text style={s.aboutParagraphText}>Inspirar y equipar a mujeres para crecer en la fe, vivir su propósito y transformar sus vidas, familias y comunidades; fomentando sus dones y talentos.</Text></View>
          <View style={s.aboutDetailCard}><Text style={s.aboutDetailTitle}>Visión</Text><Text style={s.aboutParagraphText}>Ser una comunidad internacional de mujeres transformadas por Dios, que caminan en su propósito, crecen integralmente y generan un impacto social que transforma vidas, familias y comunidades.</Text></View>
          <View style={s.aboutDetailCard}>
            <Text style={s.aboutDetailTitle}>Nuestros valores</Text>
            <View style={s.aboutValuesList}>{[
              ['Amor', 'Amamos a Dios y a las personas, sirviendo con compasión y empatía.'],
              ['Unidad', 'Caminamos en armonía, valorando nuestras diferencias y construyendo juntas.'],
              ['Hermandad', 'Nos acompañamos, apoyamos y fortalecemos unas a otras.'],
              ['Transparencia', 'Actuamos con apertura, integridad y claridad en nuestras relaciones y recursos.'],
              ['Honestidad', 'Vivimos y nos relacionamos con verdad, respeto y coherencia.'],
            ].map(([title, copy]) => <View key={title} style={s.aboutValue}><View style={s.aboutValueDot} /><View style={s.aboutValueCopy}><Text style={s.aboutValueName}>{title}</Text><Text style={s.aboutDetailText}>{copy}</Text></View></View>)}</View>
          </View>
        </ScrollView>
      </View>
    </Modal>
    </>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: '#f9e1dc', paddingHorizontal: 22, paddingBottom: 26, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 22 },
  mark: { width: 58, height: 58, borderRadius: 20, overflow: 'hidden', backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.58)', boxShadow: '0 9px 18px rgba(105,44,41,0.28), 0 2px 4px rgba(63,38,35,0.15)' },
  markGlow: { position: 'absolute', width: 42, height: 24, borderRadius: 22, top: -11, left: -3, backgroundColor: 'rgba(255,255,255,0.26)', transform: [{ rotate: '-28deg' }] },
  // The PNG includes transparent padding; keep it inside the badge so the full mark shows.
  markImage: { width: 64, height: 64 },
  markRim: { ...StyleSheet.absoluteFill, borderRadius: 19, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  brand: { fontFamily: serif, color: C.ink, fontSize: 18 },
  brandSub: { color: C.muted, fontSize: 10, letterSpacing: 2, marginTop: 2 },
  heroCopy: { color: 'rgba(63,38,35,0.86)', fontFamily: serif, fontSize: 19, lineHeight: 28, marginTop: 14, paddingLeft: 14, borderLeftWidth: 2, borderLeftColor: C.gold },
  heroAccent: { fontFamily: serif, fontStyle: 'italic', color: C.wine },
  verse: { marginTop: 44, paddingHorizontal: 28, alignItems: 'center' },
  quote: { fontFamily: serif, fontSize: 64, lineHeight: 64, color: C.gold, height: 44 },
  verseText: { fontFamily: serif, fontStyle: 'italic', fontSize: 22, lineHeight: 30, color: C.ink, textAlign: 'center' },
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
  aboutModal: { flex: 1, backgroundColor: C.bg, paddingTop: 12 },
  aboutModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 22, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: C.separator },
  aboutModalEyebrow: { color: C.wine, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  aboutModalTitle: { color: C.ink, fontFamily: serif, fontSize: 22, lineHeight: 28, marginTop: 4, flexShrink: 1 },
  aboutClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  aboutModalContent: { padding: 20, paddingBottom: 36, gap: 14 },
  aboutDetailCard: { padding: 18, borderRadius: 20, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, gap: 8 },
  aboutDetailTitle: { color: C.ink, fontFamily: serif, fontSize: 21 },
  aboutParagraphText: { color: C.muted, fontSize: 15, lineHeight: 22, flexShrink: 1, textAlign: 'justify' },
  aboutDetailText: { color: C.muted, fontSize: 15, lineHeight: 22, flexShrink: 1, textAlign: 'left' },
  aboutValuesList: { gap: 8 },
  aboutValue: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  aboutValueCopy: { flex: 1, gap: 3 },
  aboutValueDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.wine, marginTop: 7 },
  aboutValueName: { color: C.ink, fontSize: 15, fontWeight: '700' },
  appPromo: { marginTop: 38, marginHorizontal: 20, padding: 22, borderRadius: 22, backgroundColor: C.sand },
  appFeature: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 14 },
  appFeatureText: { flex: 1, color: C.text, fontSize: 13, lineHeight: 19 },
  audioCard: { marginTop: 40, marginHorizontal: 20, minHeight: 116, borderRadius: 22, overflow: 'hidden', padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, boxShadow: '0 12px 30px rgba(143,63,56,0.28)' },
  audioWave: { position: 'absolute', right: 8, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', gap: 5, opacity: 0.16 },
  audioBar: { width: 5, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: '#fff' },
  audioArt: { width: 56, height: 56, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  audioEyebrow: { fontFamily: sans, color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  audioTitle: { fontFamily: sans, fontWeight: '700', letterSpacing: -0.4, color: '#fff', fontSize: 19, marginTop: 2 },
  audioCopy: { fontFamily: sans, color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 18, marginTop: 2 },
  audioPlay: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  bleed: { marginHorizontal: -20 },
  bleedTrack: { paddingHorizontal: 20, paddingTop: 2, paddingBottom: 18, gap: 14 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  seeAllText: { fontFamily: sans, fontSize: 15, fontWeight: '600', color: C.wine },
  regionPill: { minHeight: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.fill, justifyContent: 'center' },
  regionPillActive: { backgroundColor: C.wine, borderColor: C.wine },
  regionPillText: { fontFamily: sans, color: C.wine, fontSize: 13, fontWeight: '600' },
  regionPillTextActive: { color: '#fff' },
  birthdayToday: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, backgroundColor: '#fff0ef', borderColor: 'rgba(166,75,67,0.2)' },
  birthdayIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  birthdayTodayEyebrow: { color: C.wine, fontSize: 10, letterSpacing: 1.3, fontWeight: '800', textTransform: 'uppercase', marginBottom: 3 },
  birthdayTodayName: { color: C.ink, fontFamily: sans, fontWeight: '600', letterSpacing: -0.3, fontSize: 19, lineHeight: 24 },
  birthdayTodayCopy: { color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 6 },
  birthdayQuiet: { borderRadius: 15, backgroundColor: C.sand, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  birthdayQuietText: { color: C.muted, fontSize: 13, flex: 1 },
  upcomingBirthdayHeading: { color: C.ink, fontSize: 14, fontWeight: '800', marginTop: 18, marginBottom: 9 },
  noUpcomingBirthdays: { color: C.muted, fontSize: 13, paddingVertical: 10 },
});
