-- MDSign — Bloco A: motor financeiro Asaas (SANDBOX nesta fase).
-- Regras: o Asaas cobra; o MDSign decide plano, limites e acesso (entitlements + políticas).
-- Só eventos financeiros processados pelo servidor mudam a situação financeira — nunca o
-- retorno do checkout no navegador. Nada aqui é escrito pelo cliente: só o servidor (service_role).

-- 1. Assinatura da organização: vínculo com o Asaas (reaproveita public.subscriptions).
alter table public.subscriptions
  add column provider text not null default 'internal'
    check (provider in ('internal', 'asaas', 'manual')),
  add column asaas_customer_id text unique,
  add column asaas_subscription_id text unique,
  add column asaas_checkout_id text,
  add column billing_cycle text check (billing_cycle in ('MONTHLY')),
  add column value_cents integer check (value_cents >= 0),
  add column next_due_date date,
  add column last_payment_at timestamptz,
  add column last_sync_at timestamptz,
  add column past_due_since timestamptz,
  -- Cancelamento pedido: o plano vale até o fim do período pago, depois volta ao Cedro.
  add column cancel_at timestamptz;

-- 2. Checkouts: o plano escolhido fica pendente até o Asaas confirmar o pagamento.
create table public.billing_checkouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_id text not null references public.plans (id),
  previous_plan_id text references public.plans (id),
  environment text not null check (environment in ('sandbox', 'production')),
  asaas_checkout_id text unique,
  link text,
  value_cents integer not null check (value_cents > 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'canceled', 'expired', 'failed')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);
create index billing_checkouts_org_idx on public.billing_checkouts (organization_id, created_at desc);
create trigger billing_checkouts_touch before update on public.billing_checkouts
  for each row execute function public.touch_updated_at();

-- 3. Cobranças (histórico): só o necessário — sem dados de cartão.
create table public.billing_payments (
  asaas_payment_id text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  asaas_subscription_id text,
  environment text not null check (environment in ('sandbox', 'production')),
  billing_type text,
  value_cents integer,
  status text not null,
  due_date date,
  paid_at timestamptz,
  invoice_url text,
  updated_at timestamptz not null default now()
);
create index billing_payments_org_idx on public.billing_payments (organization_id, due_date desc);

-- 4. Eventos recebidos do Asaas: a chave é o id do evento (idempotência — "at least once").
create table public.billing_events (
  id text primary key,
  event text not null,
  environment text not null check (environment in ('sandbox', 'production')),
  organization_id uuid references public.organizations (id) on delete set null,
  data jsonb not null default '{}'::jsonb,   -- só identificadores e valores, sem dados pessoais
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  error text
);
create index billing_events_pending_idx on public.billing_events (received_at)
  where processed_at is null;

-- 5. Integrações (API MDSign, webhooks para sistemas do cliente, RH/HCM, ERP): só no Mogno.
-- O webhook financeiro do Asaas é infraestrutura interna e não depende deste entitlement.
insert into public.plan_entitlements (plan_id, key, value_int, value_bool) values
  ('mogno', 'integrations_access', null, true)
on conflict (plan_id, key) do update set value_bool = excluded.value_bool;

create function public.entitlement_bool(org uuid, ent text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select pe.value_bool from public.subscriptions s
    join public.plan_entitlements pe on pe.plan_id = s.plan_id and pe.key = ent
    where s.organization_id = org), false);
$$;
revoke execute on function public.entitlement_bool(uuid, text) from public, anon;
grant execute on function public.entitlement_bool(uuid, text) to authenticated, service_role;

-- 6. Tolerância de inadimplência (motor de políticas): depois dela, a organização é suspensa.
insert into public.policies (id, description, config) values
  ('billing_grace', 'Dias de tolerância após o vencimento antes de suspender novas operações', '{"days": 7}')
on conflict (id) do nothing;

-- 7. Resumo financeiro para a tela "Plano e cobrança" (quem tem billing.view).
create function public.org_billing(org uuid)
returns table (plan_id text, plan_name text, price_cents integer, status text, billing_status text,
  provider text, billing_cycle text, value_cents integer, next_due_date date,
  last_payment_at timestamptz, past_due_since timestamptz, cancel_at timestamptz,
  grace_days integer, pending_plan_id text, pending_link text, pending_created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.plan_id, p.name, p.price_cents, s.status, s.billing_status, s.provider, s.billing_cycle,
    s.value_cents, s.next_due_date, s.last_payment_at, s.past_due_since, s.cancel_at,
    coalesce((select (config->>'days')::integer from public.policies where id = 'billing_grace' and active), 0),
    c.plan_id, c.link, c.created_at
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  left join lateral (
    select bc.plan_id, bc.link, bc.created_at from public.billing_checkouts bc
    where bc.organization_id = org and bc.status = 'pending'
      and bc.created_at > now() - interval '1 day'
    order by bc.created_at desc limit 1
  ) c on true
  where s.organization_id = org
    and (public.has_org_permission(org, 'billing.view') or public.is_platform_admin());
$$;
revoke execute on function public.org_billing(uuid) from public, anon;
grant execute on function public.org_billing(uuid) to authenticated;

-- 8. Super Admin: acompanhamento financeiro (nunca chaves, segredos ou dados de cartão).
create function public.admin_billing()
returns table (organization_id uuid, organization_name text, plan_id text, provider text,
  status text, billing_status text, asaas_customer_id text, asaas_subscription_id text,
  next_due_date date, last_payment_at timestamptz, last_sync_at timestamptz,
  pending_events integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select o.id, o.name, s.plan_id, s.provider, s.status, s.billing_status, s.asaas_customer_id,
    s.asaas_subscription_id, s.next_due_date, s.last_payment_at, s.last_sync_at,
    (select count(*)::integer from public.billing_events e
      where e.organization_id = o.id and e.processed_at is null)
  from public.organizations o
  join public.subscriptions s on s.organization_id = o.id
  order by o.name;
end;
$$;
revoke execute on function public.admin_billing() from public, anon;
grant execute on function public.admin_billing() to authenticated;

-- 9. RLS: leitura por quem vê a cobrança da organização; escrita só pelo servidor.
alter table public.billing_checkouts enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_events enable row level security;

create policy billing_checkouts_select on public.billing_checkouts for select to authenticated
  using (public.has_org_permission(organization_id, 'billing.view') or public.is_platform_admin());
create policy billing_payments_select on public.billing_payments for select to authenticated
  using (public.has_org_permission(organization_id, 'billing.view') or public.is_platform_admin());
create policy billing_events_select on public.billing_events for select to authenticated
  using (public.is_platform_admin());

revoke all on public.billing_checkouts, public.billing_payments, public.billing_events
  from anon, authenticated;
grant select on public.billing_checkouts, public.billing_payments, public.billing_events
  to authenticated;
