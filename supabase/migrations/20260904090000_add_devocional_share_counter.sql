alter table public.devocionales add column if not exists compartidos integer not null default 0;

create or replace function public.increment_devocional_share(p_slug text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_count integer;
begin
  update public.devocionales
  set compartidos = compartidos + 1
  where slug = p_slug and publicado = true
  returning compartidos into new_count;
  return new_count;
end;
$$;

revoke all on function public.increment_devocional_share(text) from public;
grant execute on function public.increment_devocional_share(text) to anon, authenticated;
