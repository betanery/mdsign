-- MDSign: validação pública de documentos (página /validar). Só acréscimos.

-- 1. Código de validação do motor (o mesmo impresso na página de assinaturas do PDF), para
--    mostrar ao dono do documento "Como validar este documento".
alter table public.documents add column if not exists verification_key text
  check (verification_key is null or char_length(verification_key) <= 80);

-- 2. Tentativas de validação (limite por endereço; sem IP em claro, sem conteúdo do documento).
create table public.validation_attempts (
  id bigint generated always as identity primary key,
  ip_hash text,
  kind text not null check (kind in ('code', 'file')),
  found boolean not null default false,
  created_at timestamptz not null default now()
);
create index validation_attempts_ip_idx on public.validation_attempts (ip_hash, created_at);
alter table public.validation_attempts enable row level security;
-- Sem políticas: só o servidor (service role) lê e grava.
revoke all on public.validation_attempts from anon, authenticated;
