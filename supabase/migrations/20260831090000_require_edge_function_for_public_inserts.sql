-- Los formularios públicos ("Únete" y "Contacto") ahora insertan a través de
-- las Edge Functions submit-join / submit-contact, que verifican Cloudflare
-- Turnstile antes de escribir. El insert directo por parte de "anon" ya no es
-- necesario y permitiría saltarse la verificación llamando a la API REST
-- directamente, así que se revoca.

drop policy if exists "public insert unirse" on public.unirse;
drop policy if exists "public insert contact_messages" on public.contact_messages;
