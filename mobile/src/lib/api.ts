// Read-only access to the same Supabase project the website uses.
// The publishable key is public by design (it is also in the website source);
// Row Level Security limits it to public content.
const SUPABASE_URL = 'https://jkunywiyiyidhyodsbfh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX';

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function rest<T>(path: string): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!response.ok) throw new Error(`Error ${response.status} al cargar datos`);
  return response.json() as Promise<T>;
}

async function rpc(name: string, body: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Error ${response.status}: ${await response.text()}`);
}

async function submitJoin(payload: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-join`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({})) as { error?: string; notificationsSent?: boolean };
  if (!response.ok) throw new Error(result.error || `Error ${response.status} al enviar la solicitud`);
  return result;
}

export type Birthday = { nombreCompleto: string; fecha?: string; dias?: number };

async function birthdays() {
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

export type Destacada = { id: string; foto_url: string; nombre: string; titulo: string | null };
export type Foto = { id: string; foto_url: string; categoria: string; texto: string | null };
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
  destacadas: () => rest<Destacada[]>('destacadas?select=id,foto_url,nombre,titulo&activa=eq.true&order=orden.asc'),
  galeria: () => rest<Foto[]>('galeria?select=id,foto_url,categoria,texto&activa=eq.true&order=orden.asc'),
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
  submitJoin,
  birthdays,
};

/** Turns stored rich-text HTML into plain paragraphs for native rendering. */
export function htmlToParagraphs(html: string | null | undefined): string[] {
  if (!html) return [];
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
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
