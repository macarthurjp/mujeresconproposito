alter table public.devocionales add column if not exists introduccion_html text;
alter table public.devocionales add column if not exists contenido_html text;
alter table public.devocionales add column if not exists versiculo text;
alter table public.devocionales add column if not exists categorias text[] not null default '{}';
