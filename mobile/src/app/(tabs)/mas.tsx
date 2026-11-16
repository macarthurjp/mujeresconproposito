import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Eyebrow, Screen, tapFeedback, Title } from '@/components/ui';
import { C, FACEBOOK_URL, INSTAGRAM_URL, sans } from '@/constants/theme';
import { getShowHomeActivities, setShowHomeActivities } from '@/lib/app-preferences';
import { liveActivitiesSupported, loadLiveActivitiesPreference, setLiveActivitiesEnabled as saveLiveActivitiesEnabled } from '@/lib/live-activity';
import { COMMUNITIES, disableMeetingAlerts, enableMeetingAlerts, getDevicePrefs, getMeetingAlertsEnabled, getPushStatus, saveDevicePrefs, type DevicePrefs, type PushStatus } from '@/lib/notifications';
import { WheelPicker } from '@/components/wheel-picker';

type Item = { icon: keyof typeof Ionicons.glyphMap; label: string; hint?: string; onPress: () => void };

function Row({ icon, label, hint, onPress }: Item) {
  return (
    <Pressable onPress={() => { tapFeedback(); onPress(); }} style={({ pressed }) => [s.row, pressed && { backgroundColor: C.sand }]} accessibilityRole="button">
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
    <View style={{ marginTop: 24 }}>
      <Eyebrow>{title}</Eyebrow>
      <View style={s.group}>
        {items.map((item, i) => <View key={item.label}>{i > 0 ? <View style={s.sep} /> : null}<Row {...item} /></View>)}
      </View>
    </View>
  );
}

function SwitchRow({ icon, label, hint, value, disabled, onValueChange }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={[s.switchRow, disabled && { opacity: 0.58 }]}>
      <View style={s.icon}><Ionicons name={icon} size={20} color={C.wine} /></View>
      <View style={s.switchCopy}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.hint}>{hint}</Text>
      </View>
      <Switch value={value} disabled={disabled} onValueChange={onValueChange} trackColor={{ false: '#ded4d2', true: C.wine }} thumbColor="#fff" accessibilityLabel={label} />
    </View>
  );
}

const go = (href: Href) => () => router.push(href);
const open = (url: string) => () => Linking.openURL(url);
export default function Mas() {
  const [push, setPush] = useState<PushStatus | null>(null);
  const [meetingAlerts, setMeetingAlerts] = useState(false);
  const [alertsBusy, setAlertsBusy] = useState(false);
  const [showActivities, setShowActivities] = useState(true);
  const [dynamicIsland, setDynamicIsland] = useState(false);
  const [islandBusy, setIslandBusy] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [device, setDevice] = useState<DevicePrefs>({ avisosContenido: true, comunidad: null });
  const taps = useRef({ count: 0, at: 0 });

  const refreshPreferences = useCallback(async () => {
    const [status, enabled, homeActivities, islandEnabled] = await Promise.all([
      getPushStatus(), getMeetingAlertsEnabled(), getShowHomeActivities(), loadLiveActivitiesPreference(),
    ]);
    setPush(status);
    setMeetingAlerts(enabled && status === 'granted');
    setShowActivities(homeActivities);
    setDynamicIsland(liveActivitiesSupported && islandEnabled);
    setDevice(await getDevicePrefs());
  }, []);

  async function updateDevice(next: DevicePrefs) {
    const previous = device;
    setDevice(next);
    try {
      const status = await saveDevicePrefs(next);
      if (status === 'denied') {
        Alert.alert('Activa las notificaciones', 'Permite las notificaciones de la app en Ajustes para recibir estos avisos.', [
          { text: 'Ahora no', style: 'cancel' },
          { text: 'Abrir ajustes', onPress: () => { void Linking.openSettings(); } },
        ]);
      }
    } catch {
      setDevice(previous);
      Alert.alert('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.');
    }
  }

  useFocusEffect(useCallback(() => {
    refreshPreferences().catch(() => {});
  }, [refreshPreferences]));

  async function toggleMeetingAlerts(enabled: boolean) {
    if (alertsBusy) return;
    setAlertsBusy(true);
    try {
      if (enabled) {
        const status = await enableMeetingAlerts();
        setPush(status);
        setMeetingAlerts(status === 'granted');
        if (status === 'denied') {
          Alert.alert('Avisos desactivados', 'Permite las notificaciones de Mujeres con Propósito en los ajustes del dispositivo.', [
            { text: 'Ahora no', style: 'cancel' },
            { text: 'Abrir ajustes', onPress: () => { void Linking.openSettings(); } },
          ]);
        } else if (status === 'error') {
          Alert.alert('No se pudieron activar', 'No pudimos registrar este dispositivo. Revisa tu conexión e inténtalo de nuevo.');
        } else if (status === 'unsupported') {
          Alert.alert('No disponible', 'Las notificaciones push requieren un dispositivo compatible.');
        }
      } else {
        await disableMeetingAlerts();
        setMeetingAlerts(false);
        setPush(await getPushStatus());
      }
    } catch {
      await refreshPreferences().catch(() => {});
      Alert.alert('No se pudo actualizar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setAlertsBusy(false);
    }
  }

  async function toggleHomeActivities(enabled: boolean) {
    setShowActivities(enabled);
    try { await setShowHomeActivities(enabled); }
    catch { setShowActivities(!enabled); Alert.alert('No se pudo guardar', 'Inténtalo de nuevo.'); }
  }

  async function toggleDynamicIsland(enabled: boolean) {
    if (islandBusy) return;
    setIslandBusy(true);
    try {
      await saveLiveActivitiesEnabled(enabled);
      setDynamicIsland(enabled);
    } catch {
      await refreshPreferences().catch(() => {});
      Alert.alert('No se pudo actualizar', 'Inténtalo de nuevo.');
    } finally {
      setIslandBusy(false);
    }
  }

  function onFooterTap() {
    const now = Date.now();
    taps.current = { count: now - taps.current.at < 700 ? taps.current.count + 1 : 1, at: now };
    if (taps.current.count >= 3) { taps.current.count = 0; tapFeedback(); setShowTeam(true); }
  }

  const statusHint = push === 'granted' && meetingAlerts ? 'Se enviarán avisos 15 minutos antes y al comenzar.'
    : push === 'granted' ? 'Los avisos de reuniones están desactivados.'
    : push === 'denied' ? 'Activa las notificaciones en Ajustes del dispositivo.'
      : push === 'unsupported' ? 'Disponible en dispositivos físicos con notificaciones push.'
        : push === 'error' ? 'No se pudo registrar el dispositivo.'
          : 'Activa avisos para no perderte las reuniones.';

  return (
    <Screen>
      <View style={s.container}>
        <Eyebrow>Preferencias</Eyebrow>
        <Title>Más</Title>
        <Text style={s.intro}>Controla tus avisos y cómo aparece la agenda en la app.</Text>

        <View style={s.section}>
          <Eyebrow>Reuniones y llamadas</Eyebrow>
          <View style={s.group}>
            <SwitchRow icon="notifications-outline" label="Avisos de reuniones" hint="Recibe un aviso 15 minutos antes y cuando comience una reunión." value={meetingAlerts} disabled={alertsBusy || push === 'unsupported'} onValueChange={(value) => { void toggleMeetingAlerts(value); }} />
            {Platform.OS === 'ios' ? <><View style={s.sep} />
            <SwitchRow icon="phone-portrait-outline" label="Dynamic Island" hint={liveActivitiesSupported ? 'Permite seguir una reunión en la Dynamic Island y en la pantalla bloqueada.' : 'Disponible en iPhone con Live Activities.'} value={dynamicIsland} disabled={islandBusy || !liveActivitiesSupported} onValueChange={(value) => { void toggleDynamicIsland(value); }} /></> : null}
          </View>
          <Text style={s.status}>{alertsBusy ? 'Actualizando preferencia…' : islandBusy ? 'Actualizando Dynamic Island…' : statusHint}</Text>
        </View>

        <View style={s.section}>
          <Eyebrow>Novedades y comunidad</Eyebrow>
          <View style={s.group}>
            <SwitchRow icon="sparkles-outline" label="Contenido nuevo" hint="Aviso cuando se publica un devocional, un video o un evento." value={device.avisosContenido} disabled={push === 'unsupported'} onValueChange={(value) => { void updateDevice({ ...device, avisosContenido: value }); }} />
            <View style={s.sep} />
            <View style={s.communityRow}>
              <View style={s.communityIcon}><Ionicons name="earth-outline" size={20} color={C.wine} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.communityLabel}>Mi comunidad</Text>
                <Text style={s.communityHint}>Para recibir los avisos de tu comunidad.</Text>
                <View style={{ marginTop: 8 }}>
                  <WheelPicker title="Mi comunidad" value={device.comunidad ?? ''} placeholder="Elige tu comunidad" options={[{ value: '', label: 'Sin indicar' }, ...COMMUNITIES.map((c) => ({ value: c, label: c }))]} onChange={(v) => { void updateDevice({ ...device, comunidad: v || null }); }} />
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Eyebrow>Cumpleaños</Eyebrow>
          <View style={s.group}>
            <Row icon="gift-outline" label="Avisos de cumpleaños" hint="Elige los días y la hora del recordatorio" onPress={go('/avisos-cumpleanos')} />
          </View>
        </View>

        <View style={s.section}>
          <Eyebrow>Calendario de actividades</Eyebrow>
          <View style={s.group}>
            <SwitchRow icon="calendar-outline" label="Próximas actividades en Inicio" hint="Muestra u oculta la agenda en la página principal." value={showActivities} onValueChange={(value) => { void toggleHomeActivities(value); }} />
            <View style={s.sep} />
            <Row icon="today-outline" label="Abrir calendario completo" hint="Consulta las reuniones y actividades" onPress={go('/eventos')} />
          </View>
        </View>

        <Group title="Participa" items={[
          { icon: 'heart-outline', label: 'Donar', hint: 'PayPal, código QR o transferencia', onPress: go('/aportar') },
          { icon: 'mail-outline', label: 'Contacto', hint: 'Formulario dentro de la app', onPress: go('/contacto') },
        ]} />

        <Group title="Síguenos" items={[
          { icon: 'logo-instagram', label: 'Instagram', onPress: open(INSTAGRAM_URL) },
          { icon: 'logo-facebook', label: 'Facebook', onPress: open(FACEBOOK_URL) },
        ]} />

        {showTeam ? <Group title="Equipo" items={[
          { icon: 'shield-checkmark-outline', label: 'Administración', hint: 'Eventos, fotos, usuarios y roles', onPress: go('/admin') },
          { icon: 'stats-chart-outline', label: 'Dashboard', hint: 'Registros de la comunidad', onPress: go('/admin/dashboard') },
        ]} /> : null}

        <Pressable onPress={onFooterTap} onLongPress={() => { tapFeedback(); setShowTeam(true); }} delayLongPress={800} accessible={false}>
          <Text style={s.footer}>Mujeres con Propósito 930 a.s.b.l.</Text>
        </Pressable>
        <Text style={s.credit}>Crafted by MatMax Consulting SARL-S</Text>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  communityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  communityIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  communityLabel: { color: C.ink, fontSize: 15, fontWeight: '600' },
  communityHint: { color: C.muted, fontSize: 12, marginTop: 2 },
  container: { paddingHorizontal: 20 },
  intro: { fontFamily: sans, color: C.muted, fontSize: 14, lineHeight: 20, marginTop: 7 },
  section: { marginTop: 26 },
  group: { marginTop: 8, backgroundColor: C.card, borderRadius: 20, overflow: 'hidden', boxShadow: '0 1px 2px rgba(63,38,35,0.04), 0 8px 24px rgba(63,38,35,0.06)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  switchCopy: { flex: 1, gap: 3 },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  label: { color: C.ink, fontSize: 15, fontWeight: '600' },
  hint: { color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 2, flexShrink: 1 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(28,17,23,0.12)', marginLeft: 66 },
  status: { color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 9, marginHorizontal: 4 },
  footer: { color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 36 },
  credit: { color: 'rgba(109,82,80,0.72)', fontSize: 10, letterSpacing: 0.35, textAlign: 'center', marginTop: 7, marginBottom: 10 },
});
