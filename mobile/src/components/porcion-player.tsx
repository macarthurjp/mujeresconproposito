import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { tapFeedback } from '@/components/ui';
import { C, SOUNDCLOUD_URL, sans } from '@/constants/theme';

type PlayerStatus = { ready?: boolean; playing?: boolean; error?: string };

const playerUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(SOUNDCLOUD_URL)}&auto_play=false&color=%23a64b43&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false&visual=false`;

function playerHtml() {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}iframe{border:0;border-radius:12px}</style></head><body><iframe id="sc-player" width="100%" height="166" scrolling="no" allow="autoplay" src="${playerUrl}"></iframe><script src="https://w.soundcloud.com/player/api.js"></script><script>(function(){var f=document.getElementById('sc-player');function send(x){try{window.ReactNativeWebView.postMessage(JSON.stringify(x))}catch(e){}}function boot(){if(!window.SC||!window.SC.Widget){setTimeout(boot,200);return}var w=window.SC.Widget(f);window.scWidget=w;w.bind(window.SC.Widget.Events.READY,function(){send({ready:true})});w.bind(window.SC.Widget.Events.PLAY,function(){send({playing:true})});w.bind(window.SC.Widget.Events.PAUSE,function(){send({playing:false})});w.bind(window.SC.Widget.Events.FINISH,function(){send({playing:false})});w.bind(window.SC.Widget.Events.ERROR,function(){send({error:'No se pudo cargar el audio.'})})}boot();window.scCommand=function(n){if(window.scWidget&&window.scWidget[n])window.scWidget[n]()}})();</script></body></html>`;
}

export function PorcionPlayer() {
  const webView = useRef<{ injectJavaScript: (script: string) => void } | null>(null);
  const html = useMemo(() => playerHtml(), []);
  const [status, setStatus] = useState<PlayerStatus>({});
  const command = useCallback((name: 'play' | 'pause' | 'next' | 'prev') => {
    tapFeedback();
    webView.current?.injectJavaScript(`window.scCommand && window.scCommand('${name}'); true;`);
  }, []);
  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try { setStatus((current) => ({ ...current, ...JSON.parse(event.nativeEvent.data) as PlayerStatus })); } catch { /* Ignore unrelated widget events. */ }
  }, []);

  return (
    <View style={s.card}>
      <View style={s.heading}>
        <View style={s.art}><Ionicons name="musical-notes" size={23} color={C.wine} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>PORCIÓN · PLAYLIST</Text>
          <Text style={s.title}>Escucha nuestros audios</Text>
          <Text style={s.copy}>Mensajes y reflexiones para tu día.</Text>
        </View>
      </View>
      <View style={s.widget}>
        <WebView
          ref={webView as never}
          source={{ html, baseUrl: 'https://w.soundcloud.com' }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          scrollEnabled={false}
          setSupportMultipleWindows={false}
          onMessage={onMessage}
          onError={() => setStatus((current) => ({ ...current, error: 'Revisa tu conexión para escuchar el playlist.' }))}
          style={s.webview}
        />
      </View>
      <View style={s.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Audio anterior" onPress={() => command('prev')} style={s.skip}><Ionicons name="play-skip-back" size={20} color="#fff" /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? 'Pausar audio' : 'Reproducir audio'} onPress={() => command(status.playing ? 'pause' : 'play')} style={({ pressed }) => [s.play, pressed && s.pressed]}>
          <Ionicons name={status.playing ? 'pause' : 'play'} size={23} color={C.wine} style={!status.playing ? { marginLeft: 2 } : undefined} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Siguiente audio" onPress={() => command('next')} style={s.skip}><Ionicons name="play-skip-forward" size={20} color="#fff" /></Pressable>
      </View>
      <Text style={s.status}>{status.error ?? (status.ready ? 'ANTERIOR  ·  REPRODUCIR  ·  SIGUIENTE' : 'CONECTANDO CON SOUNDCLOUD')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginTop: 40, marginHorizontal: 20, borderRadius: 26, padding: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(166,75,67,0.16)', boxShadow: '0 14px 34px rgba(143,63,56,0.16)' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 14 },
  art: { width: 52, height: 52, borderRadius: 17, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: sans, color: C.wine, fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  title: { fontFamily: sans, fontWeight: '700', letterSpacing: -0.3, color: C.ink, fontSize: 17, marginTop: 2 },
  copy: { fontFamily: sans, color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 1 },
  widget: { height: 166, overflow: 'hidden', borderRadius: 14, backgroundColor: '#fbf3f1' },
  webview: { height: 166, backgroundColor: 'transparent' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, marginTop: 15 },
  skip: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.wine },
  play: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blush, borderWidth: 1, borderColor: 'rgba(166,75,67,0.2)' },
  pressed: { transform: [{ scale: 0.94 }], opacity: 0.88 },
  status: { color: C.muted, textAlign: 'center', fontFamily: sans, fontWeight: '700', fontSize: 8, letterSpacing: 0.65, marginTop: 10 },
});
