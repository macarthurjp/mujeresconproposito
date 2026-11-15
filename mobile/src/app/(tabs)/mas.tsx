import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Eyebrow, Screen, tapFeedback, Title } from '@/components/ui';
import { C, CONTACT_EMAIL, FACEBOOK_URL, INSTAGRAM_URL, SITE_URL, SOUNDCLOUD_URL, YOUTUBE_URL } from '@/constants/theme';
import { getPushStatus, registerForMeetingAlerts, type PushStatus } from '@/lib/notifications';

type Item = { icon: keyof typeof Ionicons.glyphMap; label: string; hint?: string; onPress: () => void };

function Row({ icon, label, hint, onPress }: Item) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && { backgroundColor: C.sand }]} accessibilityRole="button">
      <View style={s.icon}><Ionicons name={icon} size={20} color={C.wine} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.label}>{label}</Text>
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </Pressable>
  );
}

function Group({ title, items }: { title: string; items: Item[] }) {
  return (
    <View style={{ marginTop: 28 }}>
      <Eyebrow>{title}</Eyebrow>
      <View style={s.group}>
        {items.map((item, i) => (
          <View key={item.label}>
            {i > 0 ? <View style={s.sep} /> : null}
            <Row {...item} />
          </View>
        ))}
      </View>
    </View>
  );
}

const open = (url: string) => () => Linking.openURL(url);
const go = (href: Href) => () => router.push(href);
// Team tools open the website admin inside the app (Safari view: keeps
// sign-in, Face ID/passkeys and every admin feature in one place).
const openTeam = (path: string) => () =>
  WebBrowser.openBrowserAsync(`${SITE_URL}/${path}`, {
    controlsColor: C.wine,
    toolbarColor: C.bg,
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    dismissButtonStyle: 'close',
  });

export default function Mas() {
  const [push, setPush] = useState<PushStatus | null>(null);
  // Team tools stay hidden; revealed like the website's private access:
  // 3 quick taps or a long press on the footer.
  const [showTeam, setShowTeam] = useState(false);
  const taps = useRef({ count: 0, at: 0 });
  const revealTeam = () => { tapFeedback(); setShowTeam(true); };
  const onFooterTap = () => {
    const now = Date.now();
    taps.current = { count: now - taps.current.at < 700 ? taps.current.count + 1 : 1, at: now };
    if (taps.current.count >= 3) { taps.current.count = 0; revealTeam(); }
  };
  useEffect(() => {
    getPushStatus().then(setPush).catch(() => setPush('unsupported'));
  }, []);

  const pushHint =
    push === 'granted' ? 'Activados' : push === 'denied' ? 'Desactivados — toca para abrir ajustes' : push === 'unsupported' ? 'No disponible en este dispositivo' : 'Toca para activar';

  return (
    <Screen>
      <View style={{ paddingHorizontal: 20 }}>
        <Title>Más</Title>
        <Group
          title="Comunidad"
          items={[
            { icon: 'images-outline', label: 'Galería', hint: 'Estados Unidos, República Dominicana, Europa', onPress: go('/galeria') },
            { icon: 'star-outline', label: 'Destacadas', hint: 'Conferencistas invitadas', onPress: go('/destacadas') },
            { icon: 'musical-notes-outline', label: 'Música', hint: 'Playlist en SoundCloud', onPress: open(SOUNDCLOUD_URL) },
            { icon: 'logo-youtube', label: 'YouTube', hint: 'Mensajes y conferencias', onPress: open(YOUTUBE_URL) },
          ]}
        />
        <Group
          title="Participa"
          items={[
            { icon: 'person-add-outline', label: 'Únete a la comunidad', hint: 'Formulario de inscripción en la app', onPress: go('/(tabs)/unirse') },
            { icon: 'heart-outline', label: 'Aportar', hint: 'Código QR, cuentas y PayPal', onPress: go('/aportar') },
            { icon: 'mail-outline', label: 'Contacto', hint: CONTACT_EMAIL, onPress: open(`mailto:${CONTACT_EMAIL}`) },
            { icon: 'chatbubbles-outline', label: 'Escríbenos desde la web', onPress: open(`${SITE_URL}/#contact`) },
          ]}
        />
        <Group
          title="Ajustes"
          items={[
            {
              icon: 'notifications-outline',
              label: 'Avisos de reuniones',
              hint: pushHint,
              onPress: async () => {
                if (push === 'denied' || push === 'granted') return Linking.openSettings();
                setPush(await registerForMeetingAlerts(true));
              },
            },
          ]}
        />
        <Group
          title="Síguenos"
          items={[
            { icon: 'logo-instagram', label: 'Instagram', onPress: open(INSTAGRAM_URL) },
            { icon: 'logo-facebook', label: 'Facebook', onPress: open(FACEBOOK_URL) },
            { icon: 'globe-outline', label: 'mcp930.org', onPress: open(SITE_URL) },
          ]}
        />
        {showTeam ? (
          <Group
          title="Equipo"
          items={[
            { icon: 'shield-checkmark-outline', label: 'Administración', hint: 'Eventos, fotos, usuarios y roles', onPress: go('/admin') },
            { icon: 'stats-chart-outline', label: 'Dashboard', hint: 'Registros de la comunidad', onPress: openTeam('dashboard.html') },
          ]}
        />
        ) : null}
        <Pressable onPress={onFooterTap} onLongPress={revealTeam} delayLongPress={800} accessible={false}>
          <Text style={s.footer}>Mujeres con Propósito 930 a.s.b.l.</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  group: { backgroundColor: C.card, borderRadius: 20, overflow: 'hidden', boxShadow: '0 1px 2px rgba(63,38,35,0.04), 0 8px 24px rgba(63,38,35,0.06)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  label: { color: C.ink, fontSize: 16, fontWeight: '600' },
  hint: { color: C.muted, fontSize: 13, marginTop: 2 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(28,17,23,0.12)', marginLeft: 66 },
  footer: { color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 36 },
});
