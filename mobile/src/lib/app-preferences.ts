import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const SHOW_HOME_ACTIVITIES_KEY = 'mcp930:show-home-activities';
const DYNAMIC_ISLAND_ENABLED_KEY = 'mcp930:dynamic-island-enabled';
const ADMIN_REMEMBERED_EMAIL_KEY = 'mcp930:admin-remembered-email';
export const ADMIN_REMEMBER_SESSION_KEY = 'mcp930:admin-remember-session';
const ADMIN_BIOMETRIC_ENABLED_KEY = 'mcp930:admin-biometric-enabled';
const ADMIN_BIOMETRIC_CREDENTIALS_KEY = 'mcp930:admin-biometric-credentials';

const biometricOptions: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Confirma tu identidad para entrar al panel privado',
};

export async function getRememberedAdminEmail() {
  return (await AsyncStorage.getItem(ADMIN_REMEMBERED_EMAIL_KEY)) ?? '';
}

export async function setRememberedAdminEmail(email: string | null) {
  await AsyncStorage.setItem(ADMIN_REMEMBER_SESSION_KEY, String(Boolean(email)));
  if (email) await AsyncStorage.setItem(ADMIN_REMEMBERED_EMAIL_KEY, email.trim().toLowerCase());
  else await AsyncStorage.removeItem(ADMIN_REMEMBERED_EMAIL_KEY);
}

export async function setRememberAdminSession(enabled: boolean) {
  await AsyncStorage.setItem(ADMIN_REMEMBER_SESSION_KEY, String(enabled));
}

export async function getBiometricLoginAvailable() {
  if (await AsyncStorage.getItem(ADMIN_BIOMETRIC_ENABLED_KEY) !== 'true') return false;
  return SecureStore.isAvailableAsync();
}

export async function deviceSupportsBiometrics() {
  const [hardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hardware && enrolled;
}

export async function saveBiometricAdminCredentials(email: string, password: string) {
  await SecureStore.setItemAsync(ADMIN_BIOMETRIC_CREDENTIALS_KEY, JSON.stringify({ email: email.trim().toLowerCase(), password }), biometricOptions);
  await AsyncStorage.setItem(ADMIN_BIOMETRIC_ENABLED_KEY, 'true');
}

export async function getBiometricAdminCredentials() {
  const value = await SecureStore.getItemAsync(ADMIN_BIOMETRIC_CREDENTIALS_KEY, biometricOptions);
  if (!value) return null;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || !('email' in parsed) || !('password' in parsed)
    || typeof parsed.email !== 'string' || typeof parsed.password !== 'string') return null;
  return { email: parsed.email, password: parsed.password };
}

export async function clearBiometricAdminCredentials() {
  await SecureStore.deleteItemAsync(ADMIN_BIOMETRIC_CREDENTIALS_KEY, biometricOptions);
  await AsyncStorage.removeItem(ADMIN_BIOMETRIC_ENABLED_KEY);
}

export async function getShowHomeActivities() {
  return (await AsyncStorage.getItem(SHOW_HOME_ACTIVITIES_KEY)) !== 'false';
}

export async function setShowHomeActivities(enabled: boolean) {
  await AsyncStorage.setItem(SHOW_HOME_ACTIVITIES_KEY, String(enabled));
}

export async function getDynamicIslandEnabled() {
  return (await AsyncStorage.getItem(DYNAMIC_ISLAND_ENABLED_KEY)) !== 'false';
}

export async function setDynamicIslandEnabled(enabled: boolean) {
  await AsyncStorage.setItem(DYNAMIC_ISLAND_ENABLED_KEY, String(enabled));
}
