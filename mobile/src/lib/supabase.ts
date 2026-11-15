import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { ADMIN_REMEMBER_SESSION_KEY } from './app-preferences';

// Same project and publishable key as the website. Admin writes are protected
// by Row Level Security (is_super_admin) and the manage-users Edge Function.
const SUPABASE_URL = 'https://jkunywiyiyidhyodsbfh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX';

const nativeAuthStorage = {
  async getItem(key: string) {
    if (await AsyncStorage.getItem(ADMIN_REMEMBER_SESSION_KEY) === 'false') return null;
    return AsyncStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    if (await AsyncStorage.getItem(ADMIN_REMEMBER_SESSION_KEY) === 'false') {
      await AsyncStorage.removeItem(key);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
  async removeItem(key: string) {
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
