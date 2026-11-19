import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { ADMIN_REMEMBER_SESSION_KEY } from './app-preferences';

// Development builds must be explicitly pointed at the isolated local stack.
// Release builds retain the hosted project configuration.
const PRODUCTION_SUPABASE_URL = 'https://jkunywiyiyidhyodsbfh.supabase.co';
const PRODUCTION_SUPABASE_KEY = 'sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX';
const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const configuredKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
const isDevelopment = __DEV__;
const SUPABASE_URL = isDevelopment ? (configuredUrl || '') : (configuredUrl || PRODUCTION_SUPABASE_URL);
const SUPABASE_KEY = isDevelopment ? (configuredKey || '') : (configuredKey || PRODUCTION_SUPABASE_KEY);

if (isDevelopment && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error('Supabase local no está configurado. Define EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY antes de iniciar la app.');
}
if (isDevelopment && SUPABASE_URL && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(SUPABASE_URL)) {
  throw new Error('En desarrollo, la app solo puede usar Supabase local (localhost o 127.0.0.1).');
}

// "Recordarme" on: the session is persisted on the phone.
// "Recordarme" off: the session lives only in memory while the app is open
// (signing in must still work; it is simply forgotten when the app closes).
const memorySession = new Map<string, string>();
const remembering = async () => (await AsyncStorage.getItem(ADMIN_REMEMBER_SESSION_KEY)) !== 'false';

const nativeAuthStorage = {
  async getItem(key: string) {
    if (memorySession.has(key)) return memorySession.get(key)!;
    if (!(await remembering())) return null;
    return AsyncStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    if (await remembering()) {
      memorySession.delete(key);
      await AsyncStorage.setItem(key, value);
      return;
    }
    memorySession.set(key, value);
    await AsyncStorage.removeItem(key);
  },
  async removeItem(key: string) {
    memorySession.delete(key);
    await AsyncStorage.removeItem(key);
  },
};

/** The project this build talks to (local stack in development, hosted in release). */
export const SUPABASE_PROJECT = { url: SUPABASE_URL || 'http://127.0.0.1:55421', key: SUPABASE_KEY || 'local-unconfigured-anon-key' };

export const supabase = createClient(SUPABASE_PROJECT.url, SUPABASE_PROJECT.key, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : nativeAuthStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// Only refresh tokens while the app is in the foreground (Supabase RN guidance).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
