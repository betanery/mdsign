-- MDSign — a API (chave da organização, sem login) também consulta o consumo do plano.
create or replace function public.org_usage(org uuid)
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
  where s.organization_id = org
    and (public.is_org_member(org) or public.is_platform_admin() or auth.role() = 'service_role');
$$;
