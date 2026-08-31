-- Extiende la protección contra duplicados de prevent_duplicate_unirse (ver
-- 20260831110000_prevent_duplicate_members.sql) para que también aplique al
-- editar un registro desde el dashboard (UPDATE), no solo al crearlo.
-- Antes el trigger era "before insert" únicamente: un admin editando un
-- registro podía dejarlo con el mismo email/teléfono que otro registro sin
-- que nada lo impidiera. Se excluye la propia fila (existing.id <> new.id)
-- para que actualizar un registro sin cambiar su email/teléfono no se marque
-- como duplicado de sí mismo.

create or replace function public.prevent_duplicate_unirse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(regexp_replace(trim(coalesce(new.email, '')), '\s+', '', 'g'));
  normalized_phone text := regexp_replace(coalesce(new.telefono, ''), '\D', '', 'g');
begin
  if normalized_email <> '' then
    perform pg_advisory_xact_lock(hashtextextended('unirse-email:' || normalized_email, 0));
  end if;

  if normalized_phone <> '' then
    perform pg_advisory_xact_lock(hashtextextended('unirse-phone:' || normalized_phone, 0));
  end if;

  if exists (
    select 1
    from public.unirse existing
    where existing.id is distinct from new.id
    and (
      (
        normalized_email <> ''
        and lower(regexp_replace(trim(coalesce(existing.email, '')), '\s+', '', 'g')) = normalized_email
      ) or (
        normalized_phone <> ''
        and regexp_replace(coalesce(existing.telefono, ''), '\D', '', 'g') = normalized_phone
      )
    )
  ) then
    raise exception using
      errcode = '23505',
      message = 'duplicate member email or phone';
  end if;

  new.email := normalized_email;
  return new;
end;
$$;

drop trigger if exists prevent_duplicate_unirse_before_insert on public.unirse;
drop trigger if exists prevent_duplicate_unirse_before_insert_or_update on public.unirse;
create trigger prevent_duplicate_unirse_before_insert_or_update
before insert or update on public.unirse
for each row execute function public.prevent_duplicate_unirse();
