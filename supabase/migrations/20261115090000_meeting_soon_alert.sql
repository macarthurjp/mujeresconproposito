-- 15-minute heads-up before each meeting: dedupe marker for notify-meeting-start.
alter table public.eventos add column if not exists ultimo_aviso_previo timestamptz;
