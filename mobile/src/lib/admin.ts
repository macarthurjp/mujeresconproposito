import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { SUPABASE_PROJECT, supabase } from './supabase';

// ---------- Access ----------
export type Access = { isSuperAdmin: boolean; permissions: string[]; modulePermissions: string[]; roleName: string | null; isRevoked: boolean; nombre: string; email: string };

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
  if (!data) return null;
  const isSuperAdmin = Boolean(data?.is_super_admin);
  const legacyPermissions = Array.isArray(data?.permissions) ? data.permissions : [];
  let modulePermissions: string[] = [];
  const { data: moduleData } = await supabase.rpc('admin_current_module_permissions');
  if (Array.isArray(moduleData)) modulePermissions = moduleData.filter((entry: { allowed?: boolean }) => entry.allowed).map((entry: { permission_key: string }) => entry.permission_key);
  else if (isSuperAdmin) modulePermissions = ADMIN_PERMISSION_CATALOG.map((permission) => permission.key);
  let roleName: string | null = null;
  if (!isSuperAdmin) {
    const { data: assignment } = await supabase.from('admin_role_assignments').select('admin_roles(name)').eq('user_id', user.id).maybeSingle();
    const role = (assignment as { admin_roles?: { name?: string } | { name?: string }[] } | null)?.admin_roles;
    roleName = (Array.isArray(role) ? role[0]?.name : role?.name) ?? null;
  }
  return {
    isSuperAdmin,
    permissions: legacyPermissions,
    modulePermissions,
    roleName,
    isRevoked: Boolean(data?.is_revoked),
    nombre: String(data?.nombre || '').trim(),
    email: user.email ?? '',
  };
}

export type AdminModule = 'events' | 'devotionals' | 'gallery' | 'content' | 'notices' | 'dashboard';
export const ADMIN_MODULES: { key: AdminModule; label: string; permissions: { key: string; label: string }[] }[] = [
  { key: 'events', label: 'Eventos y reuniones', permissions: [{key:'view',label:'Visualizar'},{key:'create',label:'Crear'},{key:'edit',label:'Editar'},{key:'delete',label:'Eliminar'}] },
  { key: 'devotionals', label: 'Devocionales', permissions: [{key:'view',label:'Visualizar'},{key:'create',label:'Crear'},{key:'edit',label:'Editar'},{key:'delete',label:'Eliminar'},{key:'publish',label:'Publicar'}] },
  { key: 'gallery', label: 'Galería de fotos', permissions: [{key:'view',label:'Visualizar imágenes'},{key:'add',label:'Agregar imágenes'},{key:'edit',label:'Modificar imágenes'},{key:'delete',label:'Eliminar imágenes'}] },
  { key: 'content', label: 'Contenidos y publicaciones', permissions: [{key:'view',label:'Visualizar'},{key:'create',label:'Crear'},{key:'edit',label:'Editar'},{key:'delete',label:'Eliminar'},{key:'publish',label:'Publicar'}] },
  { key: 'notices', label: 'Enviar aviso', permissions: [{key:'view',label:'Acceder al módulo'},{key:'send',label:'Enviar avisos'}] },
  { key: 'dashboard', label: 'Dashboard', permissions: [{key:'view',label:'Visualizar'},{key:'contacts',label:'Ver contactos y exportar'},{key:'followup',label:'Seguimiento y estadísticas'}] },
];
export const ADMIN_PERMISSION_CATALOG = ADMIN_MODULES.flatMap((module) => module.permissions.map((permission) => ({...permission,module:module.key,key:`${module.key}.${permission.key}`})));
export const canAdmin = (access: Access | null, module: AdminModule, action: string) => Boolean(access && !access.isRevoked && (access.isSuperAdmin || access.modulePermissions.includes(`${module}.${action}`)));

export type AdminRole = { id: string; name: string; description: string; view_only?: boolean };
export async function listAdminRoles() {
  const {data,error}=await supabase.from('admin_roles').select('id,name,description,view_only').order('name'); if(error) throw error; return (data??[]) as AdminRole[];
}
export async function saveAdminRole(name:string,description:string,id?:string) {
  const {data,error}=await supabase.rpc('admin_save_role',{p_name:name,p_description:description,p_role_id:id??null}); if(error) throw error; return String(data);
}
export async function saveAdminRolePermissions(roleId:string,permissions:string[]) {
  const {error}=await supabase.rpc('admin_save_role_permissions',{p_role_id:roleId,p_permissions:permissions}); if(error) throw error;
}
export async function listAdminRolePermissions(roleId:string) {
  const {data,error}=await supabase.from('admin_role_permissions').select('permission_key').eq('role_id',roleId); if(error) throw error; return (data??[]).map((row)=>row.permission_key as string);
}
/** All role → permission keys (Super Admin only), for counts and summaries. */
export async function listAllAdminRolePermissions() {
  const {data,error}=await supabase.from('admin_role_permissions').select('role_id,permission_key'); if(error) throw error;
  const map: Record<string,string[]> = {};
  (data??[]).forEach((row)=>{ (map[row.role_id as string] ??= []).push(row.permission_key as string); });
  return map;
}
export async function assignAdminRole(email:string,roleId:string) {
  const {data,error}=await supabase.rpc('admin_assign_role',{p_email:email,p_role_id:roleId}); if(error) throw error; return String(data);
}
export async function listAdminRoleAssignments() {
  const {data,error}=await supabase.from('admin_role_assignments').select('user_id,role_id,assigned_at,admin_roles(name)'); if(error) throw error; return data??[];
}
export async function removeAdminRoleAssignment(userId:string) {
  const {error}=await supabase.rpc('admin_remove_role_assignment',{p_user_id:userId}); if(error) throw error;
}
export async function listAdminUserOverrides(userId:string) {
  const {data,error}=await supabase.from('admin_user_permission_overrides').select('permission_key,allowed').eq('user_id',userId); if(error) throw error; return Object.fromEntries((data??[]).map((row)=>[row.permission_key,row.allowed as boolean]));
}
export async function saveAdminUserOverrides(userId:string,overrides:Record<string,boolean>) {
  const {error}=await supabase.rpc('admin_save_user_overrides',{p_user_id:userId,p_overrides:overrides}); if(error) throw error;
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
  try {
    const access = await getAccess();
    if (canAccessAdminPanel(access)) return;
  } catch {
    await supabase.auth.signOut();
    throw new Error('No se pudo verificar tu acceso al panel.');
  }
  await supabase.auth.signOut();
  throw new Error('Esta cuenta no tiene acceso al panel privado.');
}

/** One shared rule keeps password and provider sign-in consistent with role screens. */
export function canAccessAdminPanel(access: Access | null): access is Access {
  return Boolean(access && !access.isRevoked && (access.isSuperAdmin || access.permissions.length > 0 || access.modulePermissions.length > 0));
}

/**
 * Access is by invitation only: admins invited by email sign in with email and
 * password. Apple/Google sign-in stays implemented but switched off; set this
 * to true to bring it back (providers must also be enabled in Supabase Auth).
 * See docs/auth.md.
 */
export const OAUTH_PROVIDERS_ENABLED = false;

/** Which OAuth providers can be offered: the app switch AND Supabase Auth (public endpoint). */
export async function enabledProviders(): Promise<{ apple: boolean; google: boolean }> {
  if (!OAUTH_PROVIDERS_ENABLED) return { apple: false, google: false };
  const response = await fetch(`${SUPABASE_PROJECT.url}/auth/v1/settings`, {
    headers: { apikey: SUPABASE_PROJECT.key },
  });
  const external = ((await response.json()) as { external?: Record<string, boolean> }).external ?? {};
  return { apple: Boolean(external.apple), google: Boolean(external.google) };
}

/** Starts a provider sign-in in the OS authentication session and returns to the app scheme. */
export async function signInWithProvider(provider: 'apple' | 'google') {
  if (!OAUTH_PROVIDERS_ENABLED) throw new Error('El acceso es solo con el correo de tu invitación.');
  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);
  if (!data.url) throw new Error('No se pudo iniciar el acceso con el proveedor.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'cancel' || result.type === 'dismiss') return false;
  if (result.type !== 'success') throw new Error('No se completó el acceso. Inténtalo de nuevo.');
  if (!result.url.startsWith(redirectTo)) throw new Error('La dirección de retorno del acceso no es válida.');

  const callback = Linking.parse(result.url);
  const params = callback.queryParams ?? {};
  const callbackError = params.error_description || params.error;
  if (typeof callbackError === 'string') throw new Error(callbackError.replaceAll('+', ' '));
  const code = params.code;
  if (typeof code !== 'string' || !code) throw new Error('El proveedor no devolvió el código de acceso.');
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw new Error(exchangeError.message);
  let access: Access | null;
  try { access = await getAccess(); }
  catch {
    await supabase.auth.signOut();
    throw new Error('No se pudo verificar tu acceso al panel.');
  }
  if (!canAccessAdminPanel(access)) {
    await supabase.auth.signOut();
    throw new Error('Esta cuenta no tiene permisos para el panel privado.');
  }
  return true;
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
  creado_at?: string | null;
  creado_por_nombre?: string | null;
  modificado_at?: string | null;
  modificado_por_nombre?: string | null;
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

export async function saveEvento(values: Omit<AdminEvento, 'id' | 'creado_at' | 'creado_por_nombre' | 'modificado_at' | 'modificado_por_nombre'>, id?: string) {
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

export async function setEventoOrden(id: string, orden: number) {
  const { error } = await supabase.from('eventos').update({ orden }).eq('id', id);
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
  devocionales: { max: 1600, quality: 0.82 },
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
export type GalleryPhoto = { id: string; foto_url: string; categoria: string; texto: string; orden: number; activa: boolean; portada: boolean };

export async function listGalleryPhotos(region: GalleryRegion) {
  const { data, error } = await supabase.from('galeria').select('*').eq('categoria', region).order('texto').order('orden', { ascending: true });
  if (error) throw error;
  return (data ?? []) as GalleryPhoto[];
}

export async function saveGalleryPhoto(id: string, values: Partial<Pick<GalleryPhoto, 'foto_url' | 'categoria' | 'texto' | 'orden' | 'activa' | 'portada'>>) {
  const { error } = await supabase.from('galeria').update(values).eq('id', id);
  if (error) throw error;
}

export async function setGalleryCover(photo: GalleryPhoto) {
  const { error: clearError } = await supabase.from('galeria').update({ portada: false }).eq('categoria', photo.categoria).eq('texto', photo.texto);
  if (clearError) throw clearError;
  await saveGalleryPhoto(photo.id, { portada: true });
}

export async function removeGalleryPhoto(id: string) {
  const { error } = await supabase.from('galeria').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderGalleryAlbum(region: GalleryRegion, title: string, delta: -1 | 1) {
  const rows = await listGalleryPhotos(region);
  const albumOrder = new Map<string, number>();
  for (const row of rows) albumOrder.set(row.texto, Math.min(albumOrder.get(row.texto) ?? Number.MAX_SAFE_INTEGER, row.orden));
  const albums = [...albumOrder.entries()].sort((a, b) => a[1] - b[1]);
  const index = albums.findIndex(([name]) => name === title);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= albums.length) return;
  [albums[index], albums[next]] = [albums[next], albums[index]];
  const updates = albums.flatMap(([name], order) => {
    const photos = rows.filter((photo) => photo.texto === name).sort((a, b) => a.orden - b.orden);
    return photos.map((photo, photoIndex) => supabase.from('galeria').update({ orden: order * 1000 + photoIndex + 1 }).eq('id', photo.id));
  });
  const { error } = await Promise.all(updates)
    .then((results) => ({ error: results.find((result) => result.error)?.error }));
  if (error) throw error;
}

export async function reorderGalleryPhoto(region: GalleryRegion, title: string, id: string, delta: -1 | 1) {
  const photos = (await listGalleryPhotos(region)).filter((photo) => photo.texto === title);
  const index = photos.findIndex((photo) => photo.id === id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= photos.length) return;
  const current = photos[index];
  const neighbor = photos[next];
  const results = await Promise.all([
    supabase.from('galeria').update({ orden: neighbor.orden }).eq('id', current.id),
    supabase.from('galeria').update({ orden: current.orden }).eq('id', neighbor.id),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

export async function listGalleryAlbums(region: GalleryRegion) {
  const { data, error } = await supabase.from('galeria').select('texto,categoria,orden').eq('categoria', region).order('orden', { ascending: true });
  if (error) throw error;
  const seen = new Map<string, number>();
  for (const row of data ?? []) {
    const title = String(row.texto || '').trim();
    if (title) seen.set(title, Math.min(seen.get(title) ?? Number.MAX_SAFE_INTEGER, Number(row.orden) || 1));
  }
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([title], index) => ({ title, orden: index * 1000 + 1 }));
}

export async function addGalleryPhoto(params: { url: string; region: GalleryRegion; album: string; orden: number; portada: boolean }) {
  if (params.portada) {
    const { error: coverError } = await supabase.from('galeria').update({ portada: false }).eq('categoria', params.region).eq('texto', params.album);
    if (coverError) throw coverError;
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
  /** Assigned role name (Roles y permisos), filled by the Usuarios screen. */
  roleName?: string | null;
  isRevoked: boolean;
};

export const PERMISSIONS: { key: string; label: string; hint: string }[] = [
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
export const changeMyAdminEmail = (email: string) => manageUsers({ action: 'change_my_email', email });
export const setUserName = (userId: string, nombre: string) => manageUsers({ action: 'set_name', userId, nombre });
