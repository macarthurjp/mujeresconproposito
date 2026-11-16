import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Group, InputRow, SwitchRow } from '@/components/form';
import { Button } from '@/components/ui';
import { C, sans } from '@/constants/theme';
import { enabledProviders, sendPasswordReset, signIn, signInWithProvider } from '@/lib/admin';
import {
  biometricLabel, clearBiometricAdminCredentials, getBiometricAdminCredentials,
  getBiometricLoginAvailable, getRememberedAdminEmail, rememberSessionPassword,
  setRememberAdminSession, setRememberedAdminEmail,
} from '@/lib/app-preferences';
import { supabase } from '@/lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function maskedEmail(value: string) {
  const [name, domain] = value.trim().split('@');
  if (!name || !domain) return value.trim();
  return `${name.slice(0, 1)}${'•'.repeat(Math.min(5, Math.max(2, name.length - 1)))}@${domain}`;
}

export function AdminLogin() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [bioLabel, setBioLabel] = useState('Face ID');
  const [biometricLoginAvailable, setBiometricLoginAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  // Only show Apple/Google when enabled in Supabase Auth (public settings endpoint).
  const [providers, setProviders] = useState<{ apple: boolean; google: boolean }>({ apple: false, google: false });

  useEffect(() => {
    let alive = true;
    void Promise.all([getRememberedAdminEmail(), getBiometricLoginAvailable(), biometricLabel()]).then(([savedEmail, available, label]) => {
      if (!alive) return;
      if (savedEmail) { setEmail(savedEmail); setRemember(true); }
      setBiometricLoginAvailable(available);
      setBioLabel(label);
    }).catch(() => {});
    void enabledProviders().then((p) => { if (alive) setProviders(p); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); }
    catch (error) { Alert.alert('No se pudo entrar', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  };

  const submit = () => {
    if (!email.trim() || !password) return Alert.alert('Completa los datos', 'Escribe tu correo y tu contraseña.');
    void run(async () => {
      await setRememberAdminSession(remember);
      await signIn(email, password);
      rememberSessionPassword(email, password);
      await setRememberedAdminEmail(remember ? email : null).catch(() => {});
    });
  };

  const biometricSignIn = () => void run(async () => {
    let credentials;
    try {
      credentials = await getBiometricAdminCredentials();
    } catch (error) {
      if (error instanceof Error && error.message === 'cancelled') return;
      throw error;
    }
    if (!credentials) {
      await clearBiometricAdminCredentials();
      setBiometricLoginAvailable(false);
      throw new Error(`Vuelve a entrar con tu correo y activa ${bioLabel} en Administración → Preferencias.`);
    }
    try {
      await signIn(credentials.email, credentials.password);
      rememberSessionPassword(credentials.email, credentials.password);
    } catch (error) {
      if (error instanceof Error && error.message === 'Correo o contraseña incorrectos.') {
        await clearBiometricAdminCredentials();
        setBiometricLoginAvailable(false);
        setEmail(credentials.email);
        throw new Error(`Tu contraseña cambió. Escríbela de nuevo y vuelve a activar ${bioLabel} en Administración → Preferencias.`);
      }
      throw error;
    }
  });

  const providerSignIn = (provider: 'apple' | 'google') => void run(async () => {
    await setRememberAdminSession(remember);
    const completed = await signInWithProvider(provider);
    if (!completed) return;
    const { data } = await supabase.auth.getUser();
    await setRememberedAdminEmail(remember && data.user?.email ? data.user.email : null);
  });

  const forgotPassword = () => {
    const destination = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)) {
      return Alert.alert('Escribe un correo válido', 'Introduce el correo de la cuenta y vuelve a tocar “Olvidé mi contraseña”.');
    }
    Alert.alert('Enviar enlace de recuperación', `Enviaremos el enlace a ${maskedEmail(destination)}.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Enviar', onPress: () => void run(async () => {
        await sendPasswordReset(destination);
        Alert.alert('Revisa tu correo', `Enviamos el enlace a ${maskedEmail(destination)}. Si no aparece, revisa también la carpeta de spam.`);
      }) },
    ]);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[s.page, { paddingTop: insets.top + 10 }]} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver al inicio de la aplicación"
          onPress={() => router.replace('/(tabs)')}
          style={({ pressed }) => [s.homeButton, pressed && { opacity: 0.72 }]}>
          <Ionicons name="home-outline" size={17} color={C.wine} />
          <Text style={s.homeButtonText}>Volver al inicio</Text>
        </Pressable>
        <View style={s.hero}>
          <View style={s.lock}><Ionicons name="shield-checkmark" size={30} color="#fff" /></View>
          <Text style={s.title}>Panel privado</Text>
          <Text style={s.copy}>Inicia sesión en la app con una cuenta autorizada para administración o dashboard.</Text>
        </View>
        <Group>
          <InputRow label="Correo" value={email} onChangeText={setEmail} placeholder="nombre@correo.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="username" />
          <View>
            <InputRow label="Contraseña" value={password} onChangeText={setPassword} placeholder="Tu contraseña" secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="password" textContentType="password" onSubmitEditing={submit} returnKeyType="go" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              hitSlop={10}
              onPress={() => setShowPassword((v) => !v)}
              style={s.eye}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={C.muted} />
            </Pressable>
          </View>
        </Group>
        <Group>
          <SwitchRow icon="person-circle" label="Recordarme en este dispositivo" value={remember} onValueChange={setRemember} />
        </Group>
        <Button label={busy ? 'Entrando…' : 'Entrar con correo'} icon="log-in-outline" onPress={submit} style={{ marginTop: 20 }} />
        {biometricLoginAvailable ? <Pressable accessibilityRole="button" disabled={busy} onPress={biometricSignIn} style={({ pressed }) => [s.biometric, pressed && { opacity: 0.78 }]}>
          <Ionicons name="finger-print-outline" size={22} color={C.wine} />
          <Text style={s.biometricText}>Entrar con {bioLabel}</Text>
        </Pressable> : null}
        {(providers.apple && Platform.OS === 'ios') || providers.google ? <View style={s.divider}><View style={s.rule} /><Text style={s.or}>o continúa con</Text><View style={s.rule} /></View> : null}
        {providers.apple && Platform.OS === 'ios' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => providerSignIn('apple')} style={({ pressed }) => [s.social, s.apple, pressed && { opacity: 0.82 }]}>
          <Ionicons name="logo-apple" size={21} color="#fff" />
          <Text style={[s.socialText, { color: '#fff' }]}>Continuar con Apple</Text>
        </Pressable> : null}
        {providers.google ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => providerSignIn('google')} style={({ pressed }) => [s.social, s.google, pressed && { opacity: 0.82 }]}>
          <Ionicons name="logo-google" size={19} color="#4285F4" />
          <Text style={[s.socialText, { color: C.ink }]}>Continuar con Google</Text>
        </Pressable> : null}
        {busy ? <ActivityIndicator color={C.wine} style={{ marginTop: 16 }} /> : null}
        <Pressable accessibilityRole="button" disabled={busy} onPress={forgotPassword} style={s.link}>
          <Text style={s.linkText}>Olvidé mi contraseña</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  eye: { position: 'absolute', right: 14, bottom: 12, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  page: { padding: 18, paddingBottom: 56 },
  homeButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(166,75,67,0.08)', borderWidth: 1, borderColor: 'rgba(166,75,67,0.14)' },
  homeButtonText: { fontFamily: sans, color: C.wine, fontSize: 13, fontWeight: '600' },
  hero: { alignItems: 'center', paddingTop: 26, paddingBottom: 22 },
  lock: { width: 68, height: 68, borderRadius: 21, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 10px 24px rgba(166,75,67,0.24)' },
  title: { fontFamily: sans, fontSize: 28, fontWeight: '700', letterSpacing: -0.6, color: C.ink },
  copy: { fontFamily: sans, fontSize: 15, lineHeight: 21, color: C.muted, textAlign: 'center', marginTop: 8, paddingHorizontal: 16 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  rule: { height: StyleSheet.hairlineWidth, flex: 1, backgroundColor: C.separator },
  or: { fontFamily: sans, fontSize: 13, color: C.muted },
  social: { minHeight: 50, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 },
  apple: { backgroundColor: '#111', borderColor: '#111' },
  google: { backgroundColor: '#fff', borderColor: C.line },
  socialText: { fontFamily: sans, fontWeight: '600', fontSize: 15 },
  link: { alignSelf: 'center', padding: 14 },
  linkText: { fontFamily: sans, fontSize: 15, fontWeight: '600', color: C.wine },
  options: { gap: 12, paddingHorizontal: 4, paddingTop: 14 },
  option: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 9 },
  optionText: { fontFamily: sans, fontSize: 14, color: C.muted },
  biometric: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff' },
  biometricText: { fontFamily: sans, color: C.wine, fontSize: 15, fontWeight: '600' },
});
