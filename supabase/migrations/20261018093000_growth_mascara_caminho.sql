-- MDSign — Growth & Aquisição: códigos de acesso (convite, link seguro, formulário) nunca aparecem
-- nos relatórios. A partir de agora o navegador já envia o caminho mascarado; aqui a leitura
-- mascara também os registros antigos, sem alterar o dado gravado.

create function public.growth_clean_path(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(p, '/(invite|s|f)/[^/?#]+', '/\1/:codigo');
$$;
revoke execute on function public.growth_clean_path(text) from public, anon, authenticated;

create or replace function public.growth_people(include_internal boolean default false)
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
    public.growth_clean_path(b.landing_page),
    case when b.stale then 'nao_identificada'
      else public.growth_origin(coalesce(b.last_utm_source, b.utm_source), coalesce(b.last_referrer, b.referrer)) end,
    case when b.stale then null else coalesce(b.last_utm_medium, b.utm_medium) end,
    case when b.stale then null else coalesce(b.last_utm_campaign, b.utm_campaign, b.campaign) end,
    case when b.stale then null else public.growth_clean_path(coalesce(b.last_landing_page, b.landing_page)) end,
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

create or replace function public.admin_growth_timeline(usr uuid default null, org uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  perform public.growth_require_admin();
  if usr is null and org is null then raise exception 'invalid_request' using errcode = 'P0001'; end if;
  select jsonb_build_object(
    'acquisition', (select to_jsonb(a) - 'user_id' - 'session_id'
        || jsonb_build_object('landing_page', public.growth_clean_path(a.landing_page),
                              'last_landing_page', public.growth_clean_path(a.last_landing_page))
      from public.user_acquisition a where a.user_id = usr),
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
