import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Group, InputRow, Row } from '@/components/form';
import { Button } from '@/components/ui';
import { C, sans, SITE_URL } from '@/constants/theme';
import { sendPasswordReset, signIn, signOut } from '@/lib/admin';
import { useAdmin } from '@/lib/use-admin';

const openWebAdmin = () =>
  WebBrowser.openBrowserAsync(`${SITE_URL}/admin.html`, { controlsColor: C.wine, presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return Alert.alert('Completa los datos', 'Escribe tu correo y tu contraseña.');
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (e) {
      Alert.alert('No se pudo entrar', e instanceof Error ? e.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={a.page} keyboardShouldPersistTaps="handled">
        <View style={a.hero}>
          <View style={a.lock}><Ionicons name="shield-checkmark" size={30} color="#fff" /></View>
          <Text style={a.title}>Panel privado</Text>
          <Text style={a.copy}>Entra con tu cuenta autorizada para gestionar el contenido de la comunidad.</Text>
        </View>
        <Group>
          <InputRow label="Correo" value={email} onChangeText={setEmail} placeholder="nombre@correo.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="username" />
          <InputRow label="Contraseña" value={password} onChangeText={setPassword} placeholder="Tu contraseña" secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} returnKeyType="go" />
        </Group>
        <Button label={busy ? 'Entrando…' : 'Entrar'} icon="log-in-outline" onPress={() => { if (!busy) void submit(); }} style={{ marginTop: 22 }} />
        <Pressable
          onPress={async () => {
            if (!email.trim()) return Alert.alert('Escribe tu correo', 'Te enviaremos un enlace para crear una contraseña nueva.');
            try { await sendPasswordReset(email); Alert.alert('Revisa tu correo', 'Te enviamos un enlace para restablecer la contraseña.'); }
            catch (e) { Alert.alert('No se pudo enviar', e instanceof Error ? e.message : ''); }
          }}
          style={a.link}>
          <Text style={a.linkText}>Olvidé mi contraseña</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function AdminHome() {
  const { access, ready } = useAdmin();

  if (!ready) return <View style={a.center}><ActivityIndicator color={C.wine} /></View>;
  if (!access) return <Login />;

  const name = access.nombre || access.email;
  const editorOnly = !access.isSuperAdmin;

  return (
    <ScrollView contentContainerStyle={a.page}>
      <View style={a.profile}>
        <View style={a.avatar}><Text style={a.avatarText}>{name.charAt(0).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={a.name} numberOfLines={1}>{name}</Text>
          <Text style={a.role}>{access.isRevoked ? 'Acceso revocado' : access.isSuperAdmin ? 'Super Admin' : 'Equipo editorial'}</Text>
        </View>
      </View>

      {access.isRevoked ? (
        <Group footer="Tu acceso fue revocado. Contacta a la administración si crees que es un error."><Row label="Sin acceso" chevron={false} /></Group>
      ) : editorOnly ? (
        <Group header="Tu espacio" footer="Tu cuenta puede gestionar devocionales. Ábrelos en el editor completo.">
          <Row icon="book" label="Devocionales" sub="Escribir, revisar y publicar" onPress={openWebAdmin} />
        </Group>
      ) : (
        <>
          <Group header="Contenido">
            <Row icon="calendar" label="Eventos y reuniones" sub="Crear, editar, horarios y enlaces" onPress={() => router.push('/admin/eventos')} />
            <Row icon="images" tint="#c08a3e" label="Subir fotos a la galería" sub="Desde tu teléfono, por país y galería" onPress={() => router.push('/admin/galeria')} />
          </Group>
          <Group header="Equipo">
            <Row icon="people" tint="#6b5b95" label="Usuarios y roles" sub="Permisos, invitaciones y accesos" onPress={() => router.push('/admin/usuarios')} />
          </Group>
          <Group header="Más herramientas" footer="Destacadas, YouTube, devocionales, banner y el dashboard siguen disponibles en el admin completo.">
            <Row icon="globe" tint="#8e8187" label="Admin completo" sub="Abrir la versión web" onPress={openWebAdmin} />
            <Row icon="stats-chart" tint="#8e8187" label="Dashboard" sub="Registros de la comunidad" onPress={() => WebBrowser.openBrowserAsync(`${SITE_URL}/dashboard.html`, { controlsColor: C.wine })} />
          </Group>
        </>
      )}

      <Group>
        <Row label="Cerrar sesión" destructive chevron={false} onPress={() => Alert.alert('Cerrar sesión', '¿Quieres salir del panel?', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Cerrar sesión', style: 'destructive', onPress: () => { void signOut(); } },
        ])} />
      </Group>
    </ScrollView>
  );
}

const a = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  page: { padding: 16, paddingBottom: 60 },
  hero: { alignItems: 'center', paddingTop: 26, paddingBottom: 4 },
  lock: { width: 68, height: 68, borderRadius: 20, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 10px 24px rgba(166,75,67,0.3)' },
  title: { fontFamily: sans, fontSize: 28, fontWeight: '700', letterSpacing: -0.6, color: C.ink },
  copy: { fontFamily: sans, fontSize: 15, lineHeight: 21, color: C.muted, textAlign: 'center', marginTop: 8, paddingHorizontal: 16 },
  link: { alignSelf: 'center', padding: 14 },
  linkText: { fontFamily: sans, fontSize: 15, fontWeight: '600', color: C.wine },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 14, padding: 16, marginTop: 8 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: sans, fontSize: 22, fontWeight: '700', color: '#fff' },
  name: { fontFamily: sans, fontSize: 18, fontWeight: '600', color: C.ink, letterSpacing: -0.3 },
  role: { fontFamily: sans, fontSize: 14, color: C.muted, marginTop: 2 },
});
