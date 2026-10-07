-- MDSign — Super Admin v2: saúde da plataforma, suspensão/reativação com auditoria, histórico
-- das ações administrativas e políticas auditadas. E CPF/celular dos membros ao adicionar um
-- grupo como participante. Tudo verificado no banco (is_platform_admin / permissão da org).

-- 1. Saúde da plataforma: filas, falhas e agendadores (sem dados pessoais).
create function public.admin_health()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'documents_pending', (select count(*) from public.documents
      where status = 'pending' and deleted_at is null),
    'documents_today', (select count(*) from public.documents
      where created_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
    'notifications_pending', (select count(*) from public.notifications where status = 'pending'),
    'notifications_failed_24h', (select count(*) from public.notifications
      where status = 'failed' and created_at > now() - interval '24 hours'),
    'webhooks_pending', (select count(*) from public.webhook_deliveries where status = 'pending'),
    'webhooks_failed_24h', (select count(*) from public.webhook_deliveries
      where status = 'failed' and created_at > now() - interval '24 hours'),
    'billing_events_pending', (select count(*) from public.billing_events where processed_at is null),
    'bulk_stuck', (select count(*) from public.bulk_jobs
      where status = 'sending' and updated_at < now() - interval '1 hour'),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', j.jobname,
        'active', j.active,
        'last_run', (select max(r.start_time) from cron.job_run_details r where r.jobid = j.jobid),
        'last_status', (select r.status from cron.job_run_details r where r.jobid = j.jobid
                         order by r.start_time desc limit 1),
        'failed_24h', (select count(*) from cron.job_run_details r where r.jobid = j.jobid
                        and r.status = 'failed' and r.start_time > now() - interval '24 hours'))
        order by j.jobname)
      from cron.job j where j.jobname like 'mdsign-%'), '[]'::jsonb)
  ) into out;
  return out;
end;
$$;

-- 2. Suspender / reativar uma organização (bloqueia novos documentos; nada é apagado).
create function public.admin_set_subscription_status(org uuid, new_status text)
returns void
language plpgsql security definer set search_path = '' as $$
declare previous text;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if new_status not in ('active', 'suspended') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  select status into previous from public.subscriptions where organization_id = org;
  if previous is null then raise exception 'invalid_request' using errcode = 'P0001'; end if;
  update public.subscriptions
    set status = new_status,
        past_due_since = case when new_status = 'active' then null else past_due_since end,
        updated_at = now()
    where organization_id = org;
  perform public.write_audit(org,
    case when new_status = 'active' then 'subscription.reactivated' else 'subscription.suspended' end,
    'subscription', org::text, jsonb_build_object('from', previous, 'to', new_status));
end;
$$;

-- 3. Políticas: valida os números e registra quem alterou.
create or replace function public.admin_set_policy(policy text, is_active boolean, new_config jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  previous jsonb;
  k text;
  v jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object('active', active, 'config', config) into previous
    from public.policies where id = policy;
  if previous is null then raise exception 'invalid_policy' using errcode = 'P0001'; end if;
  if new_config is not null then
    if jsonb_typeof(new_config) <> 'object' then
      raise exception 'invalid_policy' using errcode = 'P0001';
    end if;
    for k, v in select * from jsonb_each(new_config) loop
      if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > 100000 then
        raise exception 'invalid_policy' using errcode = 'P0001';
      end if;
    end loop;
  end if;
  update public.policies set active = is_active, config = coalesce(new_config, config) where id = policy;
  perform public.write_audit(null, 'policy.changed', 'policy', policy,
    jsonb_build_object('from', previous, 'to',
      jsonb_build_object('active', is_active, 'config', coalesce(new_config, previous->'config'))));
end;
$$;

-- 4. Histórico das ações administrativas (plano, cobrança, suspensão, políticas).
create function public.admin_activity(lim integer default 50)
returns table (id bigint, created_at timestamptz, action text, organization_name text,
  actor_email text, entity_id text, data jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select a.id, a.created_at, a.action, o.name, u.email::text, a.entity_id, a.data
  from public.audit_log a
  left join public.organizations o on o.id = a.organization_id
  left join auth.users u on u.id = a.actor_id
  where a.action in ('plan.changed', 'subscription.suspended', 'subscription.reactivated',
    'policy.changed')
  order by a.created_at desc
  limit least(greatest(coalesce(lim, 50), 1), 200);
end;
$$;

-- 5. Grupo como participante: CPF e celular do cadastro de cada membro, para quem pode enviar.
create function public.group_member_identities(grp uuid)
returns table (user_id uuid, full_name text, email text, cpf text, no_cpf boolean, phone text)
language plpgsql stable security definer set search_path = '' as $$
declare org uuid;
begin
  select g.organization_id into org from public.org_groups g where g.id = grp;
  if org is null or not public.has_org_permission(org, 'documents.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select m.user_id, p.full_name, u.email::text, p.cpf, coalesce(p.no_cpf, false), p.phone
  from public.org_group_members gm
  join public.memberships m on m.user_id = gm.user_id and m.organization_id = org
    and m.status = 'active'
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where gm.group_id = grp;
end;
$$;

revoke execute on function public.admin_health(), public.admin_set_subscription_status(uuid, text),
  public.admin_activity(integer), public.group_member_identities(uuid) from public, anon;
grant execute on function public.admin_health(), public.admin_set_subscription_status(uuid, text),
  public.admin_activity(integer), public.group_member_identities(uuid) to authenticated;
