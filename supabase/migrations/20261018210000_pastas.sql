-- MDSign: pastas de documentos (organizam documentos; Departamentos continuam organizando
-- pessoas). Ficam só no MDSign (o motor não é alterado). Só acréscimos.

create table public.document_folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index document_folders_name_idx on public.document_folders (organization_id, lower(btrim(name)));
alter table public.document_folders enable row level security;

-- Todos da organização veem as pastas; quem gerencia documentos cria, renomeia e apaga.
create policy document_folders_select on public.document_folders for select
  to authenticated using (public.is_org_member(organization_id));
create policy document_folders_insert on public.document_folders for insert
  to authenticated with check (public.has_org_permission(organization_id, 'documents.manage')
                               and created_by = auth.uid());
create policy document_folders_update on public.document_folders for update
  to authenticated using (public.has_org_permission(organization_id, 'documents.manage'))
  with check (public.has_org_permission(organization_id, 'documents.manage'));
create policy document_folders_delete on public.document_folders for delete
  to authenticated using (public.has_org_permission(organization_id, 'documents.manage'));

-- Pasta do documento: apagar a pasta deixa os documentos "sem pasta".
alter table public.documents
  add column if not exists folder_id uuid references public.document_folders (id) on delete set null;
create index documents_folder_idx on public.documents (folder_id) where folder_id is not null;

-- Mover documentos: cada um precisa ser da organização, visível e do próprio autor (ou quem
-- gerencia documentos). Devolve quantos foram movidos.
create function public.move_documents(org uuid, ids uuid[], folder uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare moved integer;
begin
  if not public.is_org_member(org) then raise exception 'forbidden' using errcode = '42501'; end if;
  if folder is not null and not exists (
    select 1 from public.document_folders where id = folder and organization_id = org) then
    raise exception 'folder_not_found' using errcode = 'P0002';
  end if;
  if coalesce(array_length(ids, 1), 0) > 200 then raise exception 'invalid_request' using errcode = 'P0001'; end if;
  update public.documents d set folder_id = folder
  where d.id = any(ids) and d.organization_id = org and d.deleted_at is null
    and public.can_view_document(d.id)
    and (d.created_by = auth.uid() or public.has_org_permission(org, 'documents.manage'));
  get diagnostics moved = row_count;
  if moved > 0 then
    perform public.write_audit(org, 'documents.moved', 'document_folder', coalesce(folder::text, 'none'),
      jsonb_build_object('count', moved));
  end if;
  return moved;
end;
$$;
revoke execute on function public.move_documents(uuid, uuid[], uuid) from public, anon;
grant execute on function public.move_documents(uuid, uuid[], uuid) to authenticated;

-- Relatórios: novo filtro "Pasta" (mesma função, com uma condição a mais).
create or replace function public.org_report(org uuid, date_from timestamp with time zone, date_to timestamp with time zone, f jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  result jsonb;
begin
  if not public.is_org_member(org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Relatórios avançados dependem do plano (navegação progressiva no banco, não só no menu).
  if not public.feature_enabled(org, 'reports') then
    raise exception 'feature_not_in_plan' using errcode = '42501';
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
      -- Pasta: "none" = documentos sem pasta.
      and (f->>'folder' is null
           or (f->>'folder' = 'none' and d.folder_id is null)
           or d.folder_id::text = f->>'folder')
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
$function$;
