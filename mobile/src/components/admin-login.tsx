import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Group, InputRow, SwitchRow } from '@/components/form';
import { Button } from '@/components/ui';
import { C, sans } from '@/constants/theme';
import { enabledProviders, sendPasswordReset, signIn, signInWithProvider } from '@/lib/admin';
import {
  clearBiometricAdminCredentials, deviceSupportsBiometrics, getBiometricAdminCredentials,
  getBiometricLoginAvailable, getRememberedAdminEmail, saveBiometricAdminCredentials,
  setRememberAdminSession, setRememberedAdminEmail,
} from '@/lib/app-preferences';
import { supabase } from '@/lib/supabase';

function maskedEmail(value: string) {
  const [name, domain] = value.trim().split('@');
  if (!name || !domain) return value.trim();
  return `${name.slice(0, 1)}${'•'.repeat(Math.min(5, Math.max(2, name.length - 1)))}@${domain}`;
}

export function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [useBiometrics, setUseBiometrics] = useState(false);
  const [biometricsSupported, setBiometricsSupported] = useState(false);
  const [biometricLoginAvailable, setBiometricLoginAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  // Only show Apple/Google when enabled in Supabase Auth (public settings endpoint).
  const [providers, setProviders] = useState<{ apple: boolean; google: boolean }>({ apple: false, google: false });

  useEffect(() => {
    let alive = true;
    void Promise.all([getRememberedAdminEmail(), deviceSupportsBiometrics(), getBiometricLoginAvailable()]).then(([savedEmail, supported, available]) => {
      if (!alive) return;
      if (savedEmail) { setEmail(savedEmail); setRemember(true); }
      setBiometricsSupported(supported);
      setBiometricLoginAvailable(available && supported);
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
      try {
        await setRememberedAdminEmail(remember ? email : null);
        if (useBiometrics) {
          await saveBiometricAdminCredentials(email, password);
          setBiometricLoginAvailable(true);
        } else if (!remember) {
          await clearBiometricAdminCredentials();
          setBiometricLoginAvailable(false);
        }
      } catch {
        Alert.alert('Sesión iniciada', 'No se pudieron guardar las preferencias de acceso en este dispositivo.');
      }
    });
  };

  const biometricSignIn = () => void run(async () => {
    const credentials = await getBiometricAdminCredentials();
    if (!credentials) {
      setBiometricLoginAvailable(false);
      throw new Error('No se encontraron credenciales protegidas. Inicia sesión con tu correo para configurarlo de nuevo.');
    }
    await signIn(credentials.email, credentials.password);
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
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
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
          <InputRow label="Contraseña" value={password} onChangeText={setPassword} placeholder="Tu contraseña" secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} returnKeyType="go" />
        </Group>
        <Group>
          <SwitchRow icon="person-circle" label="Recordarme en este dispositivo" value={remember} onValueChange={setRemember} />
          {biometricsSupported ? <SwitchRow icon="finger-print" tint="#34a853" label="Usar Face ID o huella" sub="La próxima vez entrarás sin contraseña" value={useBiometrics} onValueChange={setUseBiometrics} /> : null}
        </Group>
        <Button label={busy ? 'Entrando…' : 'Entrar con correo'} icon="log-in-outline" onPress={submit} style={{ marginTop: 20 }} />
        {biometricLoginAvailable ? <Pressable accessibilityRole="button" disabled={busy} onPress={biometricSignIn} style={({ pressed }) => [s.biometric, pressed && { opacity: 0.78 }]}>
          <Ionicons name="finger-print-outline" size={22} color={C.wine} />
          <Text style={s.biometricText}>Entrar con Face ID o huella</Text>
        </Pressable> : null}
        {providers.apple || providers.google ? <View style={s.divider}><View style={s.rule} /><Text style={s.or}>o continúa con</Text><View style={s.rule} /></View> : null}
        {providers.apple ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => providerSignIn('apple')} style={({ pressed }) => [s.social, s.apple, pressed && { opacity: 0.82 }]}>
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
