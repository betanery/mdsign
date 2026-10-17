-- MDSign — Super Admin → Growth & Aquisição (campanhas, links rastreáveis, leads, funil,
-- oportunidades e configurações). Reaproveita user_acquisition, growth_events, org_qualification,
-- user_consents, leads, subscriptions, billing_checkouts e a política growth_stages.
--
-- Regras:
-- - Só acréscimos: nada é apagado; campanhas não têm exclusão (encerrar mantém o histórico) e o
--   identificador (slug = utm_campaign) não muda depois de criado.
-- - Tabelas novas sem acesso direto do navegador: tudo passa por funções que exigem Super Admin
--   com MFA (is_platform_admin exige aal2) e grava auditoria nas alterações.
-- - Sem números inventados: indicadores saem de eventos e tabelas reais; o que não dá para medir
--   volta como null ("Não disponível").
-- - Nada aqui mexe em preço, franquia, consumo, cobrança, SignDoc ou permissões dos clientes.

-- 1. Campanhas ---------------------------------------------------------------------------------
create table public.growth_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]{1,78}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 160),
  description text check (char_length(description) <= 1000),
  channel text check (channel ~ '^[a-z0-9][a-z0-9_.-]{0,59}$'),
  medium text check (medium ~ '^[a-z0-9][a-z0-9_.-]{0,59}$'),
  landing_path text check (landing_path ~ '^/[a-z0-9/_-]{0,199}$'),
  starts_on date,
  ends_on date,
  owner_name text check (char_length(owner_name) <= 120),
  objective text check (char_length(objective) <= 300),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),
  budget_cents bigint check (budget_cents between 0 and 100000000000),
  notes text check (char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

-- O identificador vai nas URLs e nos cadastros: não muda depois de criado.
create function public.growth_campaign_slug_locked() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'campaign_slug_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger growth_campaigns_slug_locked before update on public.growth_campaigns
  for each row execute function public.growth_campaign_slug_locked();

-- 2. Links rastreáveis ------------------------------------------------------------------------
create table public.growth_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.growth_campaigns (id) on delete restrict,
  label text check (char_length(label) <= 120),
  landing_path text not null check (landing_path ~ '^/[a-z0-9/_-]{0,199}$'),
  utm_source text not null check (utm_source ~ '^[a-z0-9][a-z0-9_.-]{0,99}$'),
  utm_medium text not null check (utm_medium ~ '^[a-z0-9][a-z0-9_.-]{0,99}$'),
  utm_campaign text not null check (utm_campaign ~ '^[a-z0-9][a-z0-9_.-]{0,99}$'),
  utm_content text check (utm_content ~ '^[a-z0-9][a-z0-9_.-]{0,99}$'),
  utm_term text check (utm_term ~ '^[a-z0-9][a-z0-9_.-]{0,99}$'),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index growth_links_campaign_idx on public.growth_links (campaign_id, created_at desc);

-- 3. Acompanhamento comercial: responsável e anotações (por organização) ---------------------
create table public.growth_owners (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create table public.growth_notes (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index growth_notes_org_idx on public.growth_notes (organization_id, created_at desc);

alter table public.growth_campaigns enable row level security;
alter table public.growth_links enable row level security;
alter table public.growth_owners enable row level security;
alter table public.growth_notes enable row level security;
revoke all on public.growth_campaigns, public.growth_links, public.growth_owners,
  public.growth_notes from anon, authenticated;

-- 4. Última origem (last-touch) e sessão do cadastro, sem sobrescrever a primeira ----------------
alter table public.user_acquisition
  add column last_utm_source text check (char_length(last_utm_source) <= 120),
  add column last_utm_medium text check (char_length(last_utm_medium) <= 120),
  add column last_utm_campaign text check (char_length(last_utm_campaign) <= 160),
  add column last_utm_content text check (char_length(last_utm_content) <= 160),
  add column last_utm_term text check (char_length(last_utm_term) <= 160),
  add column last_landing_page text check (char_length(last_landing_page) <= 300),
  add column last_referrer text check (char_length(last_referrer) <= 300),
  add column last_seen_at timestamptz,
  add column session_id text check (session_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  add column internal boolean not null default false;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  acq jsonb := case when jsonb_typeof(meta -> 'acq') = 'object' then meta -> 'acq' else '{}'::jsonb end;
  lst jsonb := case when jsonb_typeof(acq -> 'last') = 'object' then acq -> 'last' else '{}'::jsonb end;
  t text;
begin
  insert into public.profiles (id, full_name, locale)
  values (
    new.id,
    nullif(left(meta ->> 'full_name', 160), ''),
    case when meta ->> 'locale' in ('pt', 'en', 'es') then meta ->> 'locale' else 'pt' end
  );

  if acq <> '{}'::jsonb then
    insert into public.user_acquisition (user_id, utm_source, utm_medium, utm_campaign,
      utm_content, utm_term, landing_page, referrer, campaign, first_seen_at,
      last_utm_source, last_utm_medium, last_utm_campaign, last_utm_content, last_utm_term,
      last_landing_page, last_referrer, last_seen_at, session_id, internal)
    values (new.id,
      nullif(left(acq ->> 'utm_source', 120), ''), nullif(left(acq ->> 'utm_medium', 120), ''),
      nullif(left(acq ->> 'utm_campaign', 160), ''), nullif(left(acq ->> 'utm_content', 160), ''),
      nullif(left(acq ->> 'utm_term', 160), ''), nullif(left(acq ->> 'landing_page', 300), ''),
      nullif(left(acq ->> 'referrer', 300), ''), nullif(left(acq ->> 'campaign', 120), ''),
      case when (acq ->> 'first_seen_at') ~ '^\d{4}-\d{2}-\d{2}T'
        then (acq ->> 'first_seen_at')::timestamptz end,
      nullif(left(lst ->> 'utm_source', 120), ''), nullif(left(lst ->> 'utm_medium', 120), ''),
      nullif(left(lst ->> 'utm_campaign', 160), ''), nullif(left(lst ->> 'utm_content', 160), ''),
      nullif(left(lst ->> 'utm_term', 160), ''), nullif(left(lst ->> 'landing_page', 300), ''),
      nullif(left(lst ->> 'referrer', 300), ''),
      case when (lst ->> 'seen_at') ~ '^\d{4}-\d{2}-\d{2}T' then (lst ->> 'seen_at')::timestamptz end,
      case when (acq ->> 'session_id') ~ '^[A-Za-z0-9_-]{8,64}$' then acq ->> 'session_id' end,
      coalesce(acq ->> 'internal', '') = '1');
  end if;

  if meta ? 'terms_version' then
    t := left(meta ->> 'terms_version', 40);
    insert into public.user_consents (user_id, kind, granted, version, source)
      values (new.id, 'terms', true, t, 'signup');
    insert into public.user_consents (user_id, kind, granted, version, source)
      values (new.id, 'marketing', coalesce((meta ->> 'marketing_opt_in')::boolean, false), t, 'signup');
  end if;

  perform public.growth_mark(null, new.id, 'signup_completed',
    jsonb_build_object('campaign', nullif(coalesce(acq ->> 'utm_campaign', acq ->> 'campaign'), ''),
                       'source', nullif(acq ->> 'utm_source', '')));
  return new;
end;
$$;

-- 5. Configurações (canais, meios, nomes, atribuição, metas, tráfego interno) -----------------
insert into public.policies (id, description, config) values
  ('growth_settings', 'Growth & Aquisição: canais, meios, atribuição, metas e tráfego interno',
   '{"channels": ["google", "instagram", "facebook", "linkedin", "youtube", "tiktok", "whatsapp", "email", "parceiro", "indicacao"],
     "mediums": ["cpc", "paid_social", "social", "email", "referral", "display", "affiliate", "whatsapp", "organic"],
     "naming_hint": "minúsculas, sem acento, palavras separadas por _ (ex.: lancamento_mdsign_outubro)",
     "attribution_days": 30,
     "goals": {"visit_to_signup": 5, "signup_to_activation": 40, "activation_to_paid": 10},
     "internal_email_domains": ["mundodigitaltech.com.br"],
     "exclude_org_ids": []}')
on conflict (id) do nothing;

-- Configuração com valores padrão para chaves que faltarem.
create function public.growth_cfg() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
      'channels', '[]'::jsonb, 'mediums', '[]'::jsonb, 'naming_hint', '',
      'attribution_days', 30, 'goals', '{}'::jsonb,
      'internal_email_domains', '[]'::jsonb, 'exclude_org_ids', '[]'::jsonb)
    || coalesce((select config from public.policies where id = 'growth_settings'), '{}'::jsonb);
$$;

-- Tráfego interno/homologação: Super Admins, domínios de e-mail da equipe, organizações excluídas
-- nas configurações e cadastros feitos de ambiente de teste.
create function public.growth_internal_user(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select uid is not null and (
    exists (select 1 from public.platform_admins p where p.user_id = uid)
    or exists (select 1 from public.user_acquisition a where a.user_id = uid and a.internal)
    or exists (select 1 from auth.users u where u.id = uid
      and lower(split_part(u.email, '@', 2)) in
        (select lower(jsonb_array_elements_text(public.growth_cfg() -> 'internal_email_domains'))))
    or exists (select 1 from public.organizations o where o.created_by = uid
      and o.id::text in (select jsonb_array_elements_text(public.growth_cfg() -> 'exclude_org_ids'))));
$$;

-- Origem legível: UTM; senão o domínio de referência; senão "não identificada" (acesso direto não
-- é presumido orgânico).
create function public.growth_origin(src text, ref text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(src, ''),
    case when nullif(ref, '') is not null
      then 'ref:' || split_part(regexp_replace(ref, '^https?://', ''), '/', 1) end,
    'nao_identificada');
$$;

-- Base comercial por pessoa: origem (primeira e última), organização principal, plano, estágio.
create function public.growth_people(include_internal boolean default false)
returns table (
  user_id uuid, created_at timestamptz, internal boolean,
  first_source text, first_medium text, first_campaign text, first_landing text,
  last_source text, last_medium text, last_campaign text, last_landing text,
  first_seen_at timestamptz, last_seen_at timestamptz,
  org_id uuid, plan_id text, stage text, docs_used integer
)
language sql stable security definer set search_path = '' as $$
  with base as (
    select u.id, u.created_at, public.growth_internal_user(u.id) as internal,
      a.utm_source, a.utm_medium, a.utm_campaign, a.campaign, a.landing_page, a.referrer,
      a.last_utm_source, a.last_utm_medium, a.last_utm_campaign, a.last_landing_page,
      a.last_referrer, a.first_seen_at, a.last_seen_at,
      coalesce(a.last_seen_at, a.first_seen_at) < u.created_at
        - make_interval(days => coalesce((public.growth_cfg() ->> 'attribution_days')::int, 30)) as stale
    from auth.users u left join public.user_acquisition a on a.user_id = u.id
  ),
  org as (
    select distinct on (o.created_by) o.created_by, o.id
    from public.organizations o where o.created_by is not null
    order by o.created_by, o.created_at
  )
  -- Última origem só vale dentro da janela de atribuição antes do cadastro; sem última origem
  -- registrada, a primeira faz as vezes (mesma visita).
  select b.id, b.created_at, b.internal,
    public.growth_origin(b.utm_source, b.referrer), b.utm_medium, coalesce(b.utm_campaign, b.campaign),
    b.landing_page,
    case when b.stale then 'nao_identificada'
      else public.growth_origin(coalesce(b.last_utm_source, b.utm_source), coalesce(b.last_referrer, b.referrer)) end,
    case when b.stale then null else coalesce(b.last_utm_medium, b.utm_medium) end,
    case when b.stale then null else coalesce(b.last_utm_campaign, b.utm_campaign, b.campaign) end,
    case when b.stale then null else coalesce(b.last_landing_page, b.landing_page) end,
    b.first_seen_at, b.last_seen_at,
    org.id, s.plan_id,
    case when org.id is null then 'no_org' else public.org_growth_stage(org.id) end,
    coalesce((select uc.value from public.usage_counters uc where uc.organization_id = org.id
      and uc.period = 'total' and uc.metric = 'documents'), 0)
  from base b
  left join org on org.created_by = b.id
  left join public.subscriptions s on s.organization_id = org.id
  where include_internal or not b.internal;
$$;

revoke execute on function public.growth_cfg() from public, anon, authenticated;
revoke execute on function public.growth_internal_user(uuid) from public, anon, authenticated;
revoke execute on function public.growth_people(boolean) from public, anon, authenticated;

-- 6. Funções do Super Admin ---------------------------------------------------------------------
create function public.growth_require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.growth_require_admin() from public, anon, authenticated;

-- Período e filtros comuns (vêm do navegador: validados aqui).
create function public.growth_filters(f jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  d_from timestamptz;
  d_to timestamptz;
begin
  begin
    d_from := coalesce((f ->> 'from')::timestamptz, now() - interval '30 days');
    d_to := coalesce((f ->> 'to')::timestamptz, now());
  exception when others then
    raise exception 'invalid_request' using errcode = 'P0001';
  end;
  if d_to <= d_from or d_to - d_from > interval '400 days' then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'from', d_from, 'to', d_to,
    'source', nullif(left(f ->> 'source', 160), ''),
    'campaign', nullif(left(f ->> 'campaign', 160), ''),
    'landing', nullif(left(f ->> 'landing', 300), ''),
    'plan', nullif(left(f ->> 'plan', 40), ''),
    'stage', nullif(left(f ->> 'stage', 40), ''),
    'model', case when f ->> 'model' = 'last' then 'last' else 'first' end,
    'internal', coalesce((f ->> 'internal')::boolean, false));
end;
$$;

create function public.admin_growth_settings() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.growth_require_admin();
  return jsonb_build_object(
    'settings', public.growth_cfg(),
    'stages', coalesce((select config from public.policies where id = 'growth_stages'), '{}'::jsonb));
end;
$$;

create function public.admin_growth_save_settings(cfg jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  previous jsonb := public.growth_cfg();
  clean jsonb;
  v text;
begin
  perform public.growth_require_admin();
  if jsonb_typeof(cfg) <> 'object' then raise exception 'invalid_request' using errcode = 'P0001'; end if;
  -- Listas de identificadores: minúsculas, sem espaço, até 40 itens.
  foreach v in array array['channels', 'mediums'] loop
    if jsonb_typeof(cfg -> v) <> 'array' or jsonb_array_length(cfg -> v) > 40
       or exists (select 1 from jsonb_array_elements(cfg -> v) e
                  where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[a-z0-9][a-z0-9_.-]{0,59}$') then
      raise exception 'invalid_settings' using errcode = 'P0001';
    end if;
  end loop;
  if jsonb_typeof(cfg -> 'internal_email_domains') <> 'array'
     or jsonb_array_length(cfg -> 'internal_email_domains') > 20
     or exists (select 1 from jsonb_array_elements(cfg -> 'internal_email_domains') e
                where (e #>> '{}') !~ '^[a-z0-9.-]+\.[a-z]{2,}$') then
    raise exception 'invalid_settings' using errcode = 'P0001';
  end if;
  if jsonb_typeof(cfg -> 'exclude_org_ids') <> 'array'
     or jsonb_array_length(cfg -> 'exclude_org_ids') > 200
     or exists (select 1 from jsonb_array_elements(cfg -> 'exclude_org_ids') e
                where (e #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'invalid_settings' using errcode = 'P0001';
  end if;
  if jsonb_typeof(cfg -> 'attribution_days') <> 'number'
     or (cfg ->> 'attribution_days')::numeric not between 1 and 30 then
    raise exception 'invalid_settings' using errcode = 'P0001';
  end if;
  if jsonb_typeof(cfg -> 'goals') <> 'object' or exists (
       select 1 from jsonb_each(cfg -> 'goals') g
       where g.key not in ('visit_to_signup', 'signup_to_activation', 'activation_to_paid')
          or jsonb_typeof(g.value) <> 'number' or (g.value #>> '{}')::numeric not between 0 and 100) then
    raise exception 'invalid_settings' using errcode = 'P0001';
  end if;
  clean := jsonb_build_object(
    'channels', cfg -> 'channels', 'mediums', cfg -> 'mediums',
    'naming_hint', left(coalesce(cfg ->> 'naming_hint', ''), 300),
    'attribution_days', (cfg ->> 'attribution_days')::int,
    'goals', cfg -> 'goals',
    'internal_email_domains', cfg -> 'internal_email_domains',
    'exclude_org_ids', cfg -> 'exclude_org_ids');
  update public.policies set config = clean where id = 'growth_settings';
  perform public.write_audit(null, 'growth.settings.changed', 'policy', 'growth_settings',
    jsonb_build_object('from', previous, 'to', clean));
end;
$$;

-- Campanhas -------------------------------------------------------------------------------------
create function public.admin_growth_campaigns(q text default null, st text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  perform public.growth_require_admin();
  with people as (select * from public.growth_people(false))
  select coalesce(jsonb_agg(r order by r.updated_at desc), '[]'::jsonb) into out from (
    select c.*,
      (select count(*) from public.growth_links l where l.campaign_id = c.id) as links,
      (select count(distinct g.session_id) from public.growth_events g
        where g.event = 'acquisition_page_viewed' and g.data ->> 'utm_campaign' = c.slug
          and coalesce(g.data ->> 'internal', '') <> '1') as visits,
      (select count(*) from people p where p.first_campaign = c.slug) as signups_first,
      (select count(*) from people p where p.last_campaign = c.slug) as signups_last,
      (select count(*) from people p where p.last_campaign = c.slug and p.stage = 'paid') as paid_last,
      (select coalesce(u.full_name, '') from public.profiles u where u.id = c.created_by) as created_by_name
    from public.growth_campaigns c
    where (q is null or c.name ilike '%' || left(q, 80) || '%' or c.slug ilike '%' || left(q, 80) || '%')
      and (st is null or c.status = st)
    limit 500) r;
  return out;
end;
$$;

create function public.admin_growth_campaign_save(c jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
  before jsonb;
begin
  perform public.growth_require_admin();
  if jsonb_typeof(c) <> 'object' then raise exception 'invalid_request' using errcode = 'P0001'; end if;
  cid := nullif(c ->> 'id', '')::uuid;
  if c ->> 'status' is not null and c ->> 'status' not in ('draft', 'active', 'paused', 'ended') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if cid is null then
    insert into public.growth_campaigns (slug, name, description, channel, medium, landing_path,
      starts_on, ends_on, owner_name, objective, status, budget_cents, notes, created_by, updated_by)
    values (lower(c ->> 'slug'), c ->> 'name', nullif(c ->> 'description', ''),
      nullif(c ->> 'channel', ''), nullif(c ->> 'medium', ''), nullif(c ->> 'landing_path', ''),
      nullif(c ->> 'starts_on', '')::date, nullif(c ->> 'ends_on', '')::date,
      nullif(c ->> 'owner_name', ''), nullif(c ->> 'objective', ''),
      coalesce(c ->> 'status', 'draft'), nullif(c ->> 'budget_cents', '')::bigint,
      nullif(c ->> 'notes', ''), auth.uid(), auth.uid())
    returning id into cid;
    perform public.write_audit(null, 'growth.campaign.created', 'growth_campaign', cid::text,
      c - 'id');
  else
    select to_jsonb(g) into before from public.growth_campaigns g where g.id = cid;
    if before is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    update public.growth_campaigns set
      name = c ->> 'name', description = nullif(c ->> 'description', ''),
      channel = nullif(c ->> 'channel', ''), medium = nullif(c ->> 'medium', ''),
      landing_path = nullif(c ->> 'landing_path', ''),
      starts_on = nullif(c ->> 'starts_on', '')::date, ends_on = nullif(c ->> 'ends_on', '')::date,
      owner_name = nullif(c ->> 'owner_name', ''), objective = nullif(c ->> 'objective', ''),
      status = coalesce(c ->> 'status', status), budget_cents = nullif(c ->> 'budget_cents', '')::bigint,
      notes = nullif(c ->> 'notes', ''), updated_by = auth.uid(), updated_at = now()
    where id = cid;
    perform public.write_audit(null, 'growth.campaign.updated', 'growth_campaign', cid::text,
      jsonb_build_object('from', before - 'created_at' - 'updated_at', 'to', c - 'id'));
  end if;
  return cid;
exception
  when unique_violation then raise exception 'campaign_slug_taken' using errcode = 'P0001';
  when check_violation or invalid_text_representation or invalid_datetime_format
    or datetime_field_overflow or numeric_value_out_of_range or not_null_violation then
    raise exception 'invalid_request' using errcode = 'P0001';
end;
$$;

create function public.admin_growth_campaign_status(cid uuid, st text) returns void
language plpgsql security definer set search_path = '' as $$
declare previous text;
begin
  perform public.growth_require_admin();
  if st not in ('draft', 'active', 'paused', 'ended') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  select status into previous from public.growth_campaigns where id = cid;
  if previous is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.growth_campaigns set status = st, updated_by = auth.uid(), updated_at = now()
    where id = cid;
  perform public.write_audit(null, 'growth.campaign.status', 'growth_campaign', cid::text,
    jsonb_build_object('from', previous, 'to', st));
end;
$$;

-- Links -----------------------------------------------------------------------------------------
create function public.admin_growth_links(cid uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  perform public.growth_require_admin();
  select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb) into out from (
    select l.*, c.name as campaign_name, c.slug as campaign_slug,
      (select count(distinct g.session_id) from public.growth_events g
        where g.event = 'acquisition_page_viewed'
          and g.data ->> 'utm_campaign' = l.utm_campaign
          and g.data ->> 'utm_source' = l.utm_source
          and coalesce(g.data ->> 'utm_medium', '') = l.utm_medium
          and coalesce(g.data ->> 'utm_content', '') = coalesce(l.utm_content, '')
          and coalesce(g.data ->> 'internal', '') <> '1') as visits
    from public.growth_links l join public.growth_campaigns c on c.id = l.campaign_id
    where cid is null or l.campaign_id = cid
    limit 1000) r;
  return out;
end;
$$;

create function public.admin_growth_link_save(l jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare lid uuid;
begin
  perform public.growth_require_admin();
  insert into public.growth_links (campaign_id, label, landing_path, utm_source, utm_medium,
    utm_campaign, utm_content, utm_term, created_by)
  values ((l ->> 'campaign_id')::uuid, nullif(left(l ->> 'label', 120), ''), l ->> 'landing_path',
    lower(l ->> 'utm_source'), lower(l ->> 'utm_medium'), lower(l ->> 'utm_campaign'),
    nullif(lower(l ->> 'utm_content'), ''), nullif(lower(l ->> 'utm_term'), ''), auth.uid())
  returning id into lid;
  perform public.write_audit(null, 'growth.link.created', 'growth_link', lid::text, l);
  return lid;
exception
  when foreign_key_violation then raise exception 'not_found' using errcode = 'P0002';
  when check_violation or not_null_violation or invalid_text_representation then
    raise exception 'invalid_request' using errcode = 'P0001';
end;
$$;

create function public.admin_growth_link_active(lid uuid, on_off boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.growth_require_admin();
  update public.growth_links set active = on_off where id = lid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.write_audit(null, 'growth.link.active', 'growth_link', lid::text,
    jsonb_build_object('active', on_off));
end;
$$;

-- Visão geral -----------------------------------------------------------------------------------
create function public.admin_growth_overview(f jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p jsonb := public.growth_filters(f);
  d_from timestamptz := (p ->> 'from')::timestamptz;
  d_to timestamptz := (p ->> 'to')::timestamptz;
  inc boolean := (p ->> 'internal')::boolean;
  last_model boolean := p ->> 'model' = 'last';
  out jsonb;
begin
  perform public.growth_require_admin();
  with
  web as (
    select g.*, coalesce(g.data ->> 'utm_campaign', g.data ->> 'campaign') as camp,
      public.growth_origin(g.data ->> 'utm_source', null) as src
    from public.growth_events g
    where g.created_at >= d_from and g.created_at < d_to
      and g.event in ('acquisition_page_viewed', 'acquisition_cta_clicked', 'signup_started')
      and (inc or coalesce(g.data ->> 'internal', '') <> '1')
      and (p ->> 'source' is null or g.data ->> 'utm_source' = p ->> 'source')
      and (p ->> 'campaign' is null or coalesce(g.data ->> 'utm_campaign', g.data ->> 'campaign') = p ->> 'campaign')
      and (p ->> 'landing' is null or g.data ->> 'page' = p ->> 'landing')
  ),
  ppl as (
    select x.*,
      case when last_model then x.last_source else x.first_source end as src,
      case when last_model then x.last_campaign else x.first_campaign end as camp,
      case when last_model then x.last_landing else x.first_landing end as landing
    from public.growth_people(inc) x
  ),
  people as (
    select * from ppl
    where (p ->> 'source' is null or ppl.src = p ->> 'source')
      and (p ->> 'campaign' is null or ppl.camp = p ->> 'campaign')
      and (p ->> 'landing' is null or ppl.landing = p ->> 'landing')
      and (p ->> 'plan' is null or ppl.plan_id = p ->> 'plan')
      and (p ->> 'stage' is null or ppl.stage = p ->> 'stage')
  ),
  signups as (select * from people where people.created_at >= d_from and people.created_at < d_to),
  ev as (
    select g.event, g.organization_id, g.user_id, g.created_at, g.data from public.growth_events g
    where g.created_at >= d_from and g.created_at < d_to
      and g.event in ('first_document_created', 'first_document_completed', 'second_document_completed',
        'cedro_usage_4_of_5', 'cedro_limit_reached', 'upgrade_cta_clicked', 'checkout_started',
        'paid_feature_attempted', 'paid_plan_activated')
      and exists (select 1 from people pp where pp.org_id = g.organization_id)
  ),
  days as (select generate_series(date_trunc('day', d_from), date_trunc('day', d_to - interval '1 second'), interval '1 day')::date as d)
  select jsonb_build_object(
    'period', jsonb_build_object('from', d_from, 'to', d_to, 'model', p ->> 'model', 'internal', inc),
    'kpis', jsonb_build_object(
      'visits', (select count(distinct session_id) from web where event = 'acquisition_page_viewed'),
      'page_views', (select count(*) from web where event = 'acquisition_page_viewed'),
      'cta_clicks', (select count(*) from web where event = 'acquisition_cta_clicked'),
      'signup_started', (select count(distinct session_id) from web where event = 'signup_started'),
      'signups', (select count(*) from signups),
      'orgs_created', (select count(*) from signups where org_id is not null),
      'first_document', (select count(distinct organization_id) from ev where event = 'first_document_created'),
      'three_documents', (select count(*) from people where docs_used >= 3),
      'cedro_4_of_5', (select count(distinct organization_id) from ev where event = 'cedro_usage_4_of_5'),
      'cedro_limit', (select count(distinct organization_id) from ev where event = 'cedro_limit_reached'),
      'upgrade_clicks', (select count(*) from ev where event in ('upgrade_cta_clicked', 'checkout_started')),
      'paid', (select count(distinct organization_id) from ev where event = 'paid_plan_activated'),
      'paid_environment', (select string_agg(distinct coalesce(data ->> 'environment', 'sandbox'), ',')
        from ev where event = 'paid_plan_activated'),
      'mrr_cents', (select sum(s.value_cents) from public.subscriptions s
        join people pp on pp.org_id = s.organization_id
        where s.plan_id <> 'cedro' and s.billing_status = 'paid' and pp.src <> 'nao_identificada'),
      'mrr_environment', (select string_agg(distinct c.environment, ',') from public.billing_checkouts c
        join people pp on pp.org_id = c.organization_id where c.status = 'paid')),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', days.d,
        'visits', (select count(distinct session_id) from web where event = 'acquisition_page_viewed' and created_at::date = days.d),
        'signups', (select count(*) from signups where created_at::date = days.d),
        'paid', (select count(distinct organization_id) from ev where event = 'paid_plan_activated' and created_at::date = days.d))
        order by days.d), '[]'::jsonb) from days),
    'by_campaign', (select coalesce(jsonb_agg(r order by r.signups desc, r.visits desc), '[]'::jsonb) from (
        select k.camp as key,
          (select c.name from public.growth_campaigns c where c.slug = k.camp) as name,
          (select count(distinct w.session_id) from web w where w.event = 'acquisition_page_viewed' and w.camp is not distinct from k.camp) as visits,
          (select count(*) from signups s where s.camp is not distinct from k.camp) as signups,
          (select count(*) from signups s where s.camp is not distinct from k.camp and s.stage not in ('no_org', 'signed_up')) as activated,
          (select count(*) from signups s where s.camp is not distinct from k.camp and s.stage = 'paid') as paid
        from (select camp from web union select camp from signups) k limit 100) r),
    'by_channel', (select coalesce(jsonb_agg(r order by r.signups desc, r.visits desc), '[]'::jsonb) from (
        select k.src as key,
          (select count(distinct w.session_id) from web w where w.event = 'acquisition_page_viewed' and w.src = k.src) as visits,
          (select count(*) from signups s where s.src = k.src) as signups,
          (select count(*) from signups s where s.src = k.src and s.stage not in ('no_org', 'signed_up')) as activated,
          (select count(*) from signups s where s.src = k.src and s.stage = 'paid') as paid
        from (select src from web union select src from signups) k limit 100) r),
    'by_landing', (select coalesce(jsonb_agg(r order by r.signups desc, r.visits desc), '[]'::jsonb) from (
        select k.landing as key,
          (select count(distinct w.session_id) from web w where w.event = 'acquisition_page_viewed' and w.data ->> 'page' is not distinct from k.landing) as visits,
          (select count(*) from signups s where s.landing is not distinct from k.landing) as signups
        from (select data ->> 'page' as landing from web where event = 'acquisition_page_viewed'
              union select landing from signups) k limit 100) r),
    'stages', (select coalesce(jsonb_object_agg(stage, n), '{}'::jsonb) from (
        select stage, count(*) n from people group by stage) s),
    'filters', jsonb_build_object(
      'sources', (select coalesce(jsonb_agg(distinct v), '[]'::jsonb) from (
          select src v from ppl union select data ->> 'utm_source' from public.growth_events
          where data ? 'utm_source') x where v is not null),
      'campaigns', (select coalesce(jsonb_agg(distinct v), '[]'::jsonb) from (
          select camp v from ppl union select slug from public.growth_campaigns
          union select coalesce(data ->> 'utm_campaign', data ->> 'campaign') from public.growth_events) x where v is not null),
      'landings', (select coalesce(jsonb_agg(distinct v), '[]'::jsonb) from (
          select landing v from ppl union select data ->> 'page' from public.growth_events
          where event = 'acquisition_page_viewed') x where v is not null),
      'plans', (select coalesce(jsonb_agg(distinct plan_id), '[]'::jsonb) from public.subscriptions))
  ) into out;
  return out;
end;
$$;

-- Leads e cadastros (paginado; só o necessário para o acompanhamento comercial) ----------------
create function public.admin_growth_leads(f jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p jsonb := public.growth_filters(f);
  q text := nullif(left(f ->> 'q', 80), '');
  kind_f text := nullif(f ->> 'kind', '');
  page int := greatest(coalesce((f ->> 'page')::int, 1), 1);
  size int := least(greatest(coalesce((f ->> 'size')::int, 25), 1), 100);
  sort text := case when f ->> 'sort' in ('name', 'created_at', 'docs') then f ->> 'sort' else 'created_at' end;
  last_model boolean := p ->> 'model' = 'last';
  out jsonb;
begin
  perform public.growth_require_admin();
  with
  users as (
    select 'user' as row_type, x.user_id::text as id, pr.full_name as name, u.email,
      o.name as organization, x.created_at,
      case when last_model then x.last_source else x.first_source end as source,
      case when last_model then x.last_campaign else x.first_campaign end as campaign,
      case when last_model then x.last_landing else x.first_landing end as landing,
      x.plan_id, x.stage, x.docs_used, q2.use_case as interest,
      (select c.granted from public.user_consents c where c.user_id = x.user_id and c.kind = 'marketing'
        order by c.created_at desc limit 1) as marketing,
      case when x.stage = 'paid' then 'paid'
           when x.stage in ('activated', 'recurring', 'pql', 'pql_hot', 'opportunity') then 'activated'
           else 'registered' end as kind,
      exists (select 1 from public.leads l where lower(l.email) = lower(u.email)) as also_form,
      x.org_id, x.internal
    from public.growth_people((p ->> 'internal')::boolean) x
    join auth.users u on u.id = x.user_id
    left join public.profiles pr on pr.id = x.user_id
    left join public.organizations o on o.id = x.org_id
    left join public.org_qualification q2 on q2.organization_id = x.org_id
  ),
  forms as (
    select 'form' as row_type, l.id::text, l.nome, l.email, l.empresa, l.created_at,
      public.growth_origin(l.utm ->> 'utm_source', null), coalesce(l.utm ->> 'utm_campaign', l.utm ->> 'campaign'),
      l.pagina, null::text, null::text, null::integer, l.plano,
      null::boolean, 'form', false, null::uuid, false
    from public.leads l
    where not exists (select 1 from auth.users u where lower(u.email) = lower(l.email))
  ),
  allrows as (select * from users union all select * from forms),
  filtered as (
    select * from allrows a
    where a.created_at >= (p ->> 'from')::timestamptz and a.created_at < (p ->> 'to')::timestamptz
      and (kind_f is null or a.kind = kind_f)
      and (q is null or a.name ilike '%' || q || '%' or a.email ilike '%' || q || '%'
           or a.organization ilike '%' || q || '%')
      and (p ->> 'source' is null or a.source = p ->> 'source')
      and (p ->> 'campaign' is null or a.campaign = p ->> 'campaign')
      and (p ->> 'plan' is null or a.plan_id = p ->> 'plan')
      and (p ->> 'stage' is null or a.stage = p ->> 'stage')
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'page', page, 'size', size,
    'rows', coalesce((select jsonb_agg(to_jsonb(r)) from (
      select * from filtered
      order by case when sort = 'name' then filtered.name end asc nulls last,
               case when sort = 'docs' then filtered.docs_used end desc nulls last,
               filtered.created_at desc
      offset (page - 1) * size limit size) r), '[]'::jsonb)
  ) into out;
  return out;
end;
$$;

-- Histórico comercial de uma pessoa/organização (sem conteúdo de documentos).
create function public.admin_growth_timeline(usr uuid default null, org uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  perform public.growth_require_admin();
  if usr is null and org is null then raise exception 'invalid_request' using errcode = 'P0001'; end if;
  select jsonb_build_object(
    'acquisition', (select to_jsonb(a) - 'user_id' from public.user_acquisition a where a.user_id = usr),
    'events', coalesce((select jsonb_agg(jsonb_build_object('event', g.event, 'at', g.created_at,
        'data', g.data - 'session' - 'page') order by g.created_at desc)
      from (select * from public.growth_events g
            where (usr is not null and g.user_id = usr)
               or (org is not null and g.organization_id = org)
               or (usr is not null and g.organization_id in (select id from public.organizations where created_by = usr))
            order by g.created_at desc limit 200) g), '[]'::jsonb),
    'consents', coalesce((select jsonb_agg(jsonb_build_object('kind', c.kind, 'granted', c.granted,
        'version', c.version, 'at', c.created_at) order by c.created_at desc)
      from public.user_consents c where c.user_id = usr), '[]'::jsonb),
    'qualification', (select to_jsonb(q) - 'answered_by' from public.org_qualification q
      where q.organization_id = coalesce(org, (select id from public.organizations where created_by = usr
        order by created_at limit 1)))
  ) into out;
  return out;
end;
$$;

-- Funil de conversão: duas coortes separadas (sessões anônimas e pessoas cadastradas), cada uma com
-- taxas só entre etapas da mesma população.
create function public.admin_growth_funnel_v2(f jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p jsonb := public.growth_filters(f);
  d_from timestamptz := (p ->> 'from')::timestamptz;
  d_to timestamptz := (p ->> 'to')::timestamptz;
  inc boolean := (p ->> 'internal')::boolean;
  last_model boolean := p ->> 'model' = 'last';
  out jsonb;
begin
  perform public.growth_require_admin();
  with
  sess as (
    select g.session_id, g.event, coalesce(g.data ->> 'utm_campaign', g.data ->> 'campaign') as camp,
      public.growth_origin(g.data ->> 'utm_source', null) as src
    from public.growth_events g
    where g.created_at >= d_from and g.created_at < d_to and g.session_id is not null
      and g.event in ('acquisition_page_viewed', 'acquisition_cta_clicked', 'signup_started')
      and (inc or coalesce(g.data ->> 'internal', '') <> '1')
      and (p ->> 'source' is null or g.data ->> 'utm_source' = p ->> 'source')
      and (p ->> 'campaign' is null or coalesce(g.data ->> 'utm_campaign', g.data ->> 'campaign') = p ->> 'campaign')
  ),
  viewed as (select distinct session_id from sess where event = 'acquisition_page_viewed'),
  web as (
    select v.session_id,
      exists (select 1 from sess s where s.session_id = v.session_id and s.event = 'acquisition_cta_clicked') as clicked,
      exists (select 1 from sess s where s.session_id = v.session_id and s.event = 'signup_started') as started,
      exists (select 1 from public.user_acquisition a where a.session_id = v.session_id) as completed
    from viewed v
  ),
  cohort as (
    select x.*,
      case when last_model then x.last_source else x.first_source end as src,
      case when last_model then x.last_campaign else x.first_campaign end as camp,
      exists (select 1 from public.growth_events g where g.organization_id = x.org_id and g.event = 'first_document_created') as first_doc,
      exists (select 1 from public.growth_events g where g.organization_id = x.org_id and g.event = 'second_document_completed') as recurring,
      exists (select 1 from public.growth_events g where g.organization_id = x.org_id
        and g.event in ('upgrade_cta_clicked', 'checkout_started', 'paid_feature_attempted',
                        'cedro_usage_4_of_5', 'cedro_limit_reached')) as upgrade_interest,
      exists (select 1 from public.growth_events g where g.organization_id = x.org_id and g.event = 'paid_plan_activated') as paid
    from public.growth_people(inc) x
    where x.created_at >= d_from and x.created_at < d_to
      and (p ->> 'plan' is null or x.plan_id = p ->> 'plan')
  ),
  c as (
    select * from cohort
    where (p ->> 'source' is null or cohort.src = p ->> 'source')
      and (p ->> 'campaign' is null or cohort.camp = p ->> 'campaign')
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', d_from, 'to', d_to, 'model', p ->> 'model', 'internal', inc),
    'web', jsonb_build_object(
      'visitors', (select count(*) from web),
      'cta', (select count(*) from web where clicked),
      'signup_started', (select count(*) from web where started),
      'signup_completed', (select count(*) from web where completed)),
    'people', jsonb_build_object(
      'signup_completed', (select count(*) from c),
      'organization', (select count(*) from c where org_id is not null),
      'first_document', (select count(*) from c where first_doc),
      'recurring', (select count(*) from c where recurring),
      'upgrade_interest', (select count(*) from c where upgrade_interest),
      'paid', (select count(*) from c where paid),
      'checkout_clicks', (select count(*) from public.growth_events g join c on c.org_id = g.organization_id
        where g.event in ('upgrade_cta_clicked', 'checkout_started'))),
    'weekly', (select coalesce(jsonb_agg(r order by r.week), '[]'::jsonb) from (
      select date_trunc('week', c.created_at)::date as week, count(*) as signups,
        count(*) filter (where first_doc) as first_document, count(*) filter (where paid) as paid
      from c group by 1) r),
    'by_campaign', (select coalesce(jsonb_agg(r order by r.signup_completed desc), '[]'::jsonb) from (
      select camp as key, count(*) as signup_completed, count(*) filter (where first_doc) as first_document,
        count(*) filter (where recurring) as recurring, count(*) filter (where upgrade_interest) as upgrade_interest,
        count(*) filter (where paid) as paid
      from c group by camp limit 100) r),
    'by_channel', (select coalesce(jsonb_agg(r order by r.signup_completed desc), '[]'::jsonb) from (
      select src as key, count(*) as signup_completed, count(*) filter (where first_doc) as first_document,
        count(*) filter (where recurring) as recurring, count(*) filter (where upgrade_interest) as upgrade_interest,
        count(*) filter (where paid) as paid
      from c group by src limit 100) r)
  ) into out;
  return out;
end;
$$;

-- Oportunidades (PQL) ----------------------------------------------------------------------------
create function public.admin_growth_opportunities(f jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  stage_f text := nullif(f ->> 'stage', '');
  owner_f uuid := nullif(f ->> 'owner', '')::uuid;
  inc boolean := coalesce((f ->> 'internal')::boolean, false);
  page int := greatest(coalesce((f ->> 'page')::int, 1), 1);
  size int := least(greatest(coalesce((f ->> 'size')::int, 25), 1), 100);
  out jsonb;
begin
  perform public.growth_require_admin();
  with base as (
    select o.id, o.name, o.created_at, x.user_id, x.stage, x.plan_id, x.docs_used,
      x.first_source, x.first_campaign, x.last_source, x.last_campaign,
      (select count(*) from public.documents d where d.organization_id = o.id and d.status = 'concluded') as concluded,
      public.cedro_free_used(o.id) as free_used,
      (select coalesce(jsonb_agg(distinct g.event), '[]'::jsonb) from public.growth_events g
        where g.organization_id = o.id and g.event in ('upgrade_cta_clicked', 'checkout_started',
          'checkout_abandoned', 'paid_feature_attempted', 'cedro_usage_4_of_5', 'cedro_limit_reached',
          'user_inactive')) as signals,
      (select to_jsonb(q) - 'answered_by' - 'organization_id' from public.org_qualification q
        where q.organization_id = o.id) as qualification,
      (select max(g.created_at) from public.growth_events g where g.organization_id = o.id) as last_activity,
      go.owner_id, (select pr.full_name from public.profiles pr where pr.id = go.owner_id) as owner_name,
      (select count(*) from public.growth_notes n where n.organization_id = o.id) as notes
    from public.growth_people(inc) x
    join public.organizations o on o.id = x.org_id
    left join public.growth_owners go on go.organization_id = o.id
    where o.closed_at is null
  ),
  filtered as (
    select * from base
    where (stage_f is null or base.stage = stage_f)
      and (owner_f is null or base.owner_id = owner_f)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'counts', (select coalesce(jsonb_object_agg(stage, n), '{}'::jsonb) from (
        select stage, count(*) n from base group by stage) s),
    'rows', coalesce((select jsonb_agg(to_jsonb(r)) from (
      select * from filtered
      order by case stage when 'pql_hot' then 1 when 'opportunity' then 2 when 'pql' then 3
        when 'recurring' then 4 when 'activated' then 5 when 'signed_up' then 6 else 7 end,
        last_activity desc nulls last
      offset (page - 1) * size limit size) r), '[]'::jsonb)
  ) into out;
  return out;
end;
$$;

create function public.admin_growth_admins() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  perform public.growth_require_admin();
  select coalesce(jsonb_agg(jsonb_build_object('id', p.user_id, 'name', coalesce(pr.full_name, 'Super Admin'))), '[]'::jsonb)
    into out from public.platform_admins p left join public.profiles pr on pr.id = p.user_id;
  return out;
end;
$$;

create function public.admin_growth_set_owner(org uuid, owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.growth_require_admin();
  if owner is not null and not exists (select 1 from public.platform_admins where user_id = owner) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.organizations where id = org) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.growth_owners (organization_id, owner_id, updated_by)
    values (org, owner, auth.uid())
  on conflict (organization_id) do update set owner_id = excluded.owner_id,
    updated_by = excluded.updated_by, updated_at = now();
  perform public.write_audit(null, 'growth.owner.set', 'organization', org::text,
    jsonb_build_object('owner', owner));
end;
$$;

create function public.admin_growth_notes(org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  perform public.growth_require_admin();
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'at', n.created_at,
      'author', coalesce(pr.full_name, 'Super Admin')) order by n.created_at desc), '[]'::jsonb)
    into out
  from public.growth_notes n left join public.profiles pr on pr.id = n.author_id
  where n.organization_id = org;
  return out;
end;
$$;

create function public.admin_growth_note_add(org uuid, body text) returns void
language plpgsql security definer set search_path = '' as $$
declare nid bigint;
begin
  perform public.growth_require_admin();
  if body is null or char_length(btrim(body)) not between 1 and 2000 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  insert into public.growth_notes (organization_id, author_id, body)
    values (org, auth.uid(), btrim(body)) returning id into nid;
  perform public.write_audit(null, 'growth.note.added', 'organization', org::text,
    jsonb_build_object('note', nid));
exception when foreign_key_violation then raise exception 'not_found' using errcode = 'P0002';
end;
$$;

-- Exportação: registra quem exportou o quê (e quantas linhas) antes do download.
create function public.admin_growth_log_export(what text, n integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.growth_require_admin();
  if what not in ('campaigns', 'links', 'leads', 'opportunities', 'overview') or n not between 0 and 100000 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  perform public.write_audit(null, 'growth.export', 'growth', what, jsonb_build_object('rows', n));
end;
$$;

-- Permissões: só pessoas logadas chamam; cada função confere Super Admin com MFA.
do $$
declare fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin_growth_%'
      and p.proname <> 'admin_growth_funnel'
  loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
revoke execute on function public.growth_filters(jsonb) from public, anon, authenticated;
revoke execute on function public.growth_origin(text, text) from public, anon, authenticated;
revoke execute on function public.growth_campaign_slug_locked() from public, anon, authenticated;
