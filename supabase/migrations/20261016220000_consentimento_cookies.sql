-- MDSign — Registro do consentimento de cookies (auditoria 16/10/2026, Fase 4 item 15).
-- Comprovante de cada escolha feita no aviso de cookies (LGPD art. 8º, §2º: o ônus da prova do
-- consentimento é do controlador). Sem nome, e-mail nem IP: só um código anônimo gerado no
-- navegador, a escolha, a versão do aviso, a página e a data.
create table public.cookie_consents (
  id bigint generated always as identity primary key,
  consent_id uuid not null,
  analytics boolean not null,
  marketing boolean not null,
  version integer not null check (version between 1 and 1000),
  page text check (char_length(page) <= 200),
  created_at timestamptz not null default now()
);
create index cookie_consents_consent_idx on public.cookie_consents (consent_id, created_at desc);
alter table public.cookie_consents enable row level security;
revoke all on public.cookie_consents from anon, authenticated;
