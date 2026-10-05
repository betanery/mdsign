-- MDSign — Modelos com papéis em links públicos: quem responde ocupa o 1º papel; os demais
-- papéis (ex.: Gestor, RH) são pessoas fixas escolhidas por quem cria o link.
alter table public.forms add column role_people jsonb not null default '{}'::jsonb;
