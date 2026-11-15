import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveBanner } from '@/components/live-banner';
import { PrayerButton } from '@/components/prayer-button';
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
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <BlurView tint="light" intensity={48} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,247,246,0.24)' }]} />
      </View>
    );
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,247,246,0.76)' }]} />;
}

export default function TabsLayout() {
  const [liveVisible, setLiveVisible] = useState(false);
  const insets = useSafeAreaInsets();
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
          start: 20,
          end: 20,
          bottom: Math.max(insets.bottom, 8) + 8,
          height: 62,
          paddingTop: 3,
          paddingBottom: 3,
          borderRadius: 31,
          overflow: 'hidden',
          backgroundColor: Platform.OS === 'web' ? 'rgba(255,247,246,0.70)' : 'transparent',
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.52)',
          elevation: 0,
          boxShadow: '0 8px 24px rgba(91,48,55,0.13)',
        },
        tabBarLabelStyle: { fontFamily: sans, fontSize: 10, fontWeight: '600', letterSpacing: 0.1 },
      }}>
      <Tabs.Screen name="index" options={tab('Inicio', 'home-outline', 'home')} />
      <Tabs.Screen name="eventos" options={tab('Reuniones', 'videocam-outline', 'videocam')} />
      <Tabs.Screen name="unirse" options={tab('Únete', 'person-add-outline', 'person-add')} />
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
      <Tabs.Screen name="mas" options={tab('Más', 'grid-outline', 'grid')} />
    </Tabs>
    <LiveBanner onVisibleChange={setLiveVisible} />
    <PrayerButton raised={liveVisible} />
    </View>
  );
}
