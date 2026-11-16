import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SHOW_HOME_ACTIVITIES_KEY = 'mcp930:show-home-activities';
const DYNAMIC_ISLAND_ENABLED_KEY = 'mcp930:dynamic-island-enabled';
const ADMIN_REMEMBERED_EMAIL_KEY = 'mcp930:admin-remembered-email';
export const ADMIN_REMEMBER_SESSION_KEY = 'mcp930:admin-remember-session';
const ADMIN_BIOMETRIC_ENABLED_KEY = 'mcp930:admin-biometric-enabled';
const ADMIN_BIOMETRIC_CREDENTIALS_KEY = 'mcp930:admin-biometric-credentials';

// Credentials live in the iOS Keychain / Android Keystore, only on this device
// and only while unlocked. Reading them is gated by a Face ID / fingerprint
// prompt (LocalAuthentication) right before use.
const keychain: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// Password of the current session, kept in memory only, so Face ID can be
// turned on from the admin screen without typing it again.
let sessionPassword: { email: string; password: string } | null = null;
export function rememberSessionPassword(email: string, password: string) {
  sessionPassword = { email: email.trim().toLowerCase(), password };
}
export function getSessionPassword() {
  return sessionPassword;
}
export function forgetSessionPassword() {
  sessionPassword = null;
}

/** "Face ID", "Touch ID" or "huella", for labels. */
export async function biometricLabel() {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'Face ID';
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return Platform.OS === 'ios' ? 'Touch ID' : 'huella';
  } catch { /* fall through */ }
  return 'Face ID o huella';
}

export async function confirmWithBiometrics(reason: string) {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Cancelar',
    disableDeviceFallback: false,
  });
  return result.success;
}

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
  return (await SecureStore.isAvailableAsync()) && (await deviceSupportsBiometrics());
}

export async function deviceSupportsBiometrics() {
  const [hardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hardware && enrolled;
}

export async function saveBiometricAdminCredentials(email: string, password: string) {
  await SecureStore.setItemAsync(ADMIN_BIOMETRIC_CREDENTIALS_KEY, JSON.stringify({ email: email.trim().toLowerCase(), password }), keychain);
  await AsyncStorage.setItem(ADMIN_BIOMETRIC_ENABLED_KEY, 'true');
}

/** Asks for Face ID / fingerprint, then returns the saved credentials. */
export async function getBiometricAdminCredentials() {
  if (!(await confirmWithBiometrics('Entrar al panel privado'))) throw new Error('cancelled');
  const value = await SecureStore.getItemAsync(ADMIN_BIOMETRIC_CREDENTIALS_KEY, keychain);
  if (!value) return null;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || !('email' in parsed) || !('password' in parsed)
    || typeof parsed.email !== 'string' || typeof parsed.password !== 'string') return null;
  return { email: parsed.email, password: parsed.password };
}

export async function clearBiometricAdminCredentials() {
  await AsyncStorage.removeItem(ADMIN_BIOMETRIC_ENABLED_KEY);
  try { await SecureStore.deleteItemAsync(ADMIN_BIOMETRIC_CREDENTIALS_KEY, keychain); } catch { /* nothing stored */ }
  // Items saved by older builds used an access control that needs a prompt to delete.
  try { await SecureStore.deleteItemAsync(ADMIN_BIOMETRIC_CREDENTIALS_KEY, { requireAuthentication: true }); } catch { /* ignore */ }
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
