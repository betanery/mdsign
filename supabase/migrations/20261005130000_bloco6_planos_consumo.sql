-- MDSign Fase 2 — Bloco 6 (estrutura): planos, entitlements, assinatura da organização, consumo
-- e motor de políticas (PRD §38–§42). Regra: o código consulta entitlements, nunca o nome do plano.

create table public.plans (
  id text primary key,
  name text not null,
  price_cents integer,              -- null = sob consulta
  currency text not null default 'BRL',
  sort integer not null,
  is_public boolean not null default true
);

-- value_int null = ilimitado. Entitlements ainda não definidos comercialmente ficam ausentes.
create table public.plan_entitlements (
  plan_id text not null references public.plans (id) on delete cascade,
  key text not null,
  value_int integer,
  value_bool boolean,
  primary key (plan_id, key)
);

insert into public.plans (id, name, price_cents, sort) values
  ('cedro', 'Cedro', 0, 1),
  ('jacaranda', 'Jacarandá', 3990, 2),
  ('angico', 'Angico', 9997, 3),
  ('aroeira', 'Aroeira', 14997, 4),
  ('ipe', 'Ipê', 19997, 5),
  ('mogno', 'Mogno', null, 6);

insert into public.plan_entitlements (plan_id, key, value_int, value_bool) values
  -- Cedro: 5 documentos no total (não mensais), 1 usuário, assinatura eletrônica.
  ('cedro', 'documents_total', 5, null),
  ('cedro', 'users_max', 1, null),
  ('cedro', 'signature_certificate', null, false),
  -- Jacarandá: 20 documentos/mês, 1 usuário, com certificado digital.
  ('jacaranda', 'documents_month', 20, null),
  ('jacaranda', 'users_max', 1, null),
  ('jacaranda', 'signature_certificate', null, true),
  -- Angico, Aroeira, Ipê: ilimitados (sem chave de limite), 4/6/10 usuários.
  ('angico', 'users_max', 4, null),
  ('aroeira', 'users_max', 6, null),
  ('ipe', 'users_max', 10, null),
  -- Mogno: sob consulta — sem limites padrão (definidos por contrato).
  ('mogno', 'signature_certificate', null, true);

create table public.subscriptions (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status text not null default 'active'
    check (status in ('active', 'trialing', 'past_due', 'suspended', 'canceled')),
  billing_status text not null default 'free'
    check (billing_status in ('free', 'paid', 'pending', 'overdue', 'exempt')),
  started_at timestamptz not null default now(),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- Contadores de consumo: período 'total' (vida toda) e 'AAAA-MM' (mês).
create table public.usage_counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  period text not null,
  metric text not null,
  value integer not null default 0 check (value >= 0),
  primary key (organization_id, period, metric)
);

-- Motor de políticas: regras configuráveis e o registro do que foi disparado (PRD §38).
create table public.policies (
  id text primary key,
  description text not null,
  config jsonb not null default '{}'::jsonb,
  priority integer not null default 100,
  active boolean not null default true
);

insert into public.policies (id, description, config) values
  ('usage_alert', 'Alerta quando o consumo atinge o percentual configurado do limite do plano', '{"percent": 80}'),
  ('usage_block', 'Ao atingir 100% do limite, bloqueia novas operações consumíveis e oferece upgrade', '{"percent": 100}');

create table public.policy_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  policy_id text not null references public.policies (id),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Toda organização nasce no Cedro; as existentes também.
create function public.handle_new_organization() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.subscriptions (organization_id, plan_id) values (new.id, 'cedro')
  on conflict do nothing;
  return new;
end;
$$;
create trigger on_organization_created after insert on public.organizations
  for each row execute function public.handle_new_organization();
insert into public.subscriptions (organization_id, plan_id)
  select id, 'cedro' from public.organizations on conflict do nothing;

create function public.entitlement_int(org uuid, ent text) returns integer
language sql stable security definer set search_path = '' as $$
  select pe.value_int from public.subscriptions s
  join public.plan_entitlements pe on pe.plan_id = s.plan_id and pe.key = ent
  where s.organization_id = org;
$$;

create function public.entitlement_exists(org uuid, ent text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.subscriptions s
    join public.plan_entitlements pe on pe.plan_id = s.plan_id and pe.key = ent
    where s.organization_id = org);
$$;

-- Consome 1 documento se o plano permitir. Chamado só pelo servidor antes de criar no motor.
create function public.consume_document(org uuid, origin text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  month text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  total_limit integer := public.entitlement_int(org, 'documents_total');
  month_limit integer := public.entitlement_int(org, 'documents_month');
  used_total integer;
  used_month integer;
  sub_status text;
begin
  select status into sub_status from public.subscriptions where organization_id = org;
  if sub_status in ('suspended', 'canceled') then return false; end if;

  insert into public.usage_counters (organization_id, period, metric) values (org, 'total', 'documents')
    on conflict do nothing;
  insert into public.usage_counters (organization_id, period, metric) values (org, month, 'documents')
    on conflict do nothing;
  select value into used_total from public.usage_counters
    where organization_id = org and period = 'total' and metric = 'documents' for update;
  select value into used_month from public.usage_counters
    where organization_id = org and period = month and metric = 'documents' for update;

  if (public.entitlement_exists(org, 'documents_total') and used_total >= total_limit)
     or (public.entitlement_exists(org, 'documents_month') and used_month >= month_limit) then
    insert into public.policy_events (organization_id, policy_id, data)
      values (org, 'usage_block', jsonb_build_object('metric', 'documents', 'origin', origin));
    return false;
  end if;

  update public.usage_counters set value = value + 1
    where organization_id = org and metric = 'documents' and period in ('total', month);

  -- Alerta de 80% (uma vez por período).
  if (total_limit is not null and used_total + 1 = ceil(total_limit * 0.8))
     or (month_limit is not null and used_month + 1 = ceil(month_limit * 0.8)) then
    insert into public.policy_events (organization_id, policy_id, data)
      values (org, 'usage_alert', jsonb_build_object('metric', 'documents', 'period', month));
  end if;
  return true;
end;
$$;

-- Devolve o consumo quando a criação falha no motor (nada criado, nada cobrado).
create function public.refund_document(org uuid) returns void
language sql security definer set search_path = '' as $$
  update public.usage_counters set value = greatest(value - 1, 0)
  where organization_id = org and metric = 'documents'
    and period in ('total', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM'));
$$;

-- Resumo para a tela (membros da organização): plano, limites e uso (PRD §41: "X de 5").
create function public.org_usage(org uuid)
returns table (plan_id text, plan_name text, status text, billing_status text,
  documents_total_limit integer, documents_total_used integer,
  documents_month_limit integer, documents_month_used integer,
  users_max integer, users_used integer, has_total_limit boolean, has_month_limit boolean)
language sql stable security definer set search_path = '' as $$
  select s.plan_id, p.name, s.status, s.billing_status,
    public.entitlement_int(org, 'documents_total'),
    coalesce((select value from public.usage_counters where organization_id = org and period = 'total' and metric = 'documents'), 0),
    public.entitlement_int(org, 'documents_month'),
    coalesce((select value from public.usage_counters where organization_id = org
      and period = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM') and metric = 'documents'), 0),
    public.entitlement_int(org, 'users_max'),
    (select count(*)::integer from public.memberships where organization_id = org and status = 'active'),
    public.entitlement_exists(org, 'documents_total'),
    public.entitlement_exists(org, 'documents_month')
  from public.subscriptions s join public.plans p on p.id = s.plan_id
  where s.organization_id = org and (public.is_org_member(org) or public.is_platform_admin());
$$;

-- Limite de usuários no convite (PRD §40: 1/1/4/6/10).
create or replace function public.invite_member(org uuid, invite_email text, invite_role public.org_role, invite_unit uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  inv_id uuid;
  max_users integer := public.entitlement_int(org, 'users_max');
  used integer;
begin
  if not public.has_org_permission(org, 'members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if invite_role = 'owner' and public.org_role_of(org) <> 'owner' then
    raise exception 'forbidden_role' using errcode = '42501';
  end if;
  if public.entitlement_exists(org, 'users_max') then
    select (select count(*) from public.memberships where organization_id = org and status = 'active')
         + (select count(*) from public.invitations where organization_id = org
              and accepted_at is null and expires_at > now())
      into used;
    if used >= max_users then
      raise exception 'plan_users_limit' using errcode = 'P0001';
    end if;
  end if;
  insert into public.invitations (organization_id, email, role, unit_id, invited_by)
  values (org, lower(trim(invite_email)), invite_role, invite_unit, auth.uid())
  returning id into inv_id;
  perform public.write_audit(org, 'member.invited', 'invitation', inv_id::text,
    jsonb_build_object('email', lower(trim(invite_email)), 'role', invite_role));
  return inv_id;
end;
$$;

alter table public.plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_counters enable row level security;
alter table public.policies enable row level security;
alter table public.policy_events enable row level security;

create policy plans_select on public.plans for select to authenticated using (true);
create policy entitlements_select on public.plan_entitlements for select to authenticated using (true);
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy usage_select on public.usage_counters for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy policies_select on public.policies for select to authenticated
  using (public.is_platform_admin());
create policy policy_events_select on public.policy_events for select to authenticated
  using (public.has_org_permission(organization_id, 'billing.view') or public.is_platform_admin());

revoke all on public.plans, public.plan_entitlements, public.subscriptions, public.usage_counters,
  public.policies, public.policy_events from anon, authenticated;
grant select on public.plans, public.plan_entitlements, public.subscriptions, public.usage_counters,
  public.policies, public.policy_events to authenticated;

revoke execute on function public.consume_document(uuid, text), public.refund_document(uuid)
  from public, anon, authenticated;
grant execute on function public.consume_document(uuid, text), public.refund_document(uuid) to service_role;
grant execute on function public.org_usage(uuid) to authenticated;
revoke execute on function public.org_usage(uuid) from anon, public;
