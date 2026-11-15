-- Who receives the e-mails from the contact form and the join ("Únete") form.
-- Managed by the Super Admin from the admin panel (web + app).
--
--   form = 'contact' -> every contact / prayer-request message
--   form = 'join'    -> join registrations; `comunidad` narrows it:
--        null                     -> receives ALL registrations
--        'Europa' / 'Estados Unidos' / 'República Dominicana'
--                                 -> only registrations for that community
--
-- If no active recipient matches, the Edge Functions fall back to the
-- CONTACT_EMAIL secret so no message is ever lost.

create table if not exists public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  form text not null check (form in ('contact', 'join')),
  comunidad text check (comunidad is null or comunidad in ('Europa', 'Estados Unidos', 'República Dominicana')),
  email text not null check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  nombre text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

-- One row per (form, community, e-mail); null community counts as "all".
create unique index if not exists notification_recipients_unique
  on public.notification_recipients (form, coalesce(comunidad, '*'), lower(email));

alter table public.notification_recipients enable row level security;

drop policy if exists "Super admin manages notification recipients" on public.notification_recipients;
create policy "Super admin manages notification recipients"
  on public.notification_recipients
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

revoke all on public.notification_recipients from anon;
grant select, insert, update, delete on public.notification_recipients to authenticated;
