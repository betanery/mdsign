-- MDSign — Encerramento de conta (Termos, seção 7): o proprietário encerra a organização;
-- há 30 dias para exportar (e para desfazer); no 60º dia o MDSign apaga os dados operacionais.
-- Os documentos assinados e as evidências continuam guardados no motor de assinatura (diretriz
-- de 5 anos), sem acesso do cliente. Documentos, participantes, eventos, auditoria e dados de
-- cobrança ficam no banco como registro das evidências e obrigações legais.

alter table public.organizations
  add column closed_at timestamptz,
  add column closed_by uuid references auth.users (id) on delete set null,
  add column export_until timestamptz,
  add column purge_after timestamptz,
  add column purged_at timestamptz;

-- Conta encerrada há mais de 30 dias: ninguém mais acessa (o RLS inteiro depende destas duas).
create or replace function public.org_accessible(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select o.export_until is null or o.export_until > now()
                   from public.organizations o where o.id = org), false);
$$;

create or replace function public.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships
    where organization_id = org and user_id = auth.uid() and status = 'active'
  ) and public.org_accessible(org);
$$;

create or replace function public.has_org_permission(org uuid, perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role = m.role
    where m.organization_id = org and m.user_id = auth.uid()
      and m.status = 'active' and rp.permission = perm
  ) and public.org_accessible(org);
$$;

-- Encerrar (só o proprietário, confirmando o nome). A assinatura paga é cancelada pela função.
create function public.close_organization(org uuid, confirm_name text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  if public.org_role_of(org) is distinct from 'owner' or not public.is_org_member(org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into o from public.organizations where id = org for update;
  if o.closed_at is not null then raise exception 'organization_closed' using errcode = 'P0001'; end if;
  if lower(trim(confirm_name)) is distinct from lower(trim(o.name)) then
    raise exception 'confirm_name_mismatch' using errcode = 'P0001';
  end if;
  update public.organizations
    set closed_at = now(), closed_by = auth.uid(),
        export_until = now() + interval '30 days', purge_after = now() + interval '60 days'
    where id = org;
  perform public.write_audit(org, 'organization.closed', 'organization', org::text,
    jsonb_build_object('export_until', now() + interval '30 days',
                       'purge_after', now() + interval '60 days'));
  return now() + interval '30 days';
end;
$$;

-- Desfazer nos 30 dias: volta ao Cedro (plano pago precisa ser contratado de novo).
create function public.reopen_organization(org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.org_role_of(org) is distinct from 'owner' or not public.is_org_member(org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations where id = org and closed_at is not null) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update public.organizations
    set closed_at = null, closed_by = null, export_until = null, purge_after = null
    where id = org;
  update public.subscriptions
    set plan_id = 'cedro', status = 'active', billing_status = 'free', provider = 'internal',
        cancel_at = null, asaas_subscription_id = null, next_due_date = null, updated_at = now()
    where organization_id = org and plan_id <> 'cedro';
  perform public.write_audit(org, 'organization.reopened', 'organization', org::text, '{}'::jsonb);
end;
$$;

revoke execute on function public.close_organization(uuid, text), public.reopen_organization(uuid)
  from public, anon;
grant execute on function public.close_organization(uuid, text), public.reopen_organization(uuid)
  to authenticated;
revoke execute on function public.org_accessible(uuid) from public, anon;
grant execute on function public.org_accessible(uuid) to authenticated, service_role;

-- Conta encerrada não cria documentos.
create or replace function public.org_closed(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organizations where id = org and closed_at is not null);
$$;

do $$
declare src text;
begin
  -- consume_document: mesma função, com a checagem de conta encerrada no início.
  select pg_get_functiondef('public.consume_document(uuid, text)'::regprocedure) into src;
  src := replace(src,
    'if sub_status in (''suspended'', ''canceled'') then return false; end if;',
    'if sub_status in (''suspended'', ''canceled'') or public.org_closed(org) then return false; end if;');
  execute src;
end $$;

-- Na janela de exportação, todo documento fica disponível para download (inclusive Cedro).
create or replace function public.document_available_until(doc uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select case
    when o.closed_at is not null then o.export_until
    when s.plan_id = 'cedro' and p.active then
      d.created_at + make_interval(months => coalesce((p.config->>'months')::int, 6))
  end
  from public.documents d
  join public.organizations o on o.id = d.organization_id
  join public.subscriptions s on s.organization_id = d.organization_id
  left join public.policies p on p.id = 'cedro_availability'
  where d.id = doc and (public.can_view_document(doc) or auth.role() = 'service_role');
$$;

-- 60º dia: apaga os dados operacionais. Os arquivos do Storage são apagados pela função.
create function public.purge_organization(org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.organizations where id = org
                 and purge_after <= now() and purged_at is null) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  delete from public.sign_links where organization_id = org;
  delete from public.notifications where organization_id = org;
  delete from public.notification_settings where organization_id = org;
  delete from public.whatsapp_opt_outs where organization_id = org;
  delete from public.delegations where organization_id = org;
  delete from public.org_group_members where organization_id = org;
  delete from public.org_groups where organization_id = org;
  delete from public.webhook_deliveries where organization_id = org;
  delete from public.webhook_endpoints where organization_id = org;
  delete from public.api_requests where organization_id = org;
  delete from public.api_keys where organization_id = org;
  delete from public.bulk_items where organization_id = org;
  delete from public.bulk_jobs where organization_id = org;
  delete from public.processes where organization_id = org;
  delete from public.forms where organization_id = org;
  delete from public.templates where organization_id = org;
  delete from public.contacts where organization_id = org;
  delete from public.org_qualification where organization_id = org;
  delete from public.invitations where organization_id = org;
  delete from public.memberships where organization_id = org;
  update public.organizations set purged_at = now() where id = org;
  perform public.write_audit_as(org, null, 'organization.purged', 'organization', org::text,
    '{"kept": ["documents", "participants", "events", "audit", "billing"]}'::jsonb);
end;
$$;
revoke execute on function public.purge_organization(uuid), public.org_closed(uuid)
  from public, anon, authenticated;
grant execute on function public.purge_organization(uuid), public.org_closed(uuid) to service_role;
