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

export async function addRecipient(input: { form: RecipientForm; comunidad: string | null; email: string; nombre: string }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Escribe un correo válido.');
  const { error } = await supabase.from('notification_recipients').insert({
    form: input.form,
    comunidad: input.form === 'join' ? input.comunidad : null,
    email,
    nombre: input.nombre.trim() || null,
  });
  if (error) throw new Error(error.code === '23505' ? 'Ese correo ya recibe este formulario.' : error.message);
}

export async function setRecipientActive(id: string, active: boolean) {
  const { error } = await supabase.from('notification_recipients').update({ active }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function removeRecipient(id: string) {
  const { error } = await supabase.from('notification_recipients').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
