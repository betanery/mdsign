-- MDSign — Etapa 1 da evolução comercial: franquia gratuita por pessoa, consumo seguro
-- (reserva → confirmação, idempotente) e matriz comercial versionada.
--
-- Regras:
-- - Só acréscimos. consume_document e refund_document continuam existindo (compatibilidade).
-- - Matriz versionada: cada assinatura guarda a versão em que foi contratada; mudar a matriz
--   nunca altera direitos de quem já contratou. A nova matriz nasce em RASCUNHO e só vale para
--   contratações feitas depois de publicada (admin_publish_plan_version).
-- - Cedro: 5 documentos grátis por PESSOA, uma única vez (free_allowances), não por organização.
--   A pessoa é a dona da organização Cedro (o Cedro tem 1 usuário). Contas diferentes NÃO são
--   tratadas como a mesma pessoa sem evidência verificável (person_identities fica preparada).
-- - O que consome 1 documento: a criação bem-sucedida de 1 documento no motor (um envelope),
--   qualquer que seja o número de participantes. Assinaturas não consomem.

-- 1. Matriz comercial versionada ---------------------------------------------------------------
create table public.plan_versions (
  id text primary key check (id ~ '^[a-z0-9_]{3,40}$'),
  name text not null check (char_length(name) between 2 and 120),
  status text not null check (status in ('draft', 'published', 'retired')),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null
);
create unique index plan_versions_one_published on public.plan_versions ((true)) where status = 'published';

create table public.plan_version_prices (
  version_id text not null references public.plan_versions (id) on delete restrict,
  plan_id text not null references public.plans (id) on delete restrict,
  price_cents integer check (price_cents is null or price_cents >= 0),
  primary key (version_id, plan_id)
);
create table public.plan_version_entitlements (
  version_id text not null references public.plan_versions (id) on delete restrict,
  plan_id text not null references public.plans (id) on delete restrict,
  key text not null,
  value_int integer,
  value_bool boolean,
  primary key (version_id, plan_id, key)
);

-- Versão vigente: fotografia exata do que existe hoje (Jacarandá com 20 documentos por mês).
insert into public.plan_versions (id, name, status, notes, published_at) values
  ('matriz_2026_10', 'Matriz vigente até a publicação da nova', 'published',
   'Fotografia dos planos e direitos em 18/10/2026. Preserva os contratos existentes.', now());
insert into public.plan_version_prices (version_id, plan_id, price_cents)
  select 'matriz_2026_10', id, price_cents from public.plans;
insert into public.plan_version_entitlements (version_id, plan_id, key, value_int, value_bool)
  select 'matriz_2026_10', plan_id, key, value_int, value_bool from public.plan_entitlements;

-- Nova matriz (RASCUNHO): mesmos preços; Jacarandá com 50 documentos por mês.
insert into public.plan_versions (id, name, status, notes) values
  ('matriz_2026_11', 'Nova matriz: Jacarandá com 50 documentos', 'draft',
   'Cedro 5 por pessoa (1 usuário); Jacarandá R$ 39,90 com 50/mês e 1 usuário; Angico R$ 99,97 '
   'ilimitado e 4 usuários; Aroeira R$ 149,97 ilimitado e 6; Ipê R$ 199,97 ilimitado e 10; '
   'Mogno personalizado. Vale só para contratações depois de publicada.');
insert into public.plan_version_prices (version_id, plan_id, price_cents) values
  ('matriz_2026_11', 'cedro', 0), ('matriz_2026_11', 'jacaranda', 3990),
  ('matriz_2026_11', 'angico', 9997), ('matriz_2026_11', 'aroeira', 14997),
  ('matriz_2026_11', 'ipe', 19997), ('matriz_2026_11', 'mogno', null);
insert into public.plan_version_entitlements (version_id, plan_id, key, value_int, value_bool)
  select 'matriz_2026_11', plan_id, key,
    case when plan_id = 'jacaranda' and key = 'documents_month' then 50 else value_int end,
    value_bool
  from public.plan_entitlements;

-- Cada assinatura fica ligada à versão em que foi contratada.
alter table public.subscriptions
  add column plan_version_id text references public.plan_versions (id) on delete restrict;
update public.subscriptions set plan_version_id = 'matriz_2026_10' where plan_version_id is null;

create function public.current_plan_version() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select id from public.plan_versions where status = 'published'), 'matriz_2026_10');
$$;

-- Contratar ou trocar de plano (novo contrato) liga à versão publicada naquele momento.
-- Renovação, atraso ou reativação do MESMO plano não mexem na versão (direitos preservados).
create function public.subscriptions_bind_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.plan_version_id := coalesce(new.plan_version_id, public.current_plan_version());
  elsif new.plan_id is distinct from old.plan_id then
    new.plan_version_id := public.current_plan_version();
  end if;
  return new;
end;
$$;
create trigger subscriptions_bind_version before insert or update of plan_id on public.subscriptions
  for each row execute function public.subscriptions_bind_version();

-- Direitos lidos da versão contratada (antes: da tabela de planos, que valia para todos).
create or replace function public.entitlement_exists(org uuid, ent text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.subscriptions s
      join public.plan_version_entitlements e
        on e.version_id = s.plan_version_id and e.plan_id = s.plan_id and e.key = ent
      where s.organization_id = org)
    or exists (select 1 from public.subscriptions s
      join public.plan_entitlements pe on pe.plan_id = s.plan_id and pe.key = ent
      where s.organization_id = org and s.plan_version_id is null);
$$;
create or replace function public.entitlement_int(org uuid, ent text) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select e.value_int from public.subscriptions s
      join public.plan_version_entitlements e
        on e.version_id = s.plan_version_id and e.plan_id = s.plan_id and e.key = ent
      where s.organization_id = org),
    (select pe.value_int from public.subscriptions s
      join public.plan_entitlements pe on pe.plan_id = s.plan_id and pe.key = ent
      where s.organization_id = org and s.plan_version_id is null));
$$;

-- Oferta para novas contratações (tela de planos e cobrança): sempre a versão publicada.
create function public.plan_offer() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'version', v.id,
    'plans', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'sort', p.sort, 'is_public', p.is_public,
        'price_cents', vp.price_cents,
        'entitlements', coalesce((select jsonb_object_agg(e.key,
            coalesce(to_jsonb(e.value_int), to_jsonb(e.value_bool)))
          from public.plan_version_entitlements e where e.version_id = v.id and e.plan_id = p.id), '{}'::jsonb))
      order by p.sort)
      from public.plans p join public.plan_version_prices vp on vp.plan_id = p.id and vp.version_id = v.id),
      '[]'::jsonb))
  from public.plan_versions v where v.id = public.current_plan_version();
$$;
revoke execute on function public.plan_offer() from public, anon;
grant execute on function public.plan_offer() to authenticated, service_role;

-- 2. Franquia gratuita por pessoa ---------------------------------------------------------------
create table public.free_allowances (
  user_id uuid primary key references auth.users (id) on delete cascade,
  limit_total integer not null check (limit_total between 0 and 1000),
  used integer not null default 0 check (used >= 0),
  version_id text references public.plan_versions (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ponto de partida: o que cada pessoa já usou nas organizações Cedro que criou (regra anterior).
insert into public.free_allowances (user_id, limit_total, used, version_id)
select o.created_by, 5, coalesce(sum(u.value), 0), 'matriz_2026_10'
from public.organizations o
join public.subscriptions s on s.organization_id = o.id and s.plan_id = 'cedro'
left join public.usage_counters u on u.organization_id = o.id and u.period = 'total' and u.metric = 'documents'
where o.created_by is not null
group by o.created_by
on conflict (user_id) do nothing;

-- Preparado para o futuro: identidades verificadas (ex.: CPF validado por gov.br ou certificado),
-- guardadas só como hash. Nada liga contas automaticamente nesta etapa.
create table public.person_identities (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('cpf')),
  value_hash text not null check (value_hash ~ '^[0-9a-f]{64}$'),
  method text not null check (method in ('govbr', 'icp_brasil', 'datavalid')),
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (kind, value_hash, user_id)
);

-- A pessoa da franquia de uma organização Cedro: a dona (o Cedro tem 1 usuário).
create function public.free_person(org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select created_by from public.organizations where id = org;
$$;

-- Documentos grátis já usados pela pessoa dona da organização (antes: soma por organização).
create or replace function public.cedro_free_used(org uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select a.used from public.free_allowances a where a.user_id = public.free_person(org)), 0);
$$;

-- 3. Consumo seguro: reserva → confirmação/devolução, idempotente --------------------------------
create table public.document_charges (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9:_.-]{8,200}$'),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  person_id uuid references auth.users (id) on delete set null,
  source text not null check (source in ('free', 'plan')),
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  origin text check (char_length(origin) <= 40),
  status text not null check (status in ('reserved', 'committed', 'released', 'unknown')),
  document_id uuid references public.documents (id) on delete set null,
  engine_document_id uuid,
  error text check (char_length(error) <= 300),
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index document_charges_org_idx on public.document_charges (organization_id, created_at desc);
create index document_charges_open_idx on public.document_charges (status, updated_at)
  where status in ('reserved', 'unknown');

alter table public.plan_versions enable row level security;
alter table public.plan_version_prices enable row level security;
alter table public.plan_version_entitlements enable row level security;
alter table public.free_allowances enable row level security;
alter table public.person_identities enable row level security;
alter table public.document_charges enable row level security;
revoke all on public.plan_versions, public.plan_version_prices, public.plan_version_entitlements,
  public.free_allowances, public.person_identities, public.document_charges from anon, authenticated;

-- Reserva 1 documento. Resultado: {ok, reservation, duplicate, status, document_id, reason, used, limit}.
-- - Mesma chave de novo: devolve a reserva existente (não consome duas vezes).
-- - Trava de linha (FOR UPDATE) na franquia da pessoa ou no contador do mês: duas requisições
--   simultâneas para o último documento → só uma passa.
create function public.reserve_document(org uuid, idem text, origin text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  month text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  sub_status text;
  sub_plan text;
  ex_id uuid;
  ex_org uuid;
  ex_status text;
  ex_doc uuid;
  person uuid;
  a_used integer;
  a_limit integer;
  month_limit integer;
  used_month integer;
  src text;
  rid uuid;
  n integer;
  alert_pct numeric := (select (config->>'percent')::numeric / 100 from public.policies
                         where id = 'usage_alert' and active);
begin
  if idem is null or idem !~ '^[A-Za-z0-9:_.-]{8,200}$' then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  -- Mesma requisição de novo: não consome outra vez.
  select id, organization_id, status, document_id into ex_id, ex_org, ex_status, ex_doc
    from public.document_charges where idempotency_key = idem for update;
  if ex_id is not null and ex_org <> org then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if ex_id is not null and ex_status <> 'released' then
    return jsonb_build_object('ok', true, 'duplicate', true, 'reservation', ex_id,
      'status', ex_status, 'document_id', ex_doc);
  end if;

  select s.status, s.plan_id into sub_status, sub_plan from public.subscriptions s where s.organization_id = org;
  if sub_status in ('suspended', 'canceled') or public.org_closed(org) then
    return jsonb_build_object('ok', false, 'reason', 'subscription_inactive');
  end if;

  if sub_plan = 'cedro' then
    src := 'free';
    person := public.free_person(org);
    if person is null then return jsonb_build_object('ok', false, 'reason', 'plan_limit_reached'); end if;
    -- Controle proporcional contra contas descartáveis: franquia só com e-mail confirmado.
    if not exists (select 1 from auth.users u where u.id = person and u.email_confirmed_at is not null) then
      return jsonb_build_object('ok', false, 'reason', 'email_not_confirmed');
    end if;
    insert into public.free_allowances (user_id, limit_total, version_id)
      values (person, coalesce(public.entitlement_int(org, 'documents_total'), 5), public.current_plan_version())
      on conflict (user_id) do nothing;
    -- Trava a franquia da pessoa: requisições simultâneas (inclusive de outras organizações
    -- dela) esperam esta terminar.
    select used, limit_total into a_used, a_limit from public.free_allowances where user_id = person for update;
    if a_used >= a_limit then
      insert into public.policy_events (organization_id, policy_id, data)
        values (org, 'usage_block', jsonb_build_object('metric', 'documents', 'origin', origin, 'scope', 'person'));
      -- Tentativa de exceder: no máximo 1 registro por pessoa por dia.
      if not exists (select 1 from public.growth_events g where g.user_id = person
           and g.event = 'cedro_limit_exceeded_attempt' and g.created_at > now() - interval '1 day') then
        perform public.growth_mark(org, person, 'cedro_limit_exceeded_attempt',
          jsonb_build_object('used', a_used, 'limit', a_limit), false);
        perform public.growth_mark(org, null, 'paid_feature_attempted',
          jsonb_build_object('feature', 'documents_limit', 'plan', 'cedro'), false);
      end if;
      return jsonb_build_object('ok', false, 'reason', 'plan_limit_reached', 'used', a_used, 'limit', a_limit);
    end if;
    update public.free_allowances set used = used + 1, updated_at = now()
      where user_id = person returning used into n;
  else
    src := 'plan';
    insert into public.usage_counters (organization_id, period, metric) values (org, month, 'documents')
      on conflict do nothing;
    select value into used_month from public.usage_counters
      where organization_id = org and period = month and metric = 'documents' for update;
    month_limit := public.entitlement_int(org, 'documents_month');
    if public.entitlement_exists(org, 'documents_month') and used_month >= month_limit then
      insert into public.policy_events (organization_id, policy_id, data)
        values (org, 'usage_block', jsonb_build_object('metric', 'documents', 'origin', origin));
      perform public.growth_mark(org, null, 'paid_feature_attempted',
        jsonb_build_object('feature', 'documents_limit', 'plan', sub_plan), false);
      return jsonb_build_object('ok', false, 'reason', 'plan_limit_reached',
        'used', used_month, 'limit', month_limit);
    end if;
    n := used_month + 1;
    a_limit := month_limit;
  end if;

  -- Contadores da organização (relatórios e o mês), como antes.
  insert into public.usage_counters (organization_id, period, metric) values (org, 'total', 'documents')
    on conflict do nothing;
  insert into public.usage_counters (organization_id, period, metric) values (org, month, 'documents')
    on conflict do nothing;
  update public.usage_counters set value = value + 1
    where organization_id = org and metric = 'documents' and period in ('total', month);

  if ex_id is not null then
    update public.document_charges set status = 'reserved', person_id = person, source = src,
      period = month, attempts = attempts + 1, error = null, updated_at = now()
      where id = ex_id returning id into rid;
  else
    insert into public.document_charges (idempotency_key, organization_id, person_id, source, period, origin, status)
      values (idem, org, person, src, month, left(origin, 40), 'reserved') returning id into rid;
  end if;

  -- Marcos do funil (uma vez por organização) e alerta de uso do mês.
  if alert_pct is not null and a_limit is not null and n = ceil(a_limit * alert_pct) then
    insert into public.policy_events (organization_id, policy_id, data)
      values (org, 'usage_alert', jsonb_build_object('metric', 'documents', 'period', month, 'scope', src));
  end if;
  if src = 'free' then
    if n = 3 then perform public.growth_mark(org, null, 'cedro_usage_3_of_5', '{}'::jsonb); end if;
    if n = a_limit - 1 then perform public.growth_mark(org, null, 'cedro_usage_4_of_5', '{}'::jsonb); end if;
    if n >= a_limit then perform public.growth_mark(org, null, 'cedro_limit_reached', '{}'::jsonb); end if;
  end if;
  return jsonb_build_object('ok', true, 'duplicate', false, 'reservation', rid, 'status', 'reserved',
    'used', n, 'limit', a_limit);
end;
$$;

-- Reservas presas (a função caiu no meio): depois de 30 min viram "a conferir" (continuam contadas).
create function public.sweep_document_charges() returns integer
language plpgsql security definer set search_path = '' as $$
declare k integer;
begin
  update public.document_charges set status = 'unknown', error = coalesce(error, 'reserva sem conclusão'),
    updated_at = now()
  where status = 'reserved' and updated_at < now() - interval '30 minutes';
  get diagnostics k = row_count;
  return k;
end;
$$;
revoke execute on function public.sweep_document_charges() from public, anon, authenticated;
grant execute on function public.sweep_document_charges() to service_role;

-- Documento criado no motor e gravado no MDSign: consumo definitivo.
create function public.commit_document(reservation uuid, doc uuid, engine uuid) returns void
language sql security definer set search_path = '' as $$
  update public.document_charges set status = 'committed', document_id = doc,
    engine_document_id = coalesce(engine, engine_document_id), error = null, updated_at = now()
  where id = reservation and status in ('reserved', 'unknown');
$$;

-- O motor recusou (com certeza não criou): devolve o documento à franquia/mês da reserva.
create function public.release_document(reservation uuid, reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  select * into c from public.document_charges where id = reservation for update;
  if not found or c.status not in ('reserved', 'unknown') then return; end if;
  update public.document_charges set status = 'released', error = left(reason, 300), updated_at = now()
    where id = reservation;
  update public.usage_counters set value = greatest(value - 1, 0)
    where organization_id = c.organization_id and metric = 'documents' and period in ('total', c.period);
  if c.source = 'free' and c.person_id is not null then
    update public.free_allowances set used = greatest(used - 1, 0), updated_at = now()
      where user_id = c.person_id;
  end if;
end;
$$;

-- Resultado desconhecido (tempo esgotado, falha depois de criar no motor): continua contado e
-- fica marcado para conferência (Super Admin → Cobrança). Nunca some sozinho.
create function public.mark_document_unknown(reservation uuid, reason text, engine uuid default null)
returns void
language sql security definer set search_path = '' as $$
  update public.document_charges set status = 'unknown', error = left(reason, 300),
    engine_document_id = coalesce(engine, engine_document_id), updated_at = now()
  where id = reservation and status = 'reserved';
$$;

revoke execute on function public.reserve_document(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.commit_document(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.release_document(uuid, text) from public, anon, authenticated;
revoke execute on function public.mark_document_unknown(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_document(uuid, text, text), public.commit_document(uuid, uuid, uuid),
  public.release_document(uuid, text), public.mark_document_unknown(uuid, text, uuid) to service_role;
revoke execute on function public.free_person(uuid) from public, anon, authenticated;
revoke execute on function public.current_plan_version() from public, anon, authenticated;
revoke execute on function public.subscriptions_bind_version() from public, anon, authenticated;

-- Compatibilidade: a regra antiga passa a usar a mesma reserva (consome na hora).
create or replace function public.consume_document(org uuid, origin text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  r := public.reserve_document(org, 'legacy:' || gen_random_uuid()::text, origin);
  if coalesce((r ->> 'ok')::boolean, false) then
    perform public.commit_document((r ->> 'reservation')::uuid, null, null);
    return true;
  end if;
  return false;
end;
$$;

-- Compatibilidade: devolver "o último documento da organização" = liberar a última reserva dela.
create or replace function public.refund_document(org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  select id into cid from public.document_charges
    where organization_id = org and status in ('reserved', 'committed', 'unknown')
    order by created_at desc limit 1;
  if cid is not null then
    update public.document_charges set status = 'reserved' where id = cid and status = 'committed';
    perform public.release_document(cid, 'devolução');
  else
    update public.usage_counters set value = greatest(value - 1, 0)
    where organization_id = org and metric = 'documents'
      and period in ('total', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM'));
  end if;
end;
$$;

-- Tela: Cedro mostra a franquia da PESSOA; demais planos como antes.
create or replace function public.org_usage(org uuid)
returns table (plan_id text, plan_name text, status text, billing_status text,
  documents_total_limit integer, documents_total_used integer, documents_month_limit integer,
  documents_month_used integer, users_max integer, users_used integer,
  has_total_limit boolean, has_month_limit boolean)
language sql stable security definer set search_path = '' as $$
  select s.plan_id, p.name, s.status, s.billing_status,
    case when s.plan_id = 'cedro'
      then coalesce((select a.limit_total from public.free_allowances a where a.user_id = public.free_person(org)),
                    public.entitlement_int(org, 'documents_total'))
      else public.entitlement_int(org, 'documents_total') end,
    case when s.plan_id = 'cedro' then public.cedro_free_used(org)
      else coalesce((select value from public.usage_counters where organization_id = org
        and period = 'total' and metric = 'documents'), 0) end,
    public.entitlement_int(org, 'documents_month'),
    coalesce((select value from public.usage_counters where organization_id = org
      and period = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM') and metric = 'documents'), 0),
    public.entitlement_int(org, 'users_max'),
    (select count(*)::integer from public.memberships where organization_id = org and status = 'active'),
    public.entitlement_exists(org, 'documents_total'),
    public.entitlement_exists(org, 'documents_month')
  from public.subscriptions s join public.plans p on p.id = s.plan_id
  where s.organization_id = org
    and (public.is_org_member(org) or public.is_platform_admin() or auth.role() = 'service_role');
$$;

-- 4. Eventos do app: oferta vista (no máximo 1 por organização por dia) ------------------------
create or replace function public.growth_app_event(org uuid, ev text, payload jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if ev not in ('upgrade_cta_clicked', 'paid_feature_attempted', 'upgrade_offer_viewed')
     or not public.is_org_member(org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(payload, '{}'::jsonb)) <> 'object' or pg_column_size(payload) > 1000 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if ev = 'upgrade_offer_viewed' and exists (select 1 from public.growth_events g
       where g.organization_id = org and g.event = ev and g.created_at > now() - interval '1 day') then
    return;
  end if;
  perform public.growth_mark(org, auth.uid(), ev, coalesce(payload, '{}'::jsonb), false);
end;
$$;

-- 5. Super Admin: versões da matriz, publicação e consumos a conferir ---------------------------
create function public.admin_plan_versions() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id, 'name', v.name, 'status', v.status, 'notes', v.notes,
      'published_at', v.published_at,
      'subscriptions', (select count(*) from public.subscriptions s where s.plan_version_id = v.id),
      'plans', (select jsonb_agg(jsonb_build_object('plan_id', vp.plan_id, 'price_cents', vp.price_cents,
          'entitlements', coalesce((select jsonb_object_agg(e.key, coalesce(to_jsonb(e.value_int), to_jsonb(e.value_bool)))
            from public.plan_version_entitlements e where e.version_id = v.id and e.plan_id = vp.plan_id), '{}'::jsonb))
          order by p.sort)
        from public.plan_version_prices vp join public.plans p on p.id = vp.plan_id where vp.version_id = v.id))
      order by v.created_at), '[]'::jsonb) into out
  from public.plan_versions v;
  return out;
end;
$$;

-- Publicar: a nova versão passa a valer para NOVAS contratações; a anterior é aposentada, mas
-- continua valendo para quem a contratou.
create function public.admin_publish_plan_version(vid text) returns void
language plpgsql security definer set search_path = '' as $$
declare previous text;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.plan_versions where id = vid and status = 'draft') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  select id into previous from public.plan_versions where status = 'published';
  update public.plan_versions set status = 'retired' where status = 'published';
  update public.plan_versions set status = 'published', published_at = now(), published_by = auth.uid()
    where id = vid;
  perform public.write_audit(null, 'plan_version.published', 'plan_version', vid,
    jsonb_build_object('previous', previous));
end;
$$;

create function public.admin_document_charges(st text default 'unknown') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'organization', o.name, 'origin', c.origin,
      'source', c.source, 'status', c.status, 'error', c.error, 'engine_document_id', c.engine_document_id,
      'document_id', c.document_id, 'created_at', c.created_at, 'updated_at', c.updated_at)
      order by c.updated_at desc), '[]'::jsonb) into out
  from (select * from public.document_charges where status = st order by updated_at desc limit 200) c
  join public.organizations o on o.id = c.organization_id;
  return out;
end;
$$;

-- Conferência manual: o documento existe no motor (mantém o consumo) ou não existe (devolve).
create function public.admin_resolve_charge(cid uuid, created boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.document_charges where id = cid and status = 'unknown') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if created then
    update public.document_charges set status = 'committed', updated_at = now() where id = cid;
  else
    perform public.release_document(cid, 'conferido: não criado no motor');
  end if;
  perform public.write_audit(null, 'document_charge.resolved', 'document_charge', cid::text,
    jsonb_build_object('created', created));
end;
$$;

do $$
declare fn regprocedure;
begin
  for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('admin_plan_versions', 'admin_publish_plan_version',
      'admin_document_charges', 'admin_resolve_charge')
  loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

-- Alerta da plataforma: consumo com resultado desconhecido aguardando conferência.
alter table public.platform_alerts drop constraint if exists platform_alerts_kind_check;
alter table public.platform_alerts add constraint platform_alerts_kind_check check (kind in (
  'cron_failed', 'engine_errors', 'notifications_stuck', 'engine_events_failed',
  'data_requests_overdue', 'bulk_stuck', 'document_charges_unknown'));

create or replace function public.refresh_platform_alerts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg jsonb := coalesce((select config from public.policies where id = 'platform_alerts' and active), '{}');
  max_errors integer := coalesce((cfg->>'engine_errors_per_hour')::int, 5);
  stuck_min integer := coalesce((cfg->>'queue_stuck_minutes')::int, 30);
  checks jsonb;
  k text;
  v jsonb;
  opened integer := 0;
begin
  checks := jsonb_build_object(
    'cron_failed', (select count(*) from cron.job_run_details r join cron.job j on j.jobid = r.jobid
      where j.jobname like 'mdsign-%' and r.status = 'failed' and r.start_time > now() - interval '1 hour'),
    'engine_errors', (select case when count(*) >= max_errors then count(*) else 0 end
      from public.engine_errors where created_at > now() - interval '1 hour'),
    'notifications_stuck', (select count(*) from public.notifications
      where status = 'pending' and scheduled_at < now() - make_interval(mins => stuck_min)),
    'engine_events_failed', (select count(*) from public.engine_webhook_events
      where processed_at is null and attempts >= 5),
    'data_requests_overdue', (select count(*) from public.data_requests
      where status not in ('answered', 'rejected') and due_at < now()),
    'bulk_stuck', (select count(*) from public.bulk_jobs
      where status = 'sending' and updated_at < now() - interval '1 hour'),
    'document_charges_unknown', (select count(*) from public.document_charges
      where status = 'unknown')
  );
  for k, v in select * from jsonb_each(checks) loop
    if (v #>> '{}')::int > 0 then
      insert into public.platform_alerts (kind, detail) values (k, jsonb_build_object('count', v))
      on conflict (kind) where resolved_at is null
        do update set last_seen = now(), detail = excluded.detail;
      opened := opened + 1;
    else
      update public.platform_alerts set resolved_at = now() where kind = k and resolved_at is null;
    end if;
  end loop;
  return opened;
end;
$function$;
