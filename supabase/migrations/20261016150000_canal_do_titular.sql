-- MDSign — Canal do titular de dados (LGPD art. 18; auditoria 16/10/2026, Fase 2 item 7).
-- Qualquer pessoa (com ou sem conta) registra um pedido e recebe um protocolo. O Super Admin
-- acompanha prazo, situação e resposta, com histórico. Pedidos sobre documentos de uma
-- organização cliente podem ser encaminhados a ela (controladora desses dados).

create sequence public.data_request_seq;

create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique,
  requester_user_id uuid references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 2 and 160),
  email text not null check (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  relation text not null check (relation in ('user', 'signer', 'representative', 'other')),
  kind text not null check (kind in ('access', 'correction', 'deletion', 'portability',
    'sharing_info', 'revoke_consent', 'opposition', 'other')),
  organization_name text check (char_length(organization_name) <= 160),
  description text not null check (char_length(description) between 10 and 4000),
  status text not null default 'received' check (status in ('received', 'in_review',
    'waiting_info', 'forwarded', 'answered', 'rejected')),
  identity_verified boolean not null default false,
  due_at timestamptz not null default now() + interval '15 days',
  answered_at timestamptz,
  response text check (char_length(response) <= 8000),
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index data_requests_status_idx on public.data_requests (status, due_at);
create index data_requests_ip_idx on public.data_requests (ip_hash, created_at desc);

create table public.data_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.data_requests (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('created', 'status', 'note', 'response', 'verified')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index data_request_events_req_idx on public.data_request_events (request_id, created_at);

alter table public.data_requests enable row level security;
alter table public.data_request_events enable row level security;
-- A pessoa logada vê os próprios pedidos; o resto só o Super Admin (via funções).
create policy data_requests_own on public.data_requests for select to authenticated
  using (requester_user_id = auth.uid());
revoke all on public.data_requests, public.data_request_events from anon, authenticated;
grant select on public.data_requests to authenticated;

-- Criação (chamada pela função pública data-request, com o cliente de serviço).
create function public.create_data_request(p_user uuid, p_name text, p_email text,
  p_relation text, p_kind text, p_org text, p_description text, p_ip_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  proto text := 'LGPD-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY') || '-'
    || lpad(nextval('public.data_request_seq')::text, 6, '0');
  rid uuid;
begin
  insert into public.data_requests (protocol, requester_user_id, name, email, relation, kind,
    organization_name, description, identity_verified, ip_hash)
  values (proto, p_user, trim(p_name), lower(trim(p_email)), p_relation, p_kind,
    nullif(trim(coalesce(p_org, '')), ''), trim(p_description),
    -- Logado com o mesmo e-mail da conta: identidade já confirmada pelo login.
    p_user is not null and exists (select 1 from auth.users u where u.id = p_user
      and lower(u.email) = lower(trim(p_email))),
    p_ip_hash)
  returning id into rid;
  insert into public.data_request_events (request_id, actor_id, action, data)
    values (rid, p_user, 'created', jsonb_build_object('kind', p_kind));
  return proto;
end;
$$;
revoke execute on function public.create_data_request(uuid, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_data_request(uuid, text, text, text, text, text, text, text)
  to service_role;

-- Super Admin: lista, histórico e atualização (situação, verificação, nota, resposta).
create function public.admin_data_requests()
returns setof public.data_requests language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select * from public.data_requests order by
    (status in ('answered', 'rejected')), due_at;
end;
$$;

create function public.admin_data_request_events(req uuid)
returns table (created_at timestamptz, action text, actor_email text, data jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select e.created_at, e.action, u.email::text, e.data
    from public.data_request_events e left join auth.users u on u.id = e.actor_id
    where e.request_id = req order by e.created_at;
end;
$$;

create function public.admin_update_data_request(req uuid, new_status text default null,
  verified boolean default null, note text default null, answer text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare old record;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into old from public.data_requests where id = req for update;
  if old is null then raise exception 'invalid_request' using errcode = 'P0001'; end if;
  if new_status is not null and new_status not in ('received', 'in_review', 'waiting_info',
     'forwarded', 'answered', 'rejected') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update public.data_requests set
    status = coalesce(new_status, status),
    identity_verified = coalesce(verified, identity_verified),
    response = coalesce(nullif(trim(answer), ''), response),
    answered_at = case when coalesce(new_status, status) in ('answered', 'rejected')
      then coalesce(answered_at, now()) else answered_at end,
    updated_at = now()
  where id = req;
  if new_status is not null and new_status is distinct from old.status then
    insert into public.data_request_events (request_id, actor_id, action, data)
      values (req, auth.uid(), 'status', jsonb_build_object('from', old.status, 'to', new_status));
  end if;
  if verified is not null and verified is distinct from old.identity_verified then
    insert into public.data_request_events (request_id, actor_id, action, data)
      values (req, auth.uid(), 'verified', jsonb_build_object('value', verified));
  end if;
  if nullif(trim(coalesce(note, '')), '') is not null then
    insert into public.data_request_events (request_id, actor_id, action, data)
      values (req, auth.uid(), 'note', jsonb_build_object('text', left(trim(note), 2000)));
  end if;
  if nullif(trim(coalesce(answer, '')), '') is not null then
    insert into public.data_request_events (request_id, actor_id, action, data)
      values (req, auth.uid(), 'response', jsonb_build_object('text', left(trim(answer), 2000)));
  end if;
end;
$$;

revoke execute on function public.admin_data_requests(), public.admin_data_request_events(uuid),
  public.admin_update_data_request(uuid, text, boolean, text, text) from public, anon;
grant execute on function public.admin_data_requests(), public.admin_data_request_events(uuid),
  public.admin_update_data_request(uuid, text, boolean, text, text) to authenticated;

-- Saúde da plataforma: pedidos de titulares em aberto e vencidos.
do $$
declare src text;
begin
  select pg_get_functiondef('public.admin_health()'::regprocedure) into src;
  src := replace(src,
    '''bulk_stuck'', (select count(*) from public.bulk_jobs',
    '''data_requests_open'', (select count(*) from public.data_requests
      where status not in (''answered'', ''rejected'')),
    ''data_requests_overdue'', (select count(*) from public.data_requests
      where status not in (''answered'', ''rejected'') and due_at < now()),
    ''bulk_stuck'', (select count(*) from public.bulk_jobs');
  execute src;
end $$;
