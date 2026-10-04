-- MDSign Fase 2 — Super Admin MDTech (PRD §37–§42): consumo por organização, troca de plano
-- e ajuste das políticas. Tudo verificado no banco por is_platform_admin().

create function public.admin_overview()
returns table (id uuid, name text, cnpj text, status text, created_at timestamptz,
  plan_id text, subscription_status text, billing_status text,
  documents_total integer, documents_month integer, members integer, last_document_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select o.id, o.name, o.cnpj, o.status, o.created_at, s.plan_id, s.status, s.billing_status,
    coalesce((select u.value from public.usage_counters u where u.organization_id = o.id
      and u.period = 'total' and u.metric = 'documents'), 0),
    coalesce((select u.value from public.usage_counters u where u.organization_id = o.id
      and u.period = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM') and u.metric = 'documents'), 0),
    (select count(*)::integer from public.memberships m where m.organization_id = o.id and m.status = 'active'),
    (select max(d.created_at) from public.documents d where d.organization_id = o.id)
  from public.organizations o
  left join public.subscriptions s on s.organization_id = o.id
  order by o.created_at desc;
end;
$$;

create function public.admin_set_plan(org uuid, plan text, billing text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare previous text;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.plans where id = plan) then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  select plan_id into previous from public.subscriptions where organization_id = org;
  insert into public.subscriptions (organization_id, plan_id, billing_status)
    values (org, plan, coalesce(billing, 'free'))
  on conflict (organization_id) do update
    set plan_id = excluded.plan_id,
        billing_status = coalesce(billing, public.subscriptions.billing_status),
        updated_at = now();
  perform public.write_audit(org, 'plan.changed', 'subscription', org::text,
    jsonb_build_object('from', previous, 'to', plan, 'billing', billing));
end;
$$;

create function public.admin_set_policy(policy text, is_active boolean, new_config jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.policies set active = is_active, config = coalesce(new_config, config) where id = policy;
  if not found then raise exception 'invalid_policy' using errcode = 'P0001'; end if;
end;
$$;

-- O alerta de consumo passa a usar o percentual configurado na política usage_alert.
create or replace function public.consume_document(org uuid, origin text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  month text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  total_limit integer := public.entitlement_int(org, 'documents_total');
  month_limit integer := public.entitlement_int(org, 'documents_month');
  used_total integer;
  used_month integer;
  sub_status text;
  alert_pct numeric := (select (config->>'percent')::numeric / 100 from public.policies
                         where id = 'usage_alert' and active);
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

  -- Alerta no percentual da política usage_alert (padrão 80%), uma vez por período.
  if alert_pct is not null and (
       (total_limit is not null and used_total + 1 = ceil(total_limit * alert_pct))
       or (month_limit is not null and used_month + 1 = ceil(month_limit * alert_pct))) then
    insert into public.policy_events (organization_id, policy_id, data)
      values (org, 'usage_alert', jsonb_build_object('metric', 'documents', 'period', month));
  end if;
  return true;
end;
$$;

revoke execute on function public.admin_overview(), public.admin_set_plan(uuid, text, text),
  public.admin_set_policy(text, boolean, jsonb) from public, anon;
grant execute on function public.admin_overview(), public.admin_set_plan(uuid, text, text),
  public.admin_set_policy(text, boolean, jsonb) to authenticated;
