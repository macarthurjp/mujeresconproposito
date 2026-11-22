import { supabase } from './supabase';

export type RecipientForm = 'contact' | 'join';
export type Recipient = { id: string; form: RecipientForm; comunidad: string | null; email: string; nombre: string | null; active: boolean };

export const COMMUNITIES = ['Europa', 'Estados Unidos', 'República Dominicana'] as const;

export async function listRecipients(): Promise<Recipient[]> {
  const { data, error } = await supabase
    .from('notification_recipients')
    .select('id,form,comunidad,email,nombre,active')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Recipient[];
}

/** CONTACT_EMAIL (server secret): the backup that receives a form while its group has nobody active. Null if unknown. */
export async function getFallbackRecipients(): Promise<string[] | null> {
  try {
    const { data, error } = await supabase.functions.invoke('manage-users', { body: { action: 'form_recipients_fallback' } });
    if (error || !data?.ok || !Array.isArray(data.fallback)) return null;
    return data.fallback as string[];
  } catch {
    return null;
  }
}

/**
 * Who really gets a group's e-mails today, mirroring getRecipients() in
 * supabase/functions/_shared/recipients.ts: a community also inherits the
 * "Todas las comunidades" recipients; the backup only receives when nobody active matches.
 */
export function receiversOf(items: Recipient[], form: RecipientForm, comunidad: string | null) {
  const activeIn = (c: string | null) => items.filter((r) => r.active && r.form === form && (r.comunidad ?? null) === c);
  const own = activeIn(comunidad);
  const inherited = form === 'join' && comunidad ? activeIn(null) : [];
  return { inherited, usesFallback: !own.length && !inherited.length };
}

/**
 * Adds a recipient. When the group was relying on the backup address, the
 * backup is kept as an explicit row so it doesn't silently stop receiving.
 * Returns the backup addresses that were kept.
 */
export async function addRecipient(input: { form: RecipientForm; comunidad: string | null; email: string; nombre: string; keep?: string[] }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Escribe un correo válido.');
  const comunidad = input.form === 'join' ? input.comunidad : null;
  const keep = (input.keep ?? []).filter((f) => f !== email);
  const { error } = await supabase.from('notification_recipients').insert([
    { form: input.form, comunidad, email, nombre: input.nombre.trim() || null },
    ...keep.map((f) => ({ form: input.form, comunidad, email: f, nombre: 'Correo principal' })),
  ]);
  if (error) throw new Error(error.code === '23505' ? 'Ese correo ya recibe este formulario.' : error.message);
  return keep;
}

export async function setRecipientActive(id: string, active: boolean) {
  const { error } = await supabase.from('notification_recipients').update({ active }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function removeRecipient(id: string) {
  const { error } = await supabase.from('notification_recipients').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
