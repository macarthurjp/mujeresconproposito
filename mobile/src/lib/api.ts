// In development, require the isolated local stack. Production builds may use
// the hosted project unless explicit Expo public configuration is provided.
const PRODUCTION_SUPABASE_URL = 'https://jkunywiyiyidhyodsbfh.supabase.co';
const PRODUCTION_SUPABASE_KEY = 'sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX';
const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const configuredKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
const isDevelopment = __DEV__;
const SUPABASE_URL = isDevelopment ? (configuredUrl || '') : (configuredUrl || PRODUCTION_SUPABASE_URL);
const SUPABASE_KEY = isDevelopment ? (configuredKey || '') : (configuredKey || PRODUCTION_SUPABASE_KEY);
if (isDevelopment && SUPABASE_URL && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(SUPABASE_URL)) {
  throw new Error('En desarrollo, la app solo puede usar Supabase local (localhost o 127.0.0.1).');
}
const localUnconfigured = isDevelopment && (!SUPABASE_URL || !SUPABASE_KEY);

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

function assertConfigured() {
  if (localUnconfigured) throw new Error('Supabase local no está configurado. Define EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY antes de iniciar la app.');
}

async function rest<T>(path: string): Promise<T> {
  assertConfigured();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!response.ok) throw new Error(`Error ${response.status} al cargar datos`);
  return response.json() as Promise<T>;
}

async function rpc(name: string, body: Record<string, unknown>) {
  assertConfigured();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Error ${response.status}: ${await response.text()}`);
}

async function rpcJson<T>(name: string, body: Record<string, unknown>): Promise<T> {
  assertConfigured();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try { message = JSON.parse(text).message || text; } catch { /* plain text */ }
    throw new Error(message);
  }
  return (text ? JSON.parse(text) : null) as T;
}

async function submitJoin(payload: Record<string, unknown>) {
  assertConfigured();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-join`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({})) as { error?: string; notificationsSent?: boolean };
  if (!response.ok) throw new Error(result.error || `Error ${response.status} al enviar la solicitud`);
  return result;
}

async function submitContact(payload: { nombre: string; email: string; mensaje: string; destino: string; turnstileToken: string }) {
  assertConfigured();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-contact`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...payload, action: 'contact', source: 'app' }),
  });
  const result = await response.json().catch(() => ({})) as { error?: string; notificationSent?: boolean };
  if (!response.ok) throw new Error(result.error || `Error ${response.status} al enviar el mensaje`);
  return result;
}

export type Birthday = { nombreCompleto: string; fecha?: string; dias?: number };

// Development-only preview: open the web preview with ?demo=cumple to see
// sample birthdays without touching real data. Never active in release builds.
function demoBirthdays() {
  if (!__DEV__ || typeof window === 'undefined' || !window.location?.search?.includes('demo=cumple')) return null;
  const day = (offset: number) => {
    const d = new Date(Date.now() + offset * 86_400_000);
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  return {
    cumpleanerasHoy: [{ nombreCompleto: 'Lucía' }],
    proximosCumpleanos: [
      { nombreCompleto: 'Marisol', fecha: day(1), dias: 1 },
      { nombreCompleto: 'Esther', fecha: day(4), dias: 4 },
    ],
  };
}

async function birthdays() {
  assertConfigured();
  const demo = demoBirthdays();
  if (demo) return demo;
  const response = await fetch(`${SUPABASE_URL}/functions/v1/get-today-birthdays`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  if (!response.ok) throw new Error(`Error ${response.status} al cargar los cumpleaños`);
  return response.json() as Promise<{ cumpleanerasHoy: Birthday[]; proximosCumpleanos: Birthday[] }>;
}

export type Evento = {
  id: string;
  icono: string | null;
  titulo: string;
  horario: string;
  link: string | null;
  zona_horaria: string | null;
  orden: number;
};

export type Destacada = { id: string; foto_url: string; nombre: string; titulo: string | null; inscripcion_abierta?: boolean | null; cupo?: number | null; fecha_evento?: string | null; lugar?: string | null };
export type Foto = { id: string; foto_url: string; categoria: string; texto: string | null; orden: number | null; portada: boolean | null };
export type Video = { id: string; video_id: string; titulo: string; subtitulo: string | null; etiqueta: string };
export type Devocional = {
  id: number;
  titulo: string | null;
  slug: string;
  resumen: string | null;
  contenido: string | null;
  introduccion_html: string | null;
  contenido_html: string | null;
  versiculo: string | null;
  autora: string;
  imagen_url: string | null;
  fecha_publicacion: string | null;
};
export type CuentaAporte = {
  id: string;
  metodo: string;
  titular: string | null;
  detalle: string;
  nota: string | null;
  link: string | null;
  qr_url: string | null;
};

export const api = {
  eventos: () => rest<Evento[]>('eventos?select=*&activa=eq.true&order=orden.asc'),
  destacadas: () => rest<Destacada[]>('destacadas?select=*&activa=eq.true&order=orden.asc'),
  galeria: () => rest<Foto[]>('galeria?select=id,foto_url,categoria,texto,orden,portada&activa=eq.true&order=orden.asc'),
  videos: () => rest<Video[]>('youtube?select=id,video_id,titulo,subtitulo,etiqueta&activa=eq.true&order=orden.asc'),
  devocionales: () =>
    rest<Devocional[]>(
      'devocionales?select=id,titulo,slug,resumen,contenido,introduccion_html,contenido_html,versiculo,autora,imagen_url,fecha_publicacion&publicado=eq.true&order=fecha_publicacion.desc',
    ),
  devocional: async (slug: string) => {
    const rows = await rest<Devocional[]>(
      `devocionales?select=id,titulo,slug,resumen,contenido,introduccion_html,contenido_html,versiculo,autora,imagen_url,fecha_publicacion&publicado=eq.true&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    );
    return rows[0] ?? null;
  },
  cuentasAporte: () => rest<CuentaAporte[]>('cuentas_aporte?select=id,metodo,titular,detalle,nota,link,qr_url&order=orden.asc'),
  registerPushToken: (token: string, plataforma: 'ios' | 'android', zona: string) =>
    rpc('register_push_token', { p_token: token, p_plataforma: plataforma, p_zona_horaria: zona }),
  unregisterPushToken: (token: string) => rpc('unregister_push_token', { p_token: token }),
  setDevicePrefs: (token: string, avisosContenido: boolean, comunidad: string | null) =>
    rpc('set_device_preferences', { p_token: token, p_avisos_contenido: avisosContenido, p_comunidad: comunidad }),
  inscribirse: (destacadaId: string, nombre: string, email: string, telefono: string, acompanantes: number) =>
    rpcJson<{ ok: boolean; ocupados: number; cupo: number | null }>('inscribirse', { p_destacada: destacadaId, p_nombre: nombre, p_email: email, p_telefono: telefono, p_acompanantes: acompanantes }),
  plazasEvento: (destacadaId: string) => rpcJson<{ ocupados: number; cupo: number | null }>('plazas_evento', { p_destacada: destacadaId }),
  /** Anonymous counters for the stats screen; never blocks the UI. */
  metrica: (tipo: 'lectura_devocional' | 'unirme_reunion', ref: string) => { void rpc('registrar_metrica', { p_tipo: tipo, p_ref: ref }).catch(() => {}); },
  setMeetingAlerts: (token: string, enabled: boolean) => rpc('set_meeting_alerts', { p_token: token, p_enabled: enabled }),
  setBirthdayPush: (token: string, avisos: number[], hora: number, minuto: number, zona: string) =>
    rpc('set_birthday_push_prefs', { p_token: token, p_avisos: avisos, p_hora: hora, p_minuto: minuto, p_zona_horaria: zona }),
  submitJoin,
  submitContact,
  birthdays,
};

/** Turns stored rich-text HTML into plain paragraphs for native rendering. */
export function htmlToParagraphs(html: string | null | undefined): string[] {
  if (!html) return [];
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<h[1-6][^>]*>/gi, '## ')
    .replace(/<blockquote[^>]*>/gi, '> ')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<(strong|b)>/gi, '**').replace(/<\/(strong|b)>/gi, '**')
    .replace(/<(em|i)>/gi, '*').replace(/<\/(em|i)>/gi, '*')
    .replace(/<u>/gi, '__').replace(/<\/u>/gi, '__')
    .replace(/<(del|s|strike)>/gi, '~~').replace(/<\/(del|s|strike)>/gi, '~~')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|ul|ol)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function formatDate(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
}
