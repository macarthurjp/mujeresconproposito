-- Notices can also go by email to everyone registered through Únete.
-- People who unsubscribe are kept here (lower-case email) and skipped.
create table if not exists public.email_unsubscribes (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.email_unsubscribes enable row level security;
-- Admins who can see notices may read the list; only the service role writes.
drop policy if exists "roles read unsubscribes" on public.email_unsubscribes;
create policy "roles read unsubscribes" on public.email_unsubscribes
  for select to authenticated using (public.has_admin_module_permission('notices', 'view'));
grant select on public.email_unsubscribes to authenticated;

alter table public.push_broadcasts add column if not exists correos integer not null default 0;
