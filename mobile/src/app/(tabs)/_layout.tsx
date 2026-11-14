import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View, type ColorValue } from 'react-native';

import { LiveBanner } from '@/components/live-banner';
import { tapFeedback } from '@/components/ui';
import { C, sans } from '@/constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const tab = (title: string, icon: IconName, iconActive: IconName) => ({
  title,
  tabBarIcon: ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? iconActive : icon} size={25} color={typeof color === 'string' ? color : C.muted} />
  ),
});

// Translucent material behind the tab bar, like iOS system apps. Android's
// real blur needs a BlurTargetView around the content, so it gets a near-opaque fill.
function TabBarBackground() {
  if (Platform.OS === 'ios') {
    return <BlurView tint="systemChromeMaterialLight" intensity={100} style={StyleSheet.absoluteFill} />;
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(250,245,244,0.96)' }]} />;
}

export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
    <Tabs
      screenListeners={{ tabPress: () => tapFeedback() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.wine,
        tabBarInactiveTintColor: '#8e8187',
        tabBarBackground: () => <TabBarBackground />,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: Platform.OS === 'web' ? 'rgba(250,245,244,0.86)' : 'transparent',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: C.separator,
          elevation: 0,
        },
        tabBarLabelStyle: { fontFamily: sans, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.1 },
      }}>
      <Tabs.Screen name="index" options={tab('Inicio', 'home-outline', 'home')} />
      <Tabs.Screen name="eventos" options={tab('Reuniones', 'videocam-outline', 'videocam')} />
      <Tabs.Screen
        name="devocionales"
        options={{
          title: 'Devocional',
          // Closed Bible with a cross (Ionicons only has an open book)
          tabBarIcon: ({ color }: { color: ColorValue }) => (
            <MaterialCommunityIcons name="book-cross" size={25} color={typeof color === 'string' ? color : C.muted} />
          ),
        }}
      />
      <Tabs.Screen name="unirse" options={tab('Únete', 'person-add-outline', 'person-add')} />
      <Tabs.Screen name="aportar" options={{ href: null }} />
      <Tabs.Screen name="mas" options={tab('Más', 'grid-outline', 'grid')} />
    </Tabs>
    <LiveBanner />
    </View>
  );
}
