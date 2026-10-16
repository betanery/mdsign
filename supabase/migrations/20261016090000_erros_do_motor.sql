-- MDSign — Registro dos erros do motor de assinatura (auditoria 16/10/2026, Fase 1 item 3).
-- Serve para diagnosticar falhas como o erro 500 na criação de documentos. Sem dados pessoais:
-- a mensagem do motor é mascarada antes de gravar (CPF, CNPJ, e-mail, telefone).

create table public.engine_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  operation text not null check (char_length(operation) <= 200),
  engine_document_id text check (char_length(engine_document_id) <= 64),
  kind text not null check (kind in ('http', 'timeout', 'network')),
  http_status integer,
  code text check (char_length(code) <= 120),
  message text check (char_length(message) <= 500)
);
create index engine_errors_created_idx on public.engine_errors (created_at desc);
alter table public.engine_errors enable row level security;
revoke all on public.engine_errors from anon, authenticated;

-- Super Admin: últimos erros e contagem nas últimas 24 horas.
create function public.admin_engine_errors(lim integer default 50)
returns table (id bigint, created_at timestamptz, operation text, engine_document_id text,
  kind text, http_status integer, code text, message text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query select e.id, e.created_at, e.operation, e.engine_document_id, e.kind,
    e.http_status, e.code, e.message
  from public.engine_errors e order by e.created_at desc
  limit least(greatest(coalesce(lim, 50), 1), 200);
end;
$$;
revoke execute on function public.admin_engine_errors(integer) from public, anon;
grant execute on function public.admin_engine_errors(integer) to authenticated;

-- Saúde da plataforma passa a mostrar os erros do motor (24 h).
do $$
declare src text;
begin
  select pg_get_functiondef('public.admin_health()'::regprocedure) into src;
  src := replace(src,
    '''bulk_stuck'', (select count(*) from public.bulk_jobs',
    '''engine_errors_24h'', (select count(*) from public.engine_errors
      where created_at > now() - interval ''24 hours''),
    ''bulk_stuck'', (select count(*) from public.bulk_jobs');
  execute src;
end $$;
