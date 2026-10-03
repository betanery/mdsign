-- Leads da landing MDSign (Fase 1).
-- Escrita só pela Edge Function lead-submit (service role). Nenhum acesso
-- público: RLS ligado e sem políticas para anon/authenticated.

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text not null check (char_length(nome) between 1 and 120),
  email text not null check (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefone text check (char_length(telefone) <= 40),
  empresa text check (char_length(empresa) <= 160),
  plano text check (plano in ('cedro', 'jacaranda', 'angico', 'aroeira', 'ipe', 'mogno')),
  mensagem text check (char_length(mensagem) <= 2000),
  origem text check (char_length(origem) <= 80),
  pagina text check (char_length(pagina) <= 500),
  utm jsonb not null default '{}'::jsonb,
  ip_hash text,
  status text not null default 'novo' check (status in ('novo', 'em_contato', 'convertido', 'descartado'))
);

comment on table public.leads is 'Contatos recebidos pelo formulário da landing MDSign.';

create index leads_created_at_idx on public.leads (created_at desc);
create index leads_ip_hash_created_at_idx on public.leads (ip_hash, created_at desc);

alter table public.leads enable row level security;

revoke all on public.leads from anon, authenticated;
