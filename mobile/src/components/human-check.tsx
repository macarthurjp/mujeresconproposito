import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { C, SITE_URL, sans } from '@/constants/theme';

// Secure join/contact submissions require a Cloudflare Turnstile token issued
// on mcp930.org, so the app runs only the verification step in a small WebView.
const VERIFY_URL = `${SITE_URL}/app-verify.html`;

type Props = {
  visible: boolean;
  action?: 'join' | 'contact';
  onToken: (token: string) => void;
  onCancel: () => void;
  onError: () => void;
};

export function HumanCheck({ visible, action = 'join', onToken, onCancel, onError }: Props) {
  // Do not initialize the native WebView module until the user opens the bot check.
  const [WebView, setWebView] = useState<typeof import('react-native-webview').WebView | null>(null);
  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    void import('react-native-webview').then((module) => {
      if (mounted) setWebView(() => module.WebView);
    }).catch(onError);
    return () => { mounted = false; };
  }, [visible, onError]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.head}>
            <Text style={s.title}>Un momento</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancelar" onPress={onCancel} style={s.close}>
              <Ionicons name="close" size={20} color={C.ink} />
            </Pressable>
          </View>
          <Text style={s.hint}>{action === 'contact' ? 'Comprobamos que eres una persona antes de enviar tu mensaje.' : 'Comprobamos que eres una persona antes de enviar tu registro.'}</Text>
          <View style={s.frame}>
            {visible && WebView ? (
              <WebView
                source={{ uri: `${VERIFY_URL}?action=${action}` }}
                originWhitelist={['https://*', 'http://127.0.0.1:*', 'http://localhost:*']}
                javaScriptEnabled
                onMessage={(event) => {
                  try {
                    const data = JSON.parse(event.nativeEvent.data) as { type?: string; token?: string };
                    if (data.type === 'turnstile' && data.token) onToken(data.token);
                    else if (data.type === 'turnstile-error') onError();
                  } catch {
                    onError();
                  }
                }}
                onError={onError}
                style={{ backgroundColor: 'transparent' }}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(25,14,16,0.55)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: C.ivory, borderRadius: 24, padding: 20, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: sans, fontWeight: '700', letterSpacing: -0.4, fontSize: 22, color: C.ink },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  hint: { color: C.muted, fontSize: 14, lineHeight: 20 },
  frame: { height: 160, borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff7f6', marginTop: 6 },
});
