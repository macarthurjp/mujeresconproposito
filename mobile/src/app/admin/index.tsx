import { router } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { AdminLogin } from '@/components/admin-login';
import { Group, Row, SwitchRow } from '@/components/form';
import { C, sans } from '@/constants/theme';
import { setMyBirthdayCalendar, signOut } from '@/lib/admin';
import { useAdmin } from '@/lib/use-admin';

export default function AdminHome() {
  const { access, ready, refresh } = useAdmin();

  if (!ready) return <View style={a.center}><ActivityIndicator color={C.wine} /></View>;
  if (!access) return <AdminLogin />;

  const name = access.nombre || access.email;
  const roleLabel = access.isRevoked ? 'Acceso revocado' : access.isSuperAdmin ? 'Super Admin' : [
    access.permissions.includes('editor') ? 'Editora' : null,
    access.permissions.includes('reviewer') ? 'Revisor editorial' : null,
    access.permissions.includes('read_export') ? 'Manager' : null,
    access.permissions.includes('birthday_calendar') ? 'Calendario de cumpleaños' : null,
  ].filter(Boolean).join(' · ') || (access.permissions.includes('read_only') ? 'Vista simple' : 'Acceso limitado');
  const canWriteEditorial = access.isSuperAdmin || access.permissions.includes('editor') || access.permissions.includes('reviewer');
  const canReadDashboard = access.isSuperAdmin || access.permissions.includes('read_export') || access.permissions.includes('read_only');

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
          {access.isSuperAdmin ? <Group header="Contenido">
            <Row icon="calendar" label="Eventos y reuniones" sub="Crear, editar, horarios y enlaces" onPress={() => router.push('/admin/eventos')} />
            <Row icon="images" tint="#c08a3e" label="Galería de fotos" sub="Subir y administrar fotos y categorías" onPress={() => router.push('/admin/galeria')} />
          </Group> : null}
          {access.isSuperAdmin ? <Group header="Equipo">
            <Row icon="people" tint="#6b5b95" label="Usuarios y roles" sub="Permisos, invitaciones y accesos" onPress={() => router.push('/admin/usuarios')} />
          </Group> : null}
          {canWriteEditorial ? <Group header="Devocionales" footer="Gestiona los artículos y el flujo de revisión desde la app.">
            <Row icon="book" label="Devocionales" sub="Escribir, revisar y publicar" onPress={() => router.push('/admin/devocionales')} />
            {!access.isSuperAdmin ? <Row icon="share-outline" label="Compartir formulario para unirse" onPress={() => { void Share.share({ title: 'Únete a Mujeres con Propósito', message: 'Completa el formulario para unirte a Mujeres con Propósito: https://mcp930.org/#join' }); }} /> : null}
          </Group> : null}
          {access.isSuperAdmin ? <Group header="Publicaciones">
            <Row icon="layers" tint="#8e8187" label="Contenido y publicaciones" sub="Destacadas, YouTube y banner" onPress={() => router.push('/admin/contenido')} />
            <Row icon="share-outline" label="Compartir formulario para unirse" onPress={() => { void Share.share({ title: 'Únete a Mujeres con Propósito', message: 'Completa el formulario para unirte a Mujeres con Propósito: https://mcp930.org/#join' }); }} />
          </Group> : null}
          {canReadDashboard ? <Group header="Dashboard" footer="Filtros, exportación y métricas de registros.">
            <Row icon="stats-chart" tint="#8e8187" label="Registros y métricas" onPress={() => router.push('/admin/dashboard')} />
          </Group> : !canWriteEditorial ? <Group><Row icon="lock-closed" label="Tu cuenta no tiene herramientas administrativas disponibles." chevron={false} /></Group> : null}
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
    </ScrollView>
  );
}

const a = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  page: { padding: 16, paddingBottom: 60 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 14, padding: 16, marginTop: 8 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: sans, fontSize: 22, fontWeight: '700', color: '#fff' },
  name: { fontFamily: sans, fontSize: 18, fontWeight: '600', color: C.ink, letterSpacing: -0.3 },
  role: { fontFamily: sans, fontSize: 14, color: C.muted, marginTop: 2 },
});
