update public.devocionales
set autora = 'Equipo Mujeres con Propósito'
where autora is null or btrim(autora) = '';

alter table public.devocionales
  alter column autora set default 'Equipo Mujeres con Propósito',
  alter column autora set not null;
