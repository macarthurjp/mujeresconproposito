import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

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
      }}>
      <Stack.Screen name="index" options={{ title: 'Administración' }} />
      <Stack.Screen name="eventos" options={{ title: 'Eventos' }} />
      <Stack.Screen name="evento" options={{ title: 'Evento', presentation: 'modal' }} />
      <Stack.Screen name="galeria" options={{ title: 'Subir fotos', presentation: 'modal' }} />
      <Stack.Screen name="usuarios" options={{ title: 'Usuarios y roles' }} />
      <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Stack.Screen name="contenido" options={{ title: 'Contenido' }} />
      <Stack.Screen name="devocionales" options={{ title: 'Devocionales' }} />
    </Stack>
  );
}
