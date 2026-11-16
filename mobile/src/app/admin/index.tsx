import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { AdminLogin } from '@/components/admin-login';
import { Group, Row, SwitchRow } from '@/components/form';
import { C, sans } from '@/constants/theme';
import { canAdmin, setMyBirthdayCalendar, signIn, signOut } from '@/lib/admin';
import {
  biometricLabel, clearBiometricAdminCredentials, confirmWithBiometrics, deviceSupportsBiometrics,
  getBiometricLoginAvailable, getSessionPassword, rememberSessionPassword, saveBiometricAdminCredentials,
} from '@/lib/app-preferences';
import { useAdmin } from '@/lib/use-admin';

const JOIN_URL = 'https://mcp930.org/?form=unirse';
const shareJoin = () => {
  void Share.share(Platform.OS === 'ios'
    ? { url: JOIN_URL, message: 'Únete a Mujeres con Propósito: completa el formulario aquí.' }
    : { title: 'Únete a Mujeres con Propósito', message: `Únete a Mujeres con Propósito: completa el formulario aquí ${JOIN_URL}` });
};

export default function AdminHome() {
  const { access, ready, refresh } = useAdmin();
  const [bioSupported, setBioSupported] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [bioLabel, setBioLabel] = useState('Face ID');
  const [askPassword, setAskPassword] = useState(false);
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([deviceSupportsBiometrics(), getBiometricLoginAvailable(), biometricLabel()])
      .then(([supported, on, label]) => { setBioSupported(supported); setBioOn(on); setBioLabel(label); })
      .catch(() => {});
  }, []);

  const enableBiometrics = async (email: string, password: string) => {
    setBusy(true);
    try {
      if (!(await confirmWithBiometrics(`Activar ${bioLabel}`))) return;
      await saveBiometricAdminCredentials(email, password);
      setBioOn(true);
      Alert.alert(`${bioLabel} activado`, `La próxima vez podrás entrar con ${bioLabel}.`);
    } catch (error) {
      Alert.alert('No se pudo activar', error instanceof Error && error.message ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const toggleBiometrics = (on: boolean) => {
    if (!on) {
      void clearBiometricAdminCredentials().then(() => setBioOn(false));
      return;
    }
    const saved = getSessionPassword();
    if (saved && access && saved.email === access.email.toLowerCase()) void enableBiometrics(saved.email, saved.password);
    else { setPwd(''); setAskPassword(true); }
  };

  const confirmPassword = async () => {
    if (!access || !pwd) return;
    setBusy(true);
    try {
      await signIn(access.email, pwd);
      rememberSessionPassword(access.email, pwd);
      setAskPassword(false);
      await enableBiometrics(access.email, pwd);
    } catch (error) {
      Alert.alert('Contraseña incorrecta', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return <View style={a.center}><ActivityIndicator color={C.wine} /></View>;
  if (!access) return <AdminLogin />;

  const name = access.nombre || access.email;
  const roleLabel = access.isRevoked ? 'Acceso revocado' : access.isSuperAdmin ? 'Super Admin' : access.roleName ? access.roleName : [
    access.permissions.includes('editor') ? 'Editora' : null,
    access.permissions.includes('reviewer') ? 'Revisor editorial' : null,
    access.permissions.includes('read_export') ? 'Manager' : null,
    access.permissions.includes('birthday_calendar') ? 'Calendario de cumpleaños' : null,
  ].filter(Boolean).join(' · ') || (access.permissions.includes('read_only') ? 'Vista simple' : 'Acceso limitado');
  const canEvents = canAdmin(access,'events','view');
  const canGallery = canAdmin(access,'gallery','view');
  const canContent = canAdmin(access,'content','view');
  const canNotices = canAdmin(access,'notices','view');
  const canDevotionals = canAdmin(access,'devotionals','view');
  const canReadDashboard = canAdmin(access,'dashboard','view');

  return (
    <ScrollView contentContainerStyle={a.page}>
      <View style={a.profile}>
        <View style={a.avatar}><Text style={a.avatarText}>{name.charAt(0).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={a.name} numberOfLines={1}>{name}</Text>
          <Text style={a.role}>{roleLabel}</Text>
        </View>
      </View>

      {access.isRevoked ? (
        <Group footer="Tu acceso fue revocado. Contacta a la administración si crees que es un error."><Row label="Sin acceso" chevron={false} /></Group>
      ) : (
        <>
          {canEvents || canGallery ? <Group header="Contenido">
            {canEvents ? <Row icon="calendar" label="Eventos y reuniones" sub="Administrar reuniones" onPress={() => router.push('/admin/eventos')} /> : null}
            {canGallery ? <Row icon="images" tint="#c08a3e" label="Galería de fotos" sub="Administrar imágenes permitidas" onPress={() => router.push('/admin/galeria')} /> : null}
          </Group> : null}
          {access.isSuperAdmin ? <Group header="Equipo">
            <Row icon="shield-checkmark" tint="#6b5b95" label="Roles y permisos" sub="Configurar acceso por módulo y usuario" onPress={() => router.push('/admin/roles' as Href)} />
            <Row icon="people" tint="#6b5b95" label="Usuarios y roles" sub="Permisos, invitaciones y accesos" onPress={() => router.push('/admin/usuarios')} />
            <Row icon="mail-unread" tint="#2f6db5" label="Destinatarios de correo" sub="Contacto y Únete por comunidad" onPress={() => router.push('/admin/correos')} />
          </Group> : null}
          {canDevotionals ? <Group header="Devocionales" footer="Gestiona los artículos y el flujo de revisión desde la app.">
            <Row icon="book" label="Devocionales" sub="Escribir, revisar y publicar" onPress={() => router.push('/admin/devocionales')} />
            {!access.isSuperAdmin ? <Row icon="share-outline" label="Compartir formulario para unirse" onPress={shareJoin} /> : null}
          </Group> : null}
          {canContent || canNotices ? <Group header="Publicaciones">
            {canContent ? <Row icon="layers" tint="#8e8187" label="Contenido y publicaciones" sub="Destacadas, YouTube y banner" onPress={() => router.push('/admin/contenido')} /> : null}
            {canNotices ? <Row icon="paper-plane" tint="#d64545" label="Enviar aviso" sub={canAdmin(access,'notices','send') ? 'Enviar notificaciones' : 'Solo acceso de lectura'} onPress={() => router.push('/admin/avisos')} /> : null}
            {access.isSuperAdmin ? <Row icon="share-outline" label="Compartir formulario para unirse" onPress={shareJoin} /> : null}
          </Group> : null}
          {canReadDashboard ? <Group header="Dashboard" footer="Filtros, exportación y métricas de registros.">
            <Row icon="stats-chart" tint="#8e8187" label="Registros y métricas" onPress={() => router.push('/admin/dashboard')} />
            {access.isSuperAdmin || access.permissions.includes('read_export') ? <Row icon="people-circle" tint="#2f7d4f" label="Seguimiento de nuevas" sub="Nuevas, contactadas e integradas" onPress={() => router.push('/admin/seguimiento')} /> : null}
            {access.isSuperAdmin || access.permissions.includes('read_export') ? <Row icon="analytics" tint="#2f6db5" label="Estadísticas" sub="Registros, lecturas, reuniones e inscripciones" onPress={() => router.push('/admin/estadisticas')} /> : null}
          </Group> : !canDevotionals && !canEvents && !canGallery && !canContent && !canNotices && !canReadDashboard ? <Group><Row icon="lock-closed" label="Tu cuenta no tiene herramientas administrativas disponibles." chevron={false} /></Group> : null}
          {bioSupported ? <Group header="Seguridad" footer={bioOn ? `Entrarás al panel con ${bioLabel}, sin escribir tu contraseña. Solo en este iPhone.` : `Actívalo para entrar al panel con ${bioLabel} en este dispositivo.`}>
            <SwitchRow icon="finger-print" tint="#34a853" label={`Entrar con ${bioLabel}`} value={bioOn} disabled={busy} onValueChange={toggleBiometrics} />
          </Group> : null}
          {access.isSuperAdmin || access.permissions.length > 0 ? <Group header="Preferencias" footer="Recibirás un aviso por correo dos días antes de cada cumpleaños.">
            <SwitchRow icon="gift-outline" label="Avisos de cumpleaños" value={access.permissions.includes('birthday_calendar')} onValueChange={(enabled) => {
              void setMyBirthdayCalendar(enabled).then(() => refresh()).catch((error) => Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Inténtalo de nuevo.'));
            }} />
          </Group> : null}
        </>
      )}

      <Group>
        <Row label="Cerrar sesión" destructive chevron={false} onPress={() => Alert.alert('Cerrar sesión', '¿Quieres salir del panel?', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Cerrar sesión', style: 'destructive', onPress: () => { void signOut(); } },
        ])} />
      </Group>
      <Modal visible={askPassword} transparent animationType="fade" onRequestClose={() => setAskPassword(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={a.backdrop}>
          <View style={a.sheet}>
            <Text style={a.sheetTitle}>Confirma tu contraseña</Text>
            <Text style={a.sheetCopy}>Para activar {bioLabel} necesitamos tu contraseña una sola vez.</Text>
            <TextInput value={pwd} onChangeText={setPwd} secureTextEntry autoFocus autoCapitalize="none" autoCorrect={false} textContentType="password" placeholder="Contraseña" placeholderTextColor="#a58e88" style={a.input} onSubmitEditing={() => void confirmPassword()} returnKeyType="done" />
            <View style={a.sheetActions}>
              <Pressable onPress={() => setAskPassword(false)} style={a.sheetBtn}><Text style={a.sheetCancel}>Cancelar</Text></Pressable>
              <Pressable disabled={busy || !pwd} onPress={() => void confirmPassword()} style={[a.sheetBtn, a.sheetPrimary, (busy || !pwd) && { opacity: 0.5 }]}><Text style={a.sheetOk}>{busy ? 'Comprobando…' : 'Activar'}</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const a = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(25,14,16,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  sheetTitle: { fontFamily: sans, fontSize: 18, fontWeight: '700', color: C.ink, textAlign: 'center' },
  sheetCopy: { fontFamily: sans, fontSize: 14, lineHeight: 20, color: C.muted, textAlign: 'center', marginTop: 6 },
  input: { marginTop: 16, height: 48, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, fontFamily: sans, fontSize: 16, color: C.ink, backgroundColor: C.bg },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  sheetBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.fill },
  sheetPrimary: { backgroundColor: C.wine },
  sheetCancel: { fontFamily: sans, fontSize: 16, fontWeight: '600', color: C.wine },
  sheetOk: { fontFamily: sans, fontSize: 16, fontWeight: '700', color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  page: { padding: 16, paddingBottom: 60 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 14, padding: 16, marginTop: 8 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: sans, fontSize: 22, fontWeight: '700', color: '#fff' },
  name: { fontFamily: sans, fontSize: 18, fontWeight: '600', color: C.ink, letterSpacing: -0.3 },
  role: { fontFamily: sans, fontSize: 14, color: C.muted, marginTop: 2 },
});
