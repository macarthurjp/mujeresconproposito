import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GiveHeader } from '@/components/prayer-card';
import { Screen, tapFeedback, useAsync } from '@/components/ui';
import { C, sans } from '@/constants/theme';
import { api, type CuentaAporte } from '@/lib/api';

// Same PayPal donate button the website uses.
const PAYPAL_DONATE = 'https://www.paypal.com/donate/?hosted_button_id=ZVN8VQZ622B7W';
const PAYPAL_QR = 'https://mcp930.org/assets/images/paypal-qr.png';
const AMOUNTS = [10, 20, 50, 100];

const isPayPal = (c: CuentaAporte) => /paypal/i.test(`${c.metodo} ${c.link ?? ''}`);

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Copiar ${label}`}
      onPress={async () => {
        tapFeedback();
        await Clipboard.setStringAsync(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      style={({ pressed }) => [s.copyRow, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.copyLabel}>{label}</Text>
        <Text style={s.copyValue} selectable>{value}</Text>
      </View>
      <View style={[s.copyBtn, copied && { backgroundColor: C.wine }]}>
        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={15} color={copied ? '#fff' : C.wine} />
        <Text style={[s.copyBtnText, copied && { color: '#fff' }]}>{copied ? 'Copiado' : 'Copiar'}</Text>
      </View>
    </Pressable>
  );
}

/** Bank transfer / other non-PayPal methods configured in cuentas_aporte. */
function OtherMethod({ cuenta }: { cuenta: CuentaAporte }) {
  const link = cuenta.link && /^https:\/\//i.test(cuenta.link) ? cuenta.link : null;
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <View style={s.methodIcon}><Ionicons name="business-outline" size={18} color={C.wine} /></View>
        <Text style={s.cardTitle}>{cuenta.metodo}</Text>
      </View>
      {cuenta.titular ? <CopyRow label="Titular" value={cuenta.titular} /> : null}
      {cuenta.detalle ? <CopyRow label="Cuenta" value={cuenta.detalle} /> : null}
      {cuenta.nota ? <CopyRow label="Referencia" value={cuenta.nota} /> : null}
      {link ? (
        <Pressable onPress={() => Linking.openURL(link)} style={({ pressed }) => [s.secondaryBtn, pressed && { opacity: 0.8 }]}>
          <Ionicons name="open-outline" size={16} color={C.wine} /><Text style={s.secondaryBtnText}>Abrir {cuenta.metodo}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function Aportar() {
  const { data } = useAsync(api.cuentasAporte);
  const paypal = data?.find(isPayPal);
  const others = (data ?? []).filter((c) => !isPayPal(c));
  const paypalLink = paypal?.link && /^https:\/\//i.test(paypal.link) ? paypal.link : PAYPAL_DONATE;
  const qrUrl = paypal?.qr_url || PAYPAL_QR;

  const [preset, setPreset] = useState<number | null>(20);
  const [custom, setCustom] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [qrLoaded, setQrLoaded] = useState(false);

  const customValue = Number.parseFloat(custom.replace(',', '.'));
  const amount = custom ? (Number.isFinite(customValue) && customValue > 0 ? customValue : null) : preset;
  const amountLabel = amount ? `€${Number.isInteger(amount) ? amount : amount.toFixed(2)}` : '';

  const donate = () => {
    tapFeedback();
    const sep = paypalLink.includes('?') ? '&' : '?';
    const url = amount ? `${paypalLink}${sep}amount=${amount.toFixed(2)}&currency_code=EUR` : paypalLink;
    void Linking.openURL(url);
  };

  return (
    <Screen topInset={false}>
      <View style={s.page}>
        <GiveHeader />

        <Text style={s.sectionLabel}>Elige un monto</Text>
        <View style={s.amounts}>
          {AMOUNTS.map((value) => {
            const on = !custom && preset === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => { tapFeedback(); setPreset(value); setCustom(''); }}
                style={({ pressed }) => [s.amount, on && s.amountOn, pressed && { transform: [{ scale: 0.97 }] }]}>
                <Text style={[s.amountText, on && { color: '#fff' }]}>€{value}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={[s.customWrap, !!custom && s.customOn]}>
          <Text style={s.euro}>€</Text>
          <TextInput
            value={custom}
            onChangeText={(v) => setCustom(v.replace(/[^\d.,]/g, ''))}
            placeholder="Otro monto"
            placeholderTextColor="#a58e88"
            keyboardType="decimal-pad"
            inputMode="decimal"
            style={s.customInput}
            accessibilityLabel="Otro monto en euros"
          />
        </View>

        <Pressable accessibilityRole="button" onPress={donate} style={({ pressed }) => [s.donateBtn, pressed && { transform: [{ scale: 0.98 }], opacity: 0.95 }]}>
          <Ionicons name="logo-paypal" size={20} color="#fff" />
          <Text style={s.donateText}>{amountLabel ? `Donar ${amountLabel} con PayPal` : 'Donar con PayPal'}</Text>
        </Pressable>
        <View style={s.secureRow}>
          <Ionicons name="lock-closed" size={13} color={C.muted} />
          <Text style={s.secure}>Pago seguro en PayPal. La app no procesa pagos.</Text>
        </View>

        <View style={s.card}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showQr }} onPress={() => { tapFeedback(); setShowQr((v) => !v); }} style={s.qrToggle}>
            <View style={s.methodIcon}><Ionicons name="qr-code-outline" size={18} color={C.wine} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Código QR de PayPal</Text>
              <Text style={s.cardSub}>Escanéalo desde otro teléfono</Text>
            </View>
            <Ionicons name={showQr ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
          </Pressable>
          {showQr ? (
            <View style={s.qrBox}>
              {!qrLoaded ? <ActivityIndicator color={C.wine} style={StyleSheet.absoluteFill} /> : null}
              <Image source={{ uri: qrUrl }} style={s.qr} contentFit="contain" onLoad={() => setQrLoaded(true)} accessibilityLabel="Código QR de PayPal" />
            </View>
          ) : null}
        </View>

        {others.map((cuenta) => <OtherMethod key={cuenta.id} cuenta={cuenta} />)}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingTop: 4, gap: 0 },
  sectionLabel: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 26, marginBottom: 10, marginLeft: 4 },
  amounts: { flexDirection: 'row', gap: 10 },
  amount: { flex: 1, height: 56, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(63,38,35,0.08)', boxShadow: '0 1px 2px rgba(63,38,35,0.04)' },
  amountOn: { backgroundColor: C.wine, borderColor: C.wine, boxShadow: '0 8px 18px rgba(166,75,67,0.28)' },
  amountText: { fontFamily: sans, fontSize: 18, fontWeight: '700', color: C.ink, letterSpacing: -0.3 },
  customWrap: { marginTop: 10, height: 54, borderRadius: 16, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(63,38,35,0.08)' },
  customOn: { borderColor: C.wine, borderWidth: 1.5 },
  euro: { fontFamily: sans, fontSize: 18, fontWeight: '600', color: C.muted, marginRight: 6 },
  customInput: { flex: 1, fontFamily: sans, fontSize: 18, color: C.ink, paddingVertical: 0, outlineStyle: 'none' } as object,
  donateBtn: { marginTop: 22, minHeight: 56, borderRadius: 16, backgroundColor: C.wine, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 12px 26px rgba(166,75,67,0.3)' },
  donateText: { fontFamily: sans, fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },
  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  secure: { fontFamily: sans, fontSize: 13, color: C.muted },
  card: { marginTop: 22, borderRadius: 20, backgroundColor: '#fff', padding: 16, gap: 12, boxShadow: '0 1px 2px rgba(63,38,35,0.04), 0 8px 24px rgba(63,38,35,0.06)' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qrToggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  methodIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: sans, fontSize: 16, fontWeight: '600', color: C.ink },
  cardSub: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 1 },
  qrBox: { alignSelf: 'center', width: 220, height: 220, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(63,38,35,0.08)', padding: 12, alignItems: 'center', justifyContent: 'center' },
  qr: { width: 196, height: 196 },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: C.bg },
  copyLabel: { fontFamily: sans, color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  copyValue: { fontFamily: sans, color: C.ink, fontSize: 15, fontWeight: '600', marginTop: 2 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: C.blush },
  copyBtnText: { fontFamily: sans, color: C.wine, fontWeight: '700', fontSize: 13 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 14, backgroundColor: C.fill },
  secondaryBtnText: { fontFamily: sans, fontSize: 15, fontWeight: '600', color: C.wine },
});
