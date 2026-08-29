alter table public.galeria add column if not exists portada boolean not null default false;

create index if not exists galeria_categoria_texto_portada_idx
  on public.galeria (categoria, texto, portada);
