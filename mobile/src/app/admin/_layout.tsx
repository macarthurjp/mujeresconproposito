import { Stack } from 'expo-router';

import { C, sans } from '@/constants/theme';

export default function AdminLayout() {
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
    </Stack>
  );
}
