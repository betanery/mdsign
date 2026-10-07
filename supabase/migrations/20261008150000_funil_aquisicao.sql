-- MDSign — Funil de aquisição e conversão (PLG) com o Cedro.
-- Visitante → cadastro → 1º documento → uso recorrente → limite → upgrade → cliente pago.
-- Preços, limites e entitlements não mudam. Única regra nova (decisão da Roberta): os 5
-- documentos grátis do Cedro valem por pessoa (soma das organizações Cedro que ela criou).
-- Eventos de marco saem do banco (triggers), então só existem depois da confirmação real.

-- 1. Origem do cadastro (first-touch), gravada no cadastro — sobrevive à confirmação de e-mail.
create table public.user_acquisition (
  user_id uuid primary key references auth.users (id) on delete cascade,
  utm_source text check (char_length(utm_source) <= 120),
  utm_medium text check (char_length(utm_medium) <= 120),
  utm_campaign text check (char_length(utm_campaign) <= 160),
  utm_content text check (char_length(utm_content) <= 160),
  utm_term text check (char_length(utm_term) <= 160),
  landing_page text check (char_length(landing_page) <= 300),
  referrer text check (char_length(referrer) <= 300),
  campaign text check (char_length(campaign) <= 120),
  first_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- 2. Aceites: termos (obrigatório) e marketing (opcional, separado).
create table public.user_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('terms', 'marketing')),
  granted boolean not null,
  version text check (char_length(version) <= 40),
  source text check (char_length(source) <= 40),
  created_at timestamptz not null default now()
);
create index user_consents_user_idx on public.user_consents (user_id, kind, created_at desc);

-- 3. Eventos de crescimento (fila de gatilhos para CRM/automações e base do painel).
create table public.growth_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  session_id text check (session_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  event text not null check (event ~ '^[a-z0-9_]{3,60}$'),
  milestone boolean not null default false,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 4000),
  created_at timestamptz not null default now()
);
create index growth_events_event_idx on public.growth_events (event, created_at desc);
create index growth_events_org_idx on public.growth_events (organization_id, created_at desc);
-- Marcos acontecem uma vez só por organização (ou por usuário, quando ainda não há organização).
create unique index growth_events_milestone_idx on public.growth_events
  (coalesce(organization_id::text, user_id::text), event) where milestone;

create function public.growth_mark(org uuid, usr uuid, ev text, payload jsonb default '{}',
  is_milestone boolean default true)
returns void language sql security definer set search_path = '' as $$
  insert into public.growth_events (organization_id, user_id, event, milestone, data)
  values (org, usr, ev, is_milestone, coalesce(payload, '{}'::jsonb))
  on conflict do nothing;
$$;

-- 4. Qualificação progressiva (sempre opcional).
create table public.org_qualification (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  use_case text check (use_case in ('self_sign', 'send_others', 'company', 'high_volume')),
  company text check (char_length(company) <= 160),
  monthly_volume integer check (monthly_volume between 0 and 1000000),
  users_count integer check (users_count between 0 and 100000),
  bulk_interest boolean,
  integration_interest boolean,
  dismissed_at timestamptz,
  answered_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 5. Limiares da classificação (ajustáveis no Super Admin).
insert into public.policies (id, description, config) values
  ('growth_stages',
   'Classificação do funil: documentos concluídos para PQL e documentos grátis usados para PQL quente',
   '{"pql_docs": 3, "hot_docs": 4, "opportunity_volume": 20}')
on conflict (id) do nothing;

-- 6. RLS. Eventos e origem: só o servidor e o Super Admin (via funções). Qualificação: membros.
alter table public.user_acquisition enable row level security;
alter table public.user_consents enable row level security;
alter table public.growth_events enable row level security;
alter table public.org_qualification enable row level security;

create policy user_consents_select on public.user_consents for select to authenticated
  using (user_id = auth.uid());
create policy org_qualification_select on public.org_qualification for select to authenticated
  using (public.is_org_member(organization_id));
create policy org_qualification_insert on public.org_qualification for insert to authenticated
  with check (public.is_org_member(organization_id) and answered_by = auth.uid());
create policy org_qualification_update on public.org_qualification for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id) and answered_by = auth.uid());

revoke all on public.user_acquisition, public.user_consents, public.growth_events,
  public.org_qualification from anon, authenticated;
grant select on public.user_consents to authenticated;
grant select, insert, update on public.org_qualification to authenticated;
revoke execute on function public.growth_mark(uuid, uuid, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.growth_mark(uuid, uuid, text, jsonb, boolean) to service_role;

-- 7. Cadastro: perfil + origem + aceites, tudo a partir dos metadados do signUp.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  acq jsonb := case when jsonb_typeof(meta -> 'acq') = 'object' then meta -> 'acq' else '{}'::jsonb end;
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
      utm_content, utm_term, landing_page, referrer, campaign, first_seen_at)
    values (new.id,
      nullif(left(acq ->> 'utm_source', 120), ''), nullif(left(acq ->> 'utm_medium', 120), ''),
      nullif(left(acq ->> 'utm_campaign', 160), ''), nullif(left(acq ->> 'utm_content', 160), ''),
      nullif(left(acq ->> 'utm_term', 160), ''), nullif(left(acq ->> 'landing_page', 300), ''),
      nullif(left(acq ->> 'referrer', 300), ''), nullif(left(acq ->> 'campaign', 120), ''),
      case when (acq ->> 'first_seen_at') ~ '^\d{4}-\d{2}-\d{2}T'
        then (acq ->> 'first_seen_at')::timestamptz end);
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

-- 8. Cedro por pessoa: soma o consumo das organizações Cedro criadas pela mesma pessoa.
create function public.cedro_free_used(org uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(u.value), 0)::integer
  from public.organizations o
  join public.subscriptions s on s.organization_id = o.id and s.plan_id = 'cedro'
  join public.usage_counters u on u.organization_id = o.id and u.period = 'total'
    and u.metric = 'documents'
  where o.created_by = (select created_by from public.organizations where id = org)
    and (select created_by from public.organizations where id = org) is not null;
$$;
revoke execute on function public.cedro_free_used(uuid) from public, anon, authenticated;

create or replace function public.consume_document(org uuid, origin text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  month text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  total_limit integer := public.entitlement_int(org, 'documents_total');
  month_limit integer := public.entitlement_int(org, 'documents_month');
  used_total integer;
  used_month integer;
  sub_status text;
  plan text;
  alert_pct numeric := (select (config->>'percent')::numeric / 100 from public.policies
                         where id = 'usage_alert' and active);
begin
  select status, plan_id into sub_status, plan from public.subscriptions where organization_id = org;
  if sub_status in ('suspended', 'canceled') then return false; end if;

  insert into public.usage_counters (organization_id, period, metric) values (org, 'total', 'documents')
    on conflict do nothing;
  insert into public.usage_counters (organization_id, period, metric) values (org, month, 'documents')
    on conflict do nothing;
  select value into used_total from public.usage_counters
    where organization_id = org and period = 'total' and metric = 'documents' for update;
  select value into used_month from public.usage_counters
    where organization_id = org and period = month and metric = 'documents' for update;
  -- Cedro: o limite vale para a soma das organizações grátis da mesma pessoa.
  if plan = 'cedro' then used_total := greatest(used_total, public.cedro_free_used(org)); end if;

  if (public.entitlement_exists(org, 'documents_total') and used_total >= total_limit)
     or (public.entitlement_exists(org, 'documents_month') and used_month >= month_limit) then
    insert into public.policy_events (organization_id, policy_id, data)
      values (org, 'usage_block', jsonb_build_object('metric', 'documents', 'origin', origin));
    -- Tentou usar além do grátis: sinal de intenção de plano pago.
    perform public.growth_mark(org, null, 'paid_feature_attempted',
      jsonb_build_object('feature', 'documents_limit', 'plan', plan), false);
    return false;
  end if;

  update public.usage_counters set value = value + 1
    where organization_id = org and metric = 'documents' and period in ('total', month);

  if alert_pct is not null and (
       (total_limit is not null and used_total + 1 = ceil(total_limit * alert_pct))
       or (month_limit is not null and used_month + 1 = ceil(month_limit * alert_pct))) then
    insert into public.policy_events (organization_id, policy_id, data)
      values (org, 'usage_alert', jsonb_build_object('metric', 'documents', 'period', month));
  end if;

  if plan = 'cedro' and total_limit is not null then
    if used_total + 1 = total_limit - 1 then
      perform public.growth_mark(org, null, 'cedro_usage_4_of_5', '{}'::jsonb);
    elsif used_total + 1 >= total_limit then
      perform public.growth_mark(org, null, 'cedro_limit_reached', '{}'::jsonb);
    end if;
  end if;
  return true;
end;
$$;

create or replace function public.org_usage(org uuid)
returns table (plan_id text, plan_name text, status text, billing_status text,
  documents_total_limit integer, documents_total_used integer,
  documents_month_limit integer, documents_month_used integer,
  users_max integer, users_used integer, has_total_limit boolean, has_month_limit boolean)
language sql stable security definer set search_path = '' as $$
  select s.plan_id, p.name, s.status, s.billing_status,
    public.entitlement_int(org, 'documents_total'),
    greatest(
      coalesce((select value from public.usage_counters where organization_id = org and period = 'total' and metric = 'documents'), 0),
      case when s.plan_id = 'cedro' then public.cedro_free_used(org) else 0 end),
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

-- 9. Marcos a partir dos dados reais.
create function public.growth_on_document() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if tg_op = 'INSERT' then
    perform public.growth_mark(new.organization_id, new.created_by, 'first_document_created',
      jsonb_build_object('kind', new.kind));
  elsif new.status = 'concluded' and old.status is distinct from 'concluded' then
    select count(*) into n from public.documents
      where organization_id = new.organization_id and status = 'concluded';
    if n >= 1 then
      perform public.growth_mark(new.organization_id, new.created_by, 'first_document_completed',
        jsonb_build_object('kind', new.kind));
    end if;
    if n >= 2 then
      perform public.growth_mark(new.organization_id, new.created_by, 'second_document_completed',
        jsonb_build_object('kind', new.kind));
    end if;
  end if;
  return new;
end;
$$;
create trigger documents_growth after insert or update of status on public.documents
  for each row execute function public.growth_on_document();

create function public.growth_on_checkout() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.growth_mark(new.organization_id, new.created_by, 'checkout_started',
      jsonb_build_object('plan', new.plan_id, 'checkout', new.id, 'environment', new.environment), false);
  -- "paid" só é gravado pelo processamento do pagamento confirmado (onPaid), nunca pelo clique.
  elsif new.status = 'paid' and old.status is distinct from 'paid' then
    perform public.growth_mark(new.organization_id, new.created_by, 'checkout_completed',
      jsonb_build_object('plan', new.plan_id, 'checkout', new.id, 'environment', new.environment), false);
    perform public.growth_mark(new.organization_id, new.created_by, 'paid_plan_activated',
      jsonb_build_object('plan', new.plan_id, 'environment', new.environment));
  end if;
  return new;
end;
$$;
create trigger billing_checkouts_growth after insert or update of status on public.billing_checkouts
  for each row execute function public.growth_on_checkout();

-- Recurso pago tentado pela pessoa logada (convite acima do limite, integrações etc.).
create function public.growth_paid_attempt(org uuid, feature text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_org_member(org) or feature !~ '^[a-z0-9_]{2,40}$' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.growth_mark(org, auth.uid(), 'paid_feature_attempted',
    jsonb_build_object('feature', feature), false);
end;
$$;
revoke execute on function public.growth_paid_attempt(uuid, text) from public, anon;
grant execute on function public.growth_paid_attempt(uuid, text) to authenticated;

-- 10. Classificação comportamental.
create function public.org_growth_stage(org uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  cfg jsonb := coalesce((select config from public.policies where id = 'growth_stages' and active), '{}');
  sub record;
  q record;
  concluded integer;
  free_used integer;
  has_event boolean;
begin
  select plan_id, billing_status, status into sub from public.subscriptions where organization_id = org;
  if sub.plan_id is distinct from 'cedro' and (sub.billing_status = 'paid'
     or exists (select 1 from public.growth_events where organization_id = org and event = 'paid_plan_activated')) then
    return 'paid';
  end if;
  select * into q from public.org_qualification where organization_id = org;
  if q.use_case in ('company', 'high_volume') and (
       coalesce(q.monthly_volume, 0) >= coalesce((cfg->>'opportunity_volume')::int, 20)
       or coalesce(q.users_count, 0) >= 2 or q.bulk_interest or q.integration_interest) then
    return 'opportunity';
  end if;
  select count(*) into concluded from public.documents where organization_id = org and status = 'concluded';
  free_used := case when sub.plan_id = 'cedro' then public.cedro_free_used(org) else 0 end;
  select exists (select 1 from public.growth_events where organization_id = org
    and event = 'paid_feature_attempted') into has_event;
  if free_used >= coalesce((cfg->>'hot_docs')::int, 4) or has_event then return 'pql_hot'; end if;
  if concluded >= coalesce((cfg->>'pql_docs')::int, 3) or exists (select 1 from public.growth_events
       where organization_id = org and event in ('upgrade_cta_clicked', 'checkout_started')) then
    return 'pql';
  end if;
  if concluded >= 2 then return 'recurring'; end if;
  if concluded >= 1 then return 'activated'; end if;
  return 'signed_up';
end;
$$;
revoke execute on function public.org_growth_stage(uuid) from public, anon, authenticated;

-- 11. Gatilhos diários (inativo, checkout abandonado). Nada é enviado: só registra.
create function public.growth_daily() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; k integer;
begin
  insert into public.growth_events (organization_id, event, data)
  select o.id, 'user_inactive', jsonb_build_object('days', 14)
  from public.organizations o
  where exists (select 1 from public.growth_events g where g.organization_id = o.id
                  and g.event = 'first_document_completed')
    and not exists (select 1 from public.documents d where d.organization_id = o.id
                      and d.created_at > now() - interval '14 days')
    and not exists (select 1 from public.growth_events g where g.organization_id = o.id
                      and g.event = 'user_inactive' and g.created_at > now() - interval '14 days');
  get diagnostics k = row_count; n := n + k;

  insert into public.growth_events (organization_id, user_id, event, data)
  select c.organization_id, c.created_by, 'checkout_abandoned',
    jsonb_build_object('checkout', c.id, 'plan', c.plan_id)
  from public.billing_checkouts c
  where c.status = 'pending' and c.created_at < now() - interval '24 hours'
    and c.created_at > now() - interval '30 days'
    and not exists (select 1 from public.growth_events g where g.event = 'checkout_abandoned'
                      and g.data->>'checkout' = c.id::text);
  get diagnostics k = row_count; n := n + k;
  return n;
end;
$$;
revoke execute on function public.growth_daily() from public, anon, authenticated;
grant execute on function public.growth_daily() to service_role;

-- 12. Painel do funil (Super Admin). Sem histórico inventado: só o que foi registrado.
create function public.admin_growth_funnel(date_from timestamptz, date_to timestamptz,
  campaign text default null, source text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  with
  ua as (
    select u.id as user_id,
      coalesce(a.utm_source, case when a.referrer is not null
        then split_part(regexp_replace(a.referrer, '^https?://', ''), '/', 1) end) as src,
      coalesce(a.utm_campaign, a.campaign) as camp,
      a.user_id is not null as tracked
    from auth.users u left join public.user_acquisition a on a.user_id = u.id
  ),
  orgs as (
    select o.id, o.name, o.created_at, ua.src, ua.camp, ua.tracked
    from public.organizations o left join ua on ua.user_id = o.created_by
    where (campaign is null or ua.camp = campaign) and (source is null or ua.src = source)
  ),
  ev as (
    select g.* from public.growth_events g
    where g.created_at >= date_from and g.created_at < date_to
  ),
  web as (
    select * from ev where ev.event in ('acquisition_page_viewed', 'acquisition_cta_clicked', 'signup_started')
      and (campaign is null or coalesce(ev.data->>'utm_campaign', ev.data->>'campaign') = campaign)
      and (source is null or ev.data->>'utm_source' = source)
  ),
  signups as (
    select ev.user_id from ev join ua on ua.user_id = ev.user_id
    where ev.event = 'signup_completed'
      and (campaign is null or ua.camp = campaign) and (source is null or ua.src = source)
  ),
  oev as (select ev.* from ev join orgs on orgs.id = ev.organization_id),
  cnt as (
    select event, count(distinct organization_id) as n from oev group by event
  )
  select jsonb_build_object(
    'visits', (select count(distinct session_id) from web where event = 'acquisition_page_viewed'),
    'page_views', (select count(*) from web where event = 'acquisition_page_viewed'),
    'cta_clicks', (select count(*) from web where event = 'acquisition_cta_clicked'),
    'signup_started', (select count(distinct session_id) from web where event = 'signup_started'),
    'signups', (select count(*) from signups),
    'milestones', coalesce((select jsonb_object_agg(event, n) from cnt), '{}'::jsonb),
    'by_source', coalesce((
      select jsonb_agg(r order by r.signups desc) from (
        select coalesce(ua.src, case when ua.tracked then 'direto' else 'sem origem registrada' end) as source,
          coalesce(ua.camp, '—') as campaign,
          count(*) as signups,
          count(*) filter (where exists (select 1 from public.growth_events g
            join public.organizations o on o.id = g.organization_id
            where o.created_by = s.user_id and g.event = 'first_document_completed')) as activated,
          count(*) filter (where exists (select 1 from public.growth_events g
            join public.organizations o on o.id = g.organization_id
            where o.created_by = s.user_id and g.event = 'paid_plan_activated')) as paid
        from signups s join ua on ua.user_id = s.user_id
        group by 1, 2) r), '[]'::jsonb),
    'orgs', coalesce((
      select jsonb_agg(r order by r.rank, r.created_at desc) from (
        select o.id, o.name, o.created_at, o.src as source, o.camp as campaign,
          public.org_growth_stage(o.id) as stage,
          case public.org_growth_stage(o.id) when 'pql_hot' then 1 when 'opportunity' then 2
            when 'pql' then 3 when 'recurring' then 4 when 'activated' then 5
            when 'signed_up' then 6 else 7 end as rank,
          (select greatest(coalesce((select value from public.usage_counters u where u.organization_id = o.id
              and u.period = 'total' and u.metric = 'documents'), 0), 0)) as documents_used,
          (select s.plan_id from public.subscriptions s where s.organization_id = o.id) as plan_id
        from orgs o
        order by o.created_at desc
        limit 200) r), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(distinct camp) from ua where camp is not null), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(distinct src) from ua where src is not null), '[]'::jsonb)
  ) into out;
  return out;
end;
$$;
revoke execute on function public.admin_growth_funnel(timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.admin_growth_funnel(timestamptz, timestamptz, text, text) to authenticated;
