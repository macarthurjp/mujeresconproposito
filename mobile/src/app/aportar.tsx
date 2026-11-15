import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, ErrorNote, Eyebrow, Loading, Screen, Title, useAsync } from '@/components/ui';
import { GiveHeader } from '@/components/prayer-card';
import { C, sans } from '@/constants/theme';
import { api, type CuentaAporte } from '@/lib/api';

// Shown if the cuentas_aporte table is empty or unreachable: same PayPal the website uses.
const FALLBACK: CuentaAporte[] = [
  {
    id: 'paypal',
    metodo: 'PayPal',
    titular: 'Mujeres con Propósito 930 a.s.b.l.',
    detalle: 'Donación con PayPal',
    nota: null,
    link: 'https://www.paypal.com/donate/?hosted_button_id=ZVN8VQZ622B7W',
    qr_url: 'https://mcp930.org/assets/images/paypal-qr.png',
  },
];

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Copiar ${label}`}
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      style={({ pressed }) => [s.copyRow, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.copyLabel}>{label}</Text>
        <Text style={s.copyValue} selectable>{value}</Text>
      </View>
      <View style={[s.copyBtn, copied && { backgroundColor: C.wine }]}>
        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={copied ? '#fff' : C.wine} />
        <Text style={[s.copyBtnText, copied && { color: '#fff' }]}>{copied ? 'Copiado' : 'Copiar'}</Text>
      </View>
    </Pressable>
  );
}

function Cuenta({ cuenta }: { cuenta: CuentaAporte }) {
  const link = cuenta.link && /^https:\/\//i.test(cuenta.link) ? cuenta.link : null;
  return (
    <Card style={{ gap: 14 }}>
      <Text style={s.method}>{cuenta.metodo}</Text>
      {cuenta.qr_url ? (
        <View style={s.qrWrap}>
          <Image source={{ uri: cuenta.qr_url }} style={s.qr} contentFit="contain" accessibilityLabel={`Código QR de ${cuenta.metodo}`} />
          <Text style={s.qrCaption}>Escanéalo desde otro teléfono o desde la app de {cuenta.metodo}.</Text>
        </View>
      ) : null}
      {cuenta.titular ? <CopyRow label="Titular" value={cuenta.titular} /> : null}
      <CopyRow label="Cuenta" value={cuenta.detalle} />
      {cuenta.nota ? <CopyRow label="Referencia" value={cuenta.nota} /> : null}
      {link ? <Button label={`Aportar con ${cuenta.metodo}`} icon="open-outline" onPress={() => Linking.openURL(link)} /> : null}
    </Card>
  );
}

export default function Aportar() {
  const { data, error, loading, reload } = useAsync(api.cuentasAporte);
  const cuentas = data && data.length ? data : error ? FALLBACK : data ? FALLBACK : [];

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data} topInset={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <Eyebrow>Siembra con nosotras</Eyebrow>
        <Title>Apoya nuestra misión</Title>
        <View style={{ marginTop: 16, marginBottom: 22 }}><GiveHeader /></View>
        {loading && !data ? <Loading /> : null}
        {error && !cuentas.length ? <ErrorNote message={error} onRetry={reload} /> : null}
        <View style={{ gap: 16 }}>
          {cuentas.map((c) => (
            <Cuenta key={c.id} cuenta={c} />
          ))}
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  method: { fontFamily: sans, fontWeight: '600', letterSpacing: -0.3, fontSize: 21, color: C.ink },
  qrWrap: { alignItems: 'center', backgroundColor: C.bg, borderRadius: 16, padding: 16, gap: 10 },
  qr: { width: 200, height: 200 },
  qrCaption: { color: C.muted, fontSize: 13, textAlign: 'center' },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: C.bg },
  copyLabel: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  copyValue: { color: C.ink, fontSize: 15, fontWeight: '600', marginTop: 2 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: C.blush },
  copyBtnText: { color: C.wine, fontWeight: '700', fontSize: 13 },
});
