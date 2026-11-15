import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from './supabase';

// ---------- Access ----------
export type Access = { isSuperAdmin: boolean; permissions: string[]; isRevoked: boolean; nombre: string; email: string };

export async function getAccess(): Promise<Access | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return null;
  const { data, error } = await supabase
    .from('user_roles')
    .select('is_super_admin,permissions,is_revoked,nombre')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new Error('No se pudo verificar tu acceso.');
  return {
    isSuperAdmin: Boolean(data?.is_super_admin),
    permissions: Array.isArray(data?.permissions) ? data.permissions : ['read_only'],
    isRevoked: Boolean(data?.is_revoked),
    nombre: String(data?.nombre || '').trim(),
    email: user.email ?? '',
  };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
}

export const signOut = () => supabase.auth.signOut();

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: 'https://mcp930.org/reset-password.html',
  });
  if (error) throw error;
}

// ---------- Events (same format the website admin writes) ----------
export type AdminEvento = {
  id: string;
  icono: string | null;
  titulo: string;
  horario: string;
  link: string;
  orden: number;
  activa: boolean;
  zona_horaria: string | null;
  notificar: boolean | null;
};

export const WEEK_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

export const EVENT_TIMEZONES: { value: string; label: string }[] = [
  { value: 'Europe/Luxembourg', label: 'Europa (Luxemburgo, Bélgica, París, Madrid)' },
  { value: 'Europe/London', label: 'Europa (Londres, Lisboa)' },
  { value: 'America/New_York', label: 'EE. UU. Este (Nueva York, Miami)' },
  { value: 'America/Chicago', label: 'EE. UU. Centro (Chicago, Houston)' },
  { value: 'America/Denver', label: 'EE. UU. Montaña (Denver)' },
  { value: 'America/Los_Angeles', label: 'EE. UU. Pacífico (Los Ángeles)' },
  { value: 'America/Santo_Domingo', label: 'República Dominicana / Puerto Rico' },
];

/** "19:30" -> "19h30", "19:00" -> "19h" (website formatTimeForDisplay). */
export function displayTime(hour: number, minute: number) {
  return minute ? `${hour}h${String(minute).padStart(2, '0')}` : `${hour}h`;
}

function joinSpanish(items: string[]) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/** Same text the website admin builds: "Diario · 19h", "Martes · 19h", "Lunes y Jueves · 20h30". */
export function buildSchedule(days: string[], hour: number, minute: number) {
  const ordered = WEEK_DAYS.filter((d) => days.includes(d));
  const when = ordered.length === 7 ? 'Diario' : ordered.join(',') === 'Lunes,Martes,Miércoles,Jueves,Viernes' ? 'Lunes a Viernes' : joinSpanish(ordered);
  return `${when} · ${displayTime(hour, minute)}`;
}

/** Best-effort read of an existing schedule back into days + time for editing. */
export function parseScheduleForEdit(horario: string): { days: string[]; hour: number; minute: number } {
  const norm = horario.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let days: string[] = [];
  if (/diario/.test(norm)) days = [...WEEK_DAYS];
  else if (/lunes a viernes/.test(norm)) days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  else days = WEEK_DAYS.filter((d) => new RegExp(`\\b${d.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}s?\\b`).test(norm));
  let hour = 19;
  let minute = 0;
  const ampm = norm.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*([ap])\.?\s*m/);
  const eu = norm.match(/\b([01]?\d|2[0-3])\s*h\s*([0-5]\d)?/);
  const clock = norm.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (ampm) { hour = (Number(ampm[1]) % 12) + (ampm[3] === 'p' ? 12 : 0); minute = Number(ampm[2] || 0); }
  else if (eu) { hour = Number(eu[1]); minute = Number(eu[2] || 0); }
  else if (clock) { hour = Number(clock[1]); minute = Number(clock[2]); }
  return { days, hour, minute };
}

export async function listEventos() {
  const { data, error } = await supabase.from('eventos').select('*').order('orden', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AdminEvento[];
}

export async function saveEvento(values: Omit<AdminEvento, 'id'>, id?: string) {
  const query = id
    ? supabase.from('eventos').update(values).eq('id', id).select('id')
    : supabase.from('eventos').insert(values).select('id');
  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length) throw new Error('No se guardó. Revisa que tu cuenta sea Super Admin.');
}

export async function setEventoActiva(id: string, activa: boolean) {
  const { error } = await supabase.from('eventos').update({ activa }).eq('id', id);
  if (error) throw error;
}

export async function deleteEvento(id: string) {
  const { error } = await supabase.from('eventos').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Images (same optimisation profiles as the website) ----------
const PROFILES: Record<string, { max: number; quality: number }> = {
  eventos: { max: 512, quality: 0.82 },
  destacadas: { max: 1600, quality: 0.82 },
  galeria: { max: 1600, quality: 0.8 },
  uploads: { max: 1600, quality: 0.8 },
};

function base64ToBytes(base64: string) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Resizes to the folder's profile, converts to WebP and uploads to mcp930-images. Returns the public URL. */
export async function uploadImage(uri: string, size: { width: number; height: number }, folder: keyof typeof PROFILES) {
  const profile = PROFILES[folder] ?? PROFILES.uploads;
  const scale = Math.min(1, profile.max / size.width, profile.max / size.height);
  const context = ImageManipulator.manipulate(uri);
  if (scale < 1) context.resize({ width: Math.round(size.width * scale), height: null });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.WEBP, compress: profile.quality, base64: true });
  if (!result.base64) throw new Error('No se pudo preparar la imagen.');
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}-app.webp`;
  const { error } = await supabase.storage.from('mcp930-images').upload(path, base64ToBytes(result.base64), {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from('mcp930-images').getPublicUrl(path).data.publicUrl;
}

// ---------- Gallery ----------
export type GalleryRegion = 'usa' | 'rd' | 'eu';

export async function listGalleryAlbums(region: GalleryRegion) {
  const { data, error } = await supabase.from('galeria').select('texto,categoria,orden').eq('categoria', region).order('orden', { ascending: true });
  if (error) throw error;
  const seen = new Map<string, number>();
  for (const row of data ?? []) {
    const title = String(row.texto || '').trim();
    if (title && !seen.has(title)) seen.set(title, Number(row.orden) || 1);
  }
  return [...seen.entries()].map(([title, orden]) => ({ title, orden }));
}

export async function addGalleryPhoto(params: { url: string; region: GalleryRegion; album: string; orden: number; portada: boolean }) {
  if (params.portada) {
    await supabase.from('galeria').update({ portada: false }).eq('categoria', params.region).eq('texto', params.album);
  }
  const { error } = await supabase.from('galeria').insert({
    foto_url: params.url,
    categoria: params.region,
    texto: params.album,
    orden: params.orden,
    activa: true,
    portada: params.portada,
  });
  if (error) throw error;
}

// ---------- Users & roles (manage-users Edge Function, Super Admin only) ----------
export type ManagedUser = {
  userId: string;
  email: string;
  nombre: string;
  isSuperAdmin: boolean;
  permissions: string[];
  isCurrentUser: boolean;
  isRevoked: boolean;
};

export const PERMISSIONS: { key: string; label: string; hint: string }[] = [
  { key: 'editor', label: 'Editor de devocionales', hint: 'Escribe y envía devocionales' },
  { key: 'reviewer', label: 'Revisor de devocionales', hint: 'Aprueba devocionales' },
  { key: 'read_export', label: 'Manager (exportar)', hint: 'Exporta el dashboard' },
  { key: 'birthday_calendar', label: 'Calendario de cumpleaños', hint: 'Aviso 2 días antes por correo' },
];

async function manageUsers<T = { ok: boolean; message?: string }>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('manage-users', { body });
  if (!error) return data as T;
  let message = error.message || 'No se pudo gestionar el usuario.';
  const ctx = (error as { context?: Response }).context;
  if (ctx) {
    try { message = (await ctx.clone().json())?.error || message; } catch { /* keep default */ }
  }
  throw new Error(message);
}

export async function listUsers() {
  const result = await manageUsers<{ users?: ManagedUser[] }>({ action: 'list' });
  return (result.users ?? []).sort((a, b) => a.email.localeCompare(b.email, 'es'));
}

export const setUserRole = (userId: string, isSuperAdmin: boolean, permissions: string[]) =>
  manageUsers({ action: 'set_role', userId, isSuperAdmin, permissions: permissions.filter((p) => p !== 'read_only') });

export const setMyBirthdayCalendar = (enabled: boolean) => manageUsers({ action: 'set_my_birthday_calendar', enabled });

export const inviteUser = (email: string, nombre: string, permissions: string[], isSuperAdmin: boolean) =>
  manageUsers({ action: 'invite', email, nombre, permissions, isSuperAdmin });

export const revokeUser = (userId: string) => manageUsers({ action: 'revoke', userId });
export const restoreUser = (userId: string) => manageUsers({ action: 'restore', userId });
export const resetUserPassword = (userId: string) => manageUsers({ action: 'send_password_reset', userId });
