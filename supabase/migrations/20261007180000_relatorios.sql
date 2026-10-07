-- MDSign — Bloco D: relatórios. Só métricas com dado real (nada de "visualizado"/"entregue":
-- o motor não informa). SECURITY INVOKER: o RLS de cada tabela decide o que entra — quem só vê
-- os próprios documentos vê um relatório só dos próprios documentos.

-- 1. Origem e modelo gravados no documento (antes só na auditoria).
alter table public.documents
  add column origin text,
  add column template_id uuid references public.templates (id) on delete set null;
update public.documents d set origin = a.data->>'origin'
  from public.audit_log a
  where a.action = 'document.created' and a.entity_id = d.id::text and d.origin is null;
update public.documents set origin = case kind when 'self' then 'self' else 'send' end
  where origin is null;
create index documents_report_idx on public.documents (organization_id, created_at)
  where deleted_at is null;

-- 2. Relatório: um JSON com todas as seções, para o período e os filtros.
--    f: { user, unit, group, status, origin, template } (todos opcionais).
create function public.org_report(org uuid, date_from timestamptz, date_to timestamptz, f jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  result jsonb;
begin
  if not public.is_org_member(org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with docs as (
    select d.* from public.documents d
    where d.organization_id = org and d.deleted_at is null
      and d.created_at >= date_from and d.created_at < date_to
      and (f->>'user' is null or d.created_by = (f->>'user')::uuid)
      and (f->>'status' is null or d.status::text = f->>'status')
      and (f->>'origin' is null or d.origin = f->>'origin')
      and (f->>'template' is null or d.template_id = (f->>'template')::uuid)
      and (f->>'unit' is null or exists (select 1 from public.memberships m
             where m.organization_id = org and m.user_id = d.created_by
               and m.unit_id = (f->>'unit')::uuid))
      and (f->>'group' is null or exists (select 1 from public.org_group_members g
             where g.group_id = (f->>'group')::uuid and g.user_id = d.created_by))
  ),
  parts as (
    select p.*, d.created_at as doc_created, d.status as doc_status, d.name as doc_name
    from public.document_participants p join docs d on d.id = p.document_id
  ),
  -- "Desde quando é a vez": conclusão da etapa anterior ou o envio do documento.
  pending as (
    select p.*, coalesce((select max(x.completed_at) from parts x
                          where x.document_id = p.document_id and x.step < p.step), p.doc_created) as since
    from parts p where p.status = 'pending' and p.doc_status = 'pending'
  ),
  bulk as (
    select b.* from public.bulk_jobs b
    where b.organization_id = org and b.created_at >= date_from and b.created_at < date_to
      and (f->>'user' is null or b.created_by = (f->>'user')::uuid)
      and (f->>'template' is null or b.template_id = (f->>'template')::uuid)
  ),
  bitems as (
    select i.status, d.status as doc_status from public.bulk_items i
    join bulk b on b.id = i.job_id
    left join public.documents d on d.id = i.document_id
  )
  select jsonb_build_object(
    'documents', jsonb_build_object(
      'created', (select count(*) from docs),
      'sent', (select count(*) from docs where kind = 'send'),
      'waiting_signature', (select count(distinct document_id) from pending where role <> 'approver'),
      'waiting_approval', (select count(distinct document_id) from pending where role = 'approver'),
      'concluded', (select count(*) from docs where status = 'concluded'),
      'refused', (select count(*) from docs where status = 'refused'),
      'canceled', (select count(*) from docs where status = 'canceled'),
      'expired', (select count(*) from docs where status = 'expired'),
      'errors', (select count(*) from bitems where status = 'failed'),
      'by_origin', coalesce((select jsonb_object_agg(origin, n) from
        (select coalesce(origin, 'send') origin, count(*) n from docs group by 1) o), '{}'::jsonb)
    ),
    'signatures', jsonb_build_object(
      'signed', (select count(*) from parts where role <> 'approver' and status = 'completed'),
      'approved', (select count(*) from parts where role = 'approver' and status = 'completed'),
      'pending', (select count(*) from pending),
      'avg_hours', (select round(extract(epoch from avg(completed_at - doc_created)) / 3600, 1)
                    from parts where status = 'completed' and completed_at is not null),
      'completion_rate', (select case when count(*) filter (where kind = 'send') = 0 then null
        else round(100.0 * count(*) filter (where kind = 'send' and status = 'concluded')
                   / count(*) filter (where kind = 'send'), 1) end from docs)
    ),
    'pending', jsonb_build_object(
      'count', (select count(*) from pending),
      'oldest', coalesce((select jsonb_agg(row_to_json(x)) from (
        select p.name, p.email, p.role, p.document_id, p.doc_name, p.since,
               round(extract(epoch from now() - p.since) / 86400, 1) as days, p.reminder_count
        from pending p order by p.since limit 50) x), '[]'::jsonb),
      'by_unit', coalesce((select jsonb_agg(row_to_json(x)) from (
        select coalesce(u.name, '—') as name, count(*) as n
        from pending p
        left join public.memberships m on m.organization_id = org and m.user_id = p.user_id
        left join public.organization_units u on u.id = m.unit_id
        group by 1 order by 2 desc) x), '[]'::jsonb),
      'by_group', coalesce((select jsonb_agg(row_to_json(x)) from (
        select g.name, count(*) as n from pending p
        join public.org_group_members gm on gm.user_id = p.user_id
        join public.org_groups g on g.id = gm.group_id and g.organization_id = org
        group by 1 order by 2 desc) x), '[]'::jsonb)
    ),
    'bulk', jsonb_build_object(
      'jobs', (select count(*) from bulk),
      'items', (select count(*) from bitems),
      'sent', (select count(*) from bitems where status = 'sent'),
      'signed', (select count(*) from bitems where doc_status = 'concluded'),
      'pending', (select count(*) from bitems where status = 'sent' and doc_status = 'pending'),
      'errors', (select count(*) from bitems where status = 'failed'),
      'success_rate', (select case when count(*) filter (where status in ('sent', 'failed')) = 0
        then null else round(100.0 * count(*) filter (where status = 'sent')
             / count(*) filter (where status in ('sent', 'failed')), 1) end from bitems)
    ),
    'usage', jsonb_build_object(
      'consumed', coalesce((select jsonb_object_agg(period, value) from public.usage_counters
        where organization_id = org and metric = 'documents' and period <> 'total'
          and period >= to_char(date_from at time zone 'America/Sao_Paulo', 'YYYY-MM')
          and period <= to_char((date_to - interval '1 second') at time zone 'America/Sao_Paulo', 'YYYY-MM')),
        '{}'::jsonb),
      'active_users', (select count(distinct created_by) from docs),
      'members', (select count(*) from public.memberships where organization_id = org and status = 'active'),
      'by_day', coalesce((select jsonb_object_agg(day, n) from (
        select to_char(created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as day, count(*) as n
        from docs group by 1) x), '{}'::jsonb)
    )
  ) into result;
  return result;
end;
$$;
revoke execute on function public.org_report(uuid, timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.org_report(uuid, timestamptz, timestamptz, jsonb) to authenticated;
