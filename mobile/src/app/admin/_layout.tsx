import { Stack } from 'expo-router';
import { ActivityIndicator, Platform, View } from 'react-native';

import { AdminLogin } from '@/components/admin-login';
import { C, sans } from '@/constants/theme';
import { useAdmin } from '@/lib/use-admin';

export default function AdminLayout() {
  const { access, ready } = useAdmin();
  if (!ready) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}><ActivityIndicator color={C.wine} /></View>;
  if (!access) return <AdminLogin />;
  return (
    <Stack
      screenOptions={{
        headerTintColor: C.wine,
        headerStyle: { backgroundColor: C.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: sans, fontWeight: '600', color: C.ink },
        headerBackTitle: 'Atrás',
        contentStyle: { backgroundColor: C.bg },
        animation: Platform.OS === 'android' ? 'ios_from_right' : 'default',
      }}>
      <Stack.Screen name="index" options={{ title: 'Administración' }} />
      <Stack.Screen name="eventos" options={{ title: 'Eventos' }} />
      <Stack.Screen name="evento" options={{ title: 'Evento', presentation: 'modal' }} />
      <Stack.Screen name="galeria" options={{ title: 'Galería', presentation: 'modal' }} />
      <Stack.Screen name="usuarios" options={{ title: 'Usuarios y roles' }} />
      <Stack.Screen name="roles" options={{ title: 'Roles y permisos' }} />
      <Stack.Screen name="correos" options={{ title: 'Destinatarios de correo' }} />
      <Stack.Screen name="seguimiento" options={{ title: 'Seguimiento de nuevas' }} />
      <Stack.Screen name="avisos" options={{ title: 'Enviar aviso' }} />
      <Stack.Screen name="estadisticas" options={{ title: 'Estadísticas' }} />
      <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Stack.Screen name="contenido" options={{ title: 'Contenido' }} />
      <Stack.Screen name="devocionales" options={{ title: 'Devocionales' }} />
    </Stack>
  );
}
