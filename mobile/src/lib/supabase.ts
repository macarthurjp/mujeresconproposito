import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { ADMIN_REMEMBER_SESSION_KEY } from './app-preferences';

// Same project and publishable key as the website. Admin writes are protected
// by Row Level Security (is_super_admin) and the manage-users Edge Function.
const SUPABASE_URL = 'https://jkunywiyiyidhyodsbfh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX';

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

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
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
