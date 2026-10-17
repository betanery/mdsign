-- MDSign — Etapa 3: "Meu plano", eventos de contratação com origem/destino e, no Growth,
-- funil de planos e painel de oportunidades. Só acréscimos; preços e franquias não mudam.

-- 1. Meu plano: o que está contratado (versão da organização), sem dados de outros clientes.
create function public.org_plan(org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  if not public.is_org_member(org) then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object('plan_id', s.plan_id, 'name', p.name, 'version', s.plan_version_id,
      'price_cents', vp.price_cents, 'period', coalesce(vp.period, 'month'),
      'value_cents', s.value_cents, 'billing_status', s.billing_status, 'status', s.status)
    into out
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  left join public.plan_version_prices vp on vp.version_id = s.plan_version_id and vp.plan_id = s.plan_id
  where s.organization_id = org;
  return out;
end;
$$;
revoke execute on function public.org_plan(uuid) from public, anon;
grant execute on function public.org_plan(uuid) to authenticated;

-- 2. Contratação: checkout iniciado e upgrade confirmado com plano de origem e de destino.
-- plan_upgraded vale 1 vez por contratação confirmada (antes: 1 vez por organização, o que
-- escondia o 2º upgrade). Pagamento só conta com a confirmação do servidor (status 'paid').
create or replace function public.growth_on_checkout() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.growth_mark(new.organization_id, new.created_by, 'upgrade_checkout_started',
      jsonb_build_object('plan', new.plan_id, 'from_plan', new.previous_plan_id, 'to_plan', new.plan_id,
        'checkout', new.id, 'environment', new.environment), false);
  elsif new.status = 'paid' and old.status is distinct from 'paid' then
    perform public.growth_mark(new.organization_id, new.created_by, 'checkout_completed',
      jsonb_build_object('plan', new.plan_id, 'checkout', new.id, 'environment', new.environment), false);
    if not exists (select 1 from public.growth_events g where g.event = 'plan_upgraded'
                   and g.data ->> 'checkout' = new.id::text) then
      perform public.growth_mark(new.organization_id, new.created_by, 'plan_upgraded',
        jsonb_build_object('plan', new.plan_id, 'from_plan', new.previous_plan_id, 'to_plan', new.plan_id,
          'checkout', new.id, 'environment', new.environment), false);
    end if;
  end if;
  return new;
end;
$$;

-- 3. Growth → funil de planos (por pessoa cadastrada no período) -----------------------------
-- Cadastro → 1º documento → 3 documentos → 5 documentos → viu oferta → iniciou checkout →
-- contratação confirmada. Mesma população em todas as etapas; checkout não é pagamento.
create function public.admin_growth_plan_funnel(f jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p jsonb := public.growth_filters(f);
  d_from timestamptz := (p ->> 'from')::timestamptz;
  d_to timestamptz := (p ->> 'to')::timestamptz;
  inc boolean := (p ->> 'internal')::boolean;
  last_model boolean := p ->> 'model' = 'last';
  feat text := nullif(left(f ->> 'feature', 40), '');
  out jsonb;
begin
  perform public.growth_require_admin();
  with base as (
    select x.*,
      case when last_model then x.last_source else x.first_source end as src,
      case when last_model then x.last_campaign else x.first_campaign end as camp,
      array(select o.id from public.organizations o where o.created_by = x.user_id) as orgs
    from public.growth_people(inc) x
    where x.created_at >= d_from and x.created_at < d_to
  ),
  c as (
    select b.*,
      exists (select 1 from public.growth_events g where g.organization_id = any(b.orgs) and g.event = 'first_document_created') as first_doc,
      (b.docs_used >= 3 or exists (select 1 from public.growth_events g where g.organization_id = any(b.orgs)
        and g.event in ('cedro_usage_3_of_5', 'free_document_3_used'))) as three_docs,
      (b.docs_used >= 5 or exists (select 1 from public.growth_events g where g.organization_id = any(b.orgs)
        and g.event in ('cedro_limit_reached', 'free_document_5_used'))) as five_docs,
      exists (select 1 from public.growth_events g where g.organization_id = any(b.orgs)
        and g.event in ('upgrade_offer_viewed', 'feature_preview_viewed')) as offer,
      exists (select 1 from public.growth_events g where g.organization_id = any(b.orgs)
        and g.event in ('checkout_started', 'upgrade_checkout_started')) as checkout,
      exists (select 1 from public.growth_events g where g.organization_id = any(b.orgs)
        and g.event in ('paid_plan_activated', 'plan_upgraded')) as paid
    from base b
    where (p ->> 'source' is null or b.src = p ->> 'source')
      and (p ->> 'campaign' is null or b.camp = p ->> 'campaign')
      and (p ->> 'plan' is null or b.plan_id = p ->> 'plan')
      and (feat is null or exists (select 1 from public.growth_events g where g.organization_id = any(b.orgs)
        and g.event in ('feature_preview_viewed', 'locked_feature_clicked') and g.data ->> 'feature' = feat))
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', d_from, 'to', d_to, 'model', p ->> 'model', 'internal', inc),
    'steps', jsonb_build_object(
      'signups', (select count(*) from c),
      'first_document', (select count(*) from c where first_doc),
      'three_documents', (select count(*) from c where three_docs),
      'five_documents', (select count(*) from c where five_docs),
      'offer_viewed', (select count(*) from c where offer),
      'checkout_started', (select count(*) from c where checkout),
      'paid', (select count(*) from c where paid)),
    'features', (select coalesce(jsonb_agg(distinct g.data ->> 'feature'), '[]'::jsonb) from public.growth_events g
      where g.event in ('feature_preview_viewed', 'locked_feature_clicked') and g.data ? 'feature')
  ) into out;
  return out;
end;
$$;

-- 4. Growth → oportunidades de upgrade (eventos do período; sem mudar plano de ninguém) ---------
create function public.admin_growth_upgrade_insights(f jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p jsonb := public.growth_filters(f);
  d_from timestamptz := (p ->> 'from')::timestamptz;
  d_to timestamptz := (p ->> 'to')::timestamptz;
  inc boolean := (p ->> 'internal')::boolean;
  out jsonb;
begin
  perform public.growth_require_admin();
  with ev as (
    select g.* from public.growth_events g
    left join public.organizations o on o.id = g.organization_id
    where g.created_at >= d_from and g.created_at < d_to
      and (inc or not public.growth_internal_user(coalesce(o.created_by, g.user_id)))
      and g.event in ('feature_preview_viewed', 'locked_feature_clicked', 'upgrade_cta_clicked',
        'upgrade_offer_viewed', 'checkout_started', 'upgrade_checkout_started', 'paid_plan_activated', 'plan_upgraded')
  ),
  -- Organizações que estavam no Cedro no período (base da conversão Cedro → Jacarandá).
  cedro as (
    select distinct t.organization_id from public.subscription_terms t
    join public.organizations o on o.id = t.organization_id
    where t.plan_id = 'cedro' and t.accepted_at < d_to
      and (inc or not public.growth_internal_user(o.created_by))
  )
  select jsonb_build_object(
    'locked_clicks', coalesce((select jsonb_agg(r order by r.n desc) from (
        select data ->> 'feature' as feature, count(*) n from ev where event = 'locked_feature_clicked' group by 1) r), '[]'::jsonb),
    'previews', coalesce((select jsonb_agg(r order by r.n desc) from (
        select data ->> 'feature' as feature, count(*) n from ev where event = 'feature_preview_viewed' group by 1) r), '[]'::jsonb),
    'plans_sought', coalesce((select jsonb_agg(r order by r.n desc) from (
        select coalesce(data ->> 'to_plan', data ->> 'plan') as plan, count(*) n from ev
        where event in ('upgrade_cta_clicked', 'checkout_started', 'upgrade_checkout_started')
          and coalesce(data ->> 'to_plan', data ->> 'plan') is not null group by 1) r), '[]'::jsonb),
    'upgrade_clicks', (select count(*) from ev where event = 'upgrade_cta_clicked'),
    'offers_viewed', (select count(*) from ev where event in ('upgrade_offer_viewed', 'feature_preview_viewed')),
    'checkouts', (select count(*) from ev where event in ('checkout_started', 'upgrade_checkout_started')),
    'confirmed', (select count(*) from ev where event in ('paid_plan_activated', 'plan_upgraded')),
    'confirmed_environment', (select string_agg(distinct coalesce(data ->> 'environment', 'sandbox'), ',') from ev
      where event in ('paid_plan_activated', 'plan_upgraded')),
    'cedro_base', (select count(*) from cedro),
    'cedro_to_jacaranda', (select count(*) from ev where event = 'plan_upgraded'
      and data ->> 'from_plan' = 'cedro' and data ->> 'to_plan' = 'jacaranda'),
    'paid_transitions', coalesce((select jsonb_agg(r order by r.n desc) from (
        select data ->> 'from_plan' as from_plan, data ->> 'to_plan' as to_plan, count(*) n from ev
        where event = 'plan_upgraded' and data ->> 'from_plan' is not null group by 1, 2) r), '[]'::jsonb),
    'unknown_origin_upgrades', (select count(*) from ev where event in ('paid_plan_activated', 'plan_upgraded')
      and data ->> 'from_plan' is null)
  ) into out;
  return out;
end;
$$;

do $$
declare fn regprocedure;
begin
  for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('admin_growth_plan_funnel', 'admin_growth_upgrade_insights')
  loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
