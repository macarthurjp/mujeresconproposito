-- Fallback verification for the app's forms. When Cloudflare Turnstile cannot complete
-- inside the iOS/Android WebView, app-verify.html requests a single-use, short-lived
-- token from the form-fallback-token function (rate-limited per IP). submit-join and
-- submit-contact accept that token once. Error codes are kept to diagnose Turnstile.
create table if not exists public.form_verification_fallbacks (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  ip_hash text not null,
  action text not null check (action in ('join', 'contact')),
  error_code text,
  nonce text not null unique,
  used_at timestamptz
);
create index if not exists form_verification_fallbacks_ip_idx on public.form_verification_fallbacks (ip_hash, created_at desc);
alter table public.form_verification_fallbacks enable row level security;
-- No policies: only the server functions (service role) can read or write it.
revoke all on public.form_verification_fallbacks from anon, authenticated;
