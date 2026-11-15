import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { HumanCheck } from '@/components/human-check';
import { Button, Card, Eyebrow, Screen, Title, styles as ui } from '@/components/ui';
import { C, CONTACT_EMAIL } from '@/constants/theme';
import { api } from '@/lib/api';

export default function Contacto() {
  // Same form; ?tema=oracion only adapts the wording for prayer requests.
  const { tema } = useLocalSearchParams<{ tema?: string }>();
  const prayer = tema === 'oracion';
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);

  function startSend() {
    const cleanName = nombre.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanMessage = mensaje.trim();
    if (cleanName.length < 2) return Alert.alert('Revisa tu nombre', 'Escribe tu nombre para que podamos saludarte.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return Alert.alert('Correo no válido', 'Escribe un correo electrónico válido.');
    if (!cleanMessage) return Alert.alert('Falta tu mensaje', 'Escribe el mensaje que quieres enviarnos.');
    setChecking(true);
  }

  async function submitVerified(turnstileToken: string) {
    setChecking(false);
    setSending(true);
    try {
      const result = await api.submitContact({
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        mensaje: prayer ? `🙏 Petición de oración\n\n${mensaje.trim()}` : mensaje.trim(),
        destino: CONTACT_EMAIL,
        turnstileToken,
      });
      setNombre('');
      setEmail('');
      setMensaje('');
      Alert.alert(
        result.notificationSent === false ? 'Mensaje recibido' : 'Mensaje enviado',
        result.notificationSent === false
          ? 'Recibimos tu mensaje. La notificación por correo quedó pendiente.'
          : 'Tu mensaje se envió correctamente.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      Alert.alert('No se pudo enviar', message === 'Verificación de seguridad fallida.'
        ? 'No pudimos completar la verificación. Inténtalo de nuevo.'
        : 'Ocurrió un error al enviar tu mensaje. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.container}>
          <Eyebrow>{prayer ? 'Oramos contigo' : 'Escríbenos'}</Eyebrow>
          <Title>{prayer ? '¿Necesitas oración?' : 'Contacto'}</Title>
          <Text style={[ui.body, s.intro]}>{prayer ? 'Cuéntanos tu petición. Nuestro equipo orará por ti y, si lo deseas, te responderá con una palabra de ánimo.' : 'Estamos aquí para escucharte. Déjanos tu mensaje y nos pondremos en contacto contigo.'}</Text>

          <Card style={s.form}>
            <Field label="Tu Nombre" value={nombre} onChangeText={setNombre} autoComplete="name" returnKeyType="next" />
            <Field label="Correo Electrónico" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" returnKeyType="next" />
            <Field label={prayer ? 'Tu petición de oración' : 'Tu mensaje'} value={mensaje} onChangeText={setMensaje} multiline returnKeyType="default" />
          </Card>

          <Button
            label={sending ? 'Enviando…' : 'Enviar mensaje'}
            icon={sending ? undefined : 'paper-plane-outline'}
            onPress={() => { if (!sending) startSend(); }}
            style={s.submit}
          />
          <View style={s.privacy}><Ionicons name="shield-checkmark-outline" size={16} color={C.wine} /><Text style={s.privacyText}>Tu mensaje se envía de forma segura y solo se usa para responderte.</Text></View>
          <HumanCheck
            visible={checking}
            action="contact"
            onToken={(token) => { void submitVerified(token); }}
            onCancel={() => setChecking(false)}
            onError={() => { setChecking(false); Alert.alert('No se pudo verificar', 'Revisa tu conexión e inténtalo de nuevo.'); }}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({ label, value, onChangeText, multiline = false, keyboardType = 'default', autoCapitalize = 'sentences', autoComplete, returnKeyType }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'sentences';
  autoComplete?: 'name' | 'email';
  returnKeyType?: 'next' | 'done' | 'default';
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor="#a58e88"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        returnKeyType={returnKeyType}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        accessibilityLabel={label}
        style={[s.input, multiline && s.message]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingBottom: 24 },
  intro: { marginTop: 10, marginBottom: 22 },
  form: { padding: 18, gap: 18, borderRadius: 24 },
  field: { gap: 8 },
  label: { color: C.ink, fontSize: 14, fontWeight: '700' },
  input: { minHeight: 54, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(63,38,35,0.12)', backgroundColor: C.ivory, paddingHorizontal: 15, paddingVertical: 13, color: C.ink, fontSize: 16 },
  message: { minHeight: 150, lineHeight: 23 },
  submit: { marginTop: 18 },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 8, marginTop: 15, paddingHorizontal: 6 },
  privacyText: { flex: 1, color: C.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
