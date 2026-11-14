import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { C } from '@/constants/theme';
import { configureNotificationChannels, handleNotificationResponse, registerForMeetingAlerts } from '@/lib/notifications';

SplashScreen.preventAutoHideAsync();

// Native only: push notifications don't exist in the web preview.
function NotificationResponder() {
  const lastResponse = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    configureNotificationChannels().catch(() => {});
    // Re-register silently on every launch (token can rotate); never prompts here.
    registerForMeetingAlerts(false).catch(() => {});
  }, []);

  // Covers both a cold start from a notification and taps while running.
  useEffect(() => {
    if (!lastResponse) return;
    const id = lastResponse.notification.request.identifier + lastResponse.actionIdentifier;
    if (handled.current === id) return;
    handled.current = id;
    handleNotificationResponse(lastResponse)
      .then(() => Notifications.clearLastNotificationResponseAsync())
      .catch(() => {});
  }, [lastResponse]);

  return null;
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <>
      {Platform.OS !== 'web' ? <NotificationResponder /> : null}
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: C.wine,
          headerStyle: { backgroundColor: C.bg },
          headerTitleStyle: { color: C.ink },
          contentStyle: { backgroundColor: C.bg },
          headerBackTitle: 'Atrás',
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="devocional/[slug]" options={{ title: 'Devocional' }} />
        <Stack.Screen name="galeria" options={{ title: '', headerShadowVisible: false }} />
        <Stack.Screen name="destacadas" options={{ title: '', headerShadowVisible: false }} />
      </Stack>
    </>
  );
}
