import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { HumanCheck } from '@/components/human-check';
import { Button, Card, Screen, Eyebrow, Title, styles as ui } from '@/components/ui';
import { C, SITE_URL, sans } from '@/constants/theme';
import { api } from '@/lib/api';
import { DEFAULT_DIAL, DIAL_CODES, flag } from '@/lib/dial-codes';
import { formOptions } from '@/lib/form-options';
import { WheelPicker } from '@/components/wheel-picker';

type FieldName = 'nombre' | 'apellido' | 'email' | 'telefono' | 'fecha_nacimiento' | 'estatus_matrimonial' | 'pais_nacimiento' | 'pais_residencia' | 'cristiana' | 'comunidad' | 'hijos' | 'comments';
type FormValues = Record<FieldName, string>;
const initial: FormValues = { nombre: '', apellido: '', email: '', telefono: '', fecha_nacimiento: '', estatus_matrimonial: '', pais_nacimiento: '', pais_residencia: '', cristiana: '', comunidad: '', hijos: '0', comments: '' };

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline, inputMode, autoCapitalize = 'words' }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric'; multiline?: boolean;
  inputMode?: 'text' | 'email' | 'tel' | 'numeric' | 'decimal'; autoCapitalize?: 'none' | 'sentences' | 'words';
}) {
  return <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder || label} placeholderTextColor="#a58e88" keyboardType={keyboardType} inputMode={inputMode} multiline={multiline} autoCapitalize={autoCapitalize} style={[s.input, multiline && s.textarea]} />
  </View>;
}

function Choice({ label, value, options, onSelect }: { label: string; value: string; options: readonly string[]; onSelect: (value: string) => void }) {
  return <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <WheelPicker title={label} value={value} options={options.map((o) => ({ value: o, label: o }))} onChange={onSelect} />
  </View>;
}

/** Phone number with a country dialling-code wheel (flag + code), like the website. */
function PhoneField({ dial, onDial, value, onChangeText }: { dial: string; onDial: (iso: string) => void; value: string; onChangeText: (v: string) => void }) {
  return <View style={s.field}>
    <Text style={s.label}>Teléfono</Text>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <WheelPicker
        title="Código de país"
        value={dial}
        options={DIAL_CODES.map((c) => ({ value: c.iso, label: `${flag(c.iso)}  ${c.name}  +${c.code}` }))}
        renderValue={(o) => { const c = DIAL_CODES.find((d) => d.iso === o?.value); return c ? `${flag(c.iso)} +${c.code}` : ''; }}
        onChange={onDial}
        style={{ width: 118, flexShrink: 0 }}
      />
      <TextInput value={value} onChangeText={(v) => onChangeText(v.replace(/[^\d\s]/g, ''))} placeholder="Número" placeholderTextColor="#a58e88" keyboardType="phone-pad" inputMode="tel" textContentType="telephoneNumber" style={[s.input, { flex: 1, minWidth: 0 }]} />
    </View>
  </View>;
}

export default function Unirse() {
  const [form, setForm] = useState(initial);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dial, setDial] = useState(DEFAULT_DIAL.iso);
  const dialCode = DIAL_CODES.find((c) => c.iso === dial)?.code ?? DEFAULT_DIAL.code;
  // Full international number: +<code><digits>, without a leading trunk 0.
  const fullPhone = () => `+${dialCode}${form.telefono.replace(/\D/g, '').replace(/^0+/, '')}`;
  const set = (key: FieldName) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function send() {
    const nombre = form.nombre.trim();
    const apellido = form.apellido.trim();
    const email = form.email.trim().toLowerCase();
    const telefono = fullPhone();
    if (nombre.length < 2 || apellido.length < 2) return Alert.alert('Revisa tu nombre', 'Escribe tu nombre y apellido completos.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Alert.alert('Correo no válido', 'Escribe un correo electrónico válido.');
    if (!/^\+?\d{7,15}$/.test(telefono)) return Alert.alert('Teléfono no válido', 'Revisa el código de país y escribe al menos 7 dígitos.');
    if (!form.fecha_nacimiento) return Alert.alert('Fecha requerida', 'Indica tu fecha de nacimiento.');
    const birth = new Date(`${form.fecha_nacimiento}T00:00:00`);
    const age = new Date().getFullYear() - birth.getFullYear() - ((new Date().getMonth() < birth.getMonth() || (new Date().getMonth() === birth.getMonth() && new Date().getDate() < birth.getDate())) ? 1 : 0);
    if (!Number.isFinite(birth.getTime()) || age < 18 || birth >= new Date()) return Alert.alert('Registro para mayores de edad', 'Debes tener al menos 18 años para registrarte.');
    if (!form.pais_nacimiento || !form.pais_residencia || !form.cristiana || !form.comunidad) return Alert.alert('Completa tus opciones', 'Selecciona país de nacimiento, residencia, tu respuesta y comunidad.');

    // The web preview can't host the native WebView check; use the site form there.
    if (Platform.OS === 'web') {
      void Linking.openURL(`${SITE_URL}/#join`);
      return;
    }
    setChecking(true);
  }

  async function submitVerified(turnstileToken: string) {
    setChecking(false);
    const nombre = form.nombre.trim();
    const apellido = form.apellido.trim();
    const email = form.email.trim().toLowerCase();
    const telefono = fullPhone();
    setSending(true);
    try {
      await api.submitJoin({ turnstileToken, id: createId(), action: 'register', nombre, apellido, email, telefono, fecha_nacimiento: form.fecha_nacimiento, estatus_matrimonial: form.estatus_matrimonial, pais_nacimiento: form.pais_nacimiento, pais_residencia: form.pais_residencia, cristiana: form.cristiana, comunidad: form.comunidad, comments: form.comments.trim(), hijos: form.hijos || '0' });
      setForm(initial);
      Alert.alert('Solicitud recibida', 'Gracias por unirte a Mujeres con Propósito. Recibirás una confirmación por correo.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      Alert.alert(message === 'duplicate' ? 'Ya estás registrada' : 'No se pudo enviar', message === 'duplicate' ? 'Este correo o teléfono ya está registrado.' : message || 'Inténtalo de nuevo más tarde.');
    } finally {
      setSending(false);
    }
  }

  return <Screen>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.container}>
        <View style={s.intro}>
          <View style={s.icon}><Ionicons name="heart" size={22} color={C.wine} /></View>
          <Eyebrow>Tu comunidad, tu propósito</Eyebrow>
          <Title>Únete a Mujeres con Propósito</Title>
          <Text style={[ui.body, { marginTop: 10 }]}>Completa tu registro para conectar con mujeres que crecen en la fe, se apoyan y sirven juntas.</Text>
          <View style={s.promise}><Ionicons name="shield-checkmark-outline" size={18} color={C.wine} /><Text style={s.promiseText}>Tus datos se envían de forma segura y se usan para gestionar tu registro.</Text></View>
        </View>

        <Card style={s.card}>
          <View style={s.sectionHead}><Text style={s.number}>01</Text><View><Text style={s.sectionTitle}>Información personal</Text><Text style={s.sectionHint}>Cuéntanos cómo contactarte</Text></View></View>
          <Field label="Nombre" value={form.nombre} onChangeText={set('nombre')} />
          <Field label="Apellido" value={form.apellido} onChangeText={set('apellido')} />
          <Field label="Correo electrónico" value={form.email} onChangeText={set('email')} keyboardType="email-address" inputMode="email" autoCapitalize="none" />
          <PhoneField dial={dial} onDial={setDial} value={form.telefono} onChangeText={set('telefono')} />
          <Field label="Fecha de nacimiento" value={form.fecha_nacimiento} onChangeText={set('fecha_nacimiento')} placeholder="AAAA-MM-DD" inputMode="numeric" autoCapitalize="none" />
          <Choice label="Estatus matrimonial" value={form.estatus_matrimonial} options={formOptions.maritalStatuses} onSelect={set('estatus_matrimonial')} />
        </Card>

        <Card style={s.card}>
          <View style={s.sectionHead}><Text style={s.number}>02</Text><View><Text style={s.sectionTitle}>Comunidad y ubicación</Text><Text style={s.sectionHint}>Encuentra tu grupo</Text></View></View>
          <Choice label="País de nacimiento" value={form.pais_nacimiento} options={formOptions.countries} onSelect={set('pais_nacimiento')} />
          <Choice label="País de residencia" value={form.pais_residencia} options={formOptions.countries} onSelect={set('pais_residencia')} />
          <Choice label="¿Eres cristiana?" value={form.cristiana} options={formOptions.christianStatuses} onSelect={set('cristiana')} />
          <Choice label="Comunidad a la que quiere pertenecer" value={form.comunidad} options={formOptions.communities} onSelect={set('comunidad')} />
        </Card>

        <Card style={s.card}>
          <View style={s.sectionHead}><Text style={s.number}>03</Text><View><Text style={s.sectionTitle}>Detalles adicionales</Text><Text style={s.sectionHint}>Comparte un poco más</Text></View></View>
          <Field label="¿Cuántos hijos tienes?" value={form.hijos} onChangeText={(v) => set('hijos')(v.replace(/\D/g, ''))} keyboardType="numeric" inputMode="numeric" />
          <Field label="Comentarios (opcional)" value={form.comments} onChangeText={set('comments')} placeholder="Algo que quieras compartir" multiline />
        </Card>
        <Button label={sending ? 'Enviando solicitud…' : 'Enviar solicitud'} icon="arrow-forward" onPress={() => { if (!sending) void send(); }} />
        <HumanCheck
          visible={checking}
          onToken={(token) => { void submitVerified(token); }}
          onCancel={() => setChecking(false)}
          onError={() => { setChecking(false); Alert.alert('No se pudo verificar', 'Revisa tu conexión e inténtalo de nuevo.'); }}
        />
        <Text style={s.footnote}>Al enviar, aceptas que el equipo de Mujeres con Propósito se comunique contigo sobre tu registro.</Text>
      </View>
    </KeyboardAvoidingView>
  </Screen>;
}

function createId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

const s = StyleSheet.create({
  container: { paddingHorizontal: 20, gap: 16 },
  intro: { backgroundColor: '#f8e4df', borderRadius: 24, padding: 22, marginBottom: 4 },
  icon: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#fff8f6', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  promise: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 18 },
  promiseText: { color: C.muted, fontSize: 12, lineHeight: 18, flex: 1 },
  card: { gap: 14, padding: 18 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  number: { fontFamily: sans, fontWeight: '700', fontSize: 24, color: C.wine },
  sectionTitle: { fontSize: 17, color: C.ink, fontWeight: '700' },
  sectionHint: { fontSize: 12, color: C.muted, marginTop: 2 },
  field: { gap: 7 },
  label: { fontSize: 13, color: C.ink, fontWeight: '600' },
  input: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(28,17,23,0.13)', backgroundColor: '#fffaf9', paddingHorizontal: 14, color: C.ink, fontSize: 15 },
  textarea: { minHeight: 100, paddingTop: 13, textAlignVertical: 'top' },
  footnote: { color: C.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: -4, marginBottom: 20 },
});
