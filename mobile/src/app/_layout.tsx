import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { CelebrationConfetti } from '@/components/celebration-confetti';
import { LaunchScreen } from '@/components/launch-screen';
import { C } from '@/constants/theme';
import { loadLiveActivitiesPreference } from '@/lib/live-activity';
import { recordNotification, syncFromTray } from '@/lib/notification-inbox';
import { configureNotificationChannels, handleNotificationResponse, refreshNotificationRegistration } from '@/lib/notifications';

SplashScreen.preventAutoHideAsync();

// Native only: push notifications don't exist in the web preview.
function NotificationResponder() {
  const lastResponse = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    configureNotificationChannels().catch(() => {});
    loadLiveActivitiesPreference().catch(() => {});
    // Silently restore meeting and birthday preferences when the Expo token rotates.
    refreshNotificationRegistration().catch(() => {});
  }, []);

  // Inbox (Inicio → campana): keep a copy of every notification this phone gets.
  useEffect(() => {
    void syncFromTray().catch(() => {});
    const received = Notifications.addNotificationReceivedListener((n) => { void recordNotification(n).catch(() => {}); });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncFromTray().catch(() => {});
    });
    return () => { received.remove(); appState.remove(); };
  }, []);

  // Covers both a cold start from a notification and taps while running.
  useEffect(() => {
    if (!lastResponse) return;
    const id = lastResponse.notification.request.identifier + lastResponse.actionIdentifier;
    if (handled.current === id) return;
    handled.current = id;
    void recordNotification(lastResponse.notification, true).catch(() => {});
    handleNotificationResponse(lastResponse)
      .then(() => Notifications.clearLastNotificationResponseAsync())
      .catch(() => {});
  }, [lastResponse]);

  return null;
}

export default function RootLayout() {
  // The native splash is hidden by <LaunchScreen /> as soon as it is on screen,
  // so the hand-off is seamless; this is only a safety net.
  useEffect(() => {
    const timer = setTimeout(() => { void SplashScreen.hideAsync().catch(() => {}); }, 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {Platform.OS !== 'web' ? <NotificationResponder /> : null}
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: C.wine,
          headerStyle: { backgroundColor: C.bg },
          headerTitleStyle: { color: C.ink },
          contentStyle: { backgroundColor: C.bg },
          headerBackTitle: 'Atrás',
          // Native iOS push everywhere; the same feel on Android.
          animation: Platform.OS === 'android' ? 'ios_from_right' : 'default',
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="devocional/[slug]" options={{ title: 'Devocional' }} />
        <Stack.Screen name="galeria" options={{ title: '', headerShadowVisible: false }} />
        <Stack.Screen name="destacadas" options={{ title: '', headerShadowVisible: false }} />
        <Stack.Screen name="aportar" options={{ title: 'Donar' }} />
        <Stack.Screen name="contacto" options={{ title: 'Contacto' }} />
        <Stack.Screen name="avisos-cumpleanos" options={{ title: 'Avisos de cumpleaños' }} />
        <Stack.Screen name="notificaciones" options={{ title: 'Notificaciones' }} />
        <Stack.Screen name="join" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
      </Stack>
      <LaunchScreen />
      <CelebrationConfetti />
    </GestureHandlerRootView>
  );
}
