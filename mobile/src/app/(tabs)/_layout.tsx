import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { C } from '@/constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const tab = (title: string, icon: IconName, iconActive: IconName) => ({
  title,
  tabBarIcon: ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? iconActive : icon} size={24} color={typeof color === "string" ? color : C.muted} />
  ),
});

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.wine,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: { backgroundColor: C.ivory, borderTopColor: C.line },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tabs.Screen name="index" options={tab('Inicio', 'home-outline', 'home')} />
      <Tabs.Screen name="eventos" options={tab('Reuniones', 'videocam-outline', 'videocam')} />
      <Tabs.Screen name="devocionales" options={tab('Devocional', 'book-outline', 'book')} />
      <Tabs.Screen name="unirse" options={tab('Únete', 'person-add-outline', 'person-add')} />
      <Tabs.Screen name="aportar" options={{ href: null }} />
      <Tabs.Screen name="mas" options={tab('Más', 'grid-outline', 'grid')} />
    </Tabs>
  );
}
