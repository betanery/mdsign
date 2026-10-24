-- MDSign — lançamento comercial: 4 planos (Cedro, Jacarandá, Ipê e Mogno). Só acréscimos.
--
-- - Angico e Aroeira saem do catálogo (is_public = false). As linhas continuam, porque versões
--   antigas da matriz e o histórico apontam para elas; nenhuma organização usa esses planos.
-- - O Ipê passa a ser o plano de empresa: R$ 99,97, 4 usuários, documentos ilimitados.
-- - A matriz nova nasce em RASCUNHO (lancamento_2026_11). Só vale depois que alguém publicar no
--   Super Admin; nada comercial muda sozinho com esta migração.
-- - Duas funcionalidades novas: aprovação em várias etapas (Cedro: 1 aprovador) e relatórios
--   avançados (filtros avançados e exportação gerencial). Na versão publicada hoje elas ficam
--   como já funcionavam, para nada mudar até a publicação.

-- 1. Catálogo -------------------------------------------------------------------------------------
update public.plans set is_public = false where id in ('angico', 'aroeira');
update public.plans set price_cents = 9997 where id = 'ipe';

-- 2. Funcionalidades novas ------------------------------------------------------------------------
insert into public.features (code, name, description, benefit, category, implementation, implementation_note,
  depends_on, permission, nav_keys, core, exclusive_plan, sort) values
  ('approval_multi', 'Aprovação em várias etapas',
   'Mais de um aprovador no mesmo documento, em ordem, antes das assinaturas.',
   'Validar o documento em vários níveis (jurídico, gestor, diretoria).',
   'produtividade', 'functional', 'Conferido no servidor ao criar o documento (create.ts).',
   '{e_signature}', 'documents.create', '{}', false, null, 35),
  ('reports_advanced', 'Relatórios avançados',
   'Filtros por origem, modelo, departamento, grupo e pasta, com exportação em Excel e PDF.',
   'Análises detalhadas e relatórios gerenciais consolidados.',
   'gestao', 'functional', 'Filtros avançados conferidos no org_report.',
   '{reports}', 'reports.export', '{}', false, null, 105)
on conflict (code) do nothing;
update public.features set name = 'Relatórios gerenciais',
  description = 'Painel com indicadores, filtros por período, situação e pessoa da equipe, e exportação em CSV.',
  benefit = 'Acompanhar a operação da equipe.'
  where code = 'reports';

-- Versões existentes: as novas funcionalidades seguem o comportamento de hoje (várias etapas
-- liberadas; relatórios avançados onde já havia relatórios).
insert into public.plan_version_features (version_id, plan_id, feature_code, mode)
select v.id, p.id, 'approval_multi', 'available'
from public.plan_versions v cross join public.plans p
on conflict do nothing;
insert into public.plan_version_features (version_id, plan_id, feature_code, mode)
select pf.version_id, pf.plan_id, 'reports_advanced', pf.mode
from public.plan_version_features pf where pf.feature_code = 'reports'
on conflict do nothing;

-- 3. Matriz de lançamento (rascunho) ----------------------------------------------------------------
insert into public.plan_versions (id, name, status, notes) values
  ('lancamento_2026_11', 'Lançamento: Cedro, Jacarandá, Ipê e Mogno', 'draft',
   'Cedro grátis (5 por pessoa), Jacarandá R$ 39,90 (50/mês, 1 usuário), Ipê R$ 99,97 (4 usuários, '
   'ilimitado), Mogno sob contrato. Angico e Aroeira fora do catálogo.')
on conflict (id) do nothing;

insert into public.plan_version_prices (version_id, plan_id, price_cents, period, description, audience,
  benefits, highlight, cta, sort, is_public) values
  ('lancamento_2026_11', 'cedro', 0, 'one_time', 'Experimente gratuitamente.',
   'Quem quer conhecer o MDSign sem compromisso.',
   jsonb_build_array('5 documentos grátis', 'Assinatura eletrônica', 'Aprovação e assinatura em ordem'),
   false, 'Começar grátis', 1, true),
  ('lancamento_2026_11', 'jacaranda', 3990, 'month', 'Para profissionais.',
   'Quem envia e assina documentos com frequência.',
   jsonb_build_array('50 documentos por mês', 'Modelos reutilizáveis', 'Aprovação em várias etapas'),
   false, 'Assinar', 2, true),
  ('lancamento_2026_11', 'ipe', 9997, 'month', 'Para empresas e equipes.',
   'Empresas que trabalham em equipe e acompanham processos juntas.',
   jsonb_build_array('Documentos ilimitados', 'Até 4 usuários', 'Permissões e relatórios gerenciais'),
   true, 'Assinar', 3, true),
  ('lancamento_2026_11', 'mogno', null, 'contract', 'Para operações corporativas.',
   'Empresas que integram sistemas e precisam de condições sob contrato.',
   jsonb_build_array('API e Webhooks', 'Envio em massa e relatórios avançados', 'Capacidade sob contrato'),
   false, 'Falar com especialista', 4, true),
  -- Fora do catálogo (a publicação exige todos os planos; ficam ocultos).
  ('lancamento_2026_11', 'angico', 9997, 'month', 'Fora do catálogo.', null, '[]'::jsonb, false, 'Assinar', 90, false),
  ('lancamento_2026_11', 'aroeira', 14997, 'month', 'Fora do catálogo.', null, '[]'::jsonb, false, 'Assinar', 91, false)
on conflict do nothing;

insert into public.plan_version_entitlements (version_id, plan_id, key, value_int, value_bool) values
  ('lancamento_2026_11', 'cedro', 'documents_total', 5, null),
  ('lancamento_2026_11', 'cedro', 'users_max', 1, null),
  ('lancamento_2026_11', 'cedro', 'signature_certificate', null, false),
  ('lancamento_2026_11', 'jacaranda', 'documents_month', 50, null),
  ('lancamento_2026_11', 'jacaranda', 'users_max', 1, null),
  ('lancamento_2026_11', 'jacaranda', 'signature_certificate', null, true),
  ('lancamento_2026_11', 'ipe', 'users_max', 4, null),
  ('lancamento_2026_11', 'ipe', 'signature_certificate', null, true),
  ('lancamento_2026_11', 'mogno', 'signature_certificate', null, true),
  ('lancamento_2026_11', 'mogno', 'integrations_access', null, true),
  ('lancamento_2026_11', 'angico', 'users_max', 4, null),
  ('lancamento_2026_11', 'aroeira', 'users_max', 6, null)
on conflict do nothing;

-- Disponível / prévia (aparece com cadeado e convite para subir de plano) / oculto / contrato.
insert into public.plan_version_features (version_id, plan_id, feature_code, mode)
select 'lancamento_2026_11', m.plan_id, m.code, m.mode from (values
  ('cedro','dashboard','available'), ('jacaranda','dashboard','available'), ('ipe','dashboard','available'), ('mogno','dashboard','available'),
  ('cedro','documents','available'), ('jacaranda','documents','available'), ('ipe','documents','available'), ('mogno','documents','available'),
  ('cedro','e_signature','available'), ('jacaranda','e_signature','available'), ('ipe','e_signature','available'), ('mogno','e_signature','available'),
  ('cedro','contacts','available'), ('jacaranda','contacts','available'), ('ipe','contacts','available'), ('mogno','contacts','available'),
  ('cedro','certificate_signature','preview'), ('jacaranda','certificate_signature','available'), ('ipe','certificate_signature','available'), ('mogno','certificate_signature','available'),
  ('cedro','approval_multi','preview'), ('jacaranda','approval_multi','available'), ('ipe','approval_multi','available'), ('mogno','approval_multi','available'),
  ('cedro','templates','preview'), ('jacaranda','templates','available'), ('ipe','templates','available'), ('mogno','templates','available'),
  ('cedro','team','preview'), ('jacaranda','team','preview'), ('ipe','team','available'), ('mogno','team','available'),
  ('cedro','advanced_management','hidden'), ('jacaranda','advanced_management','preview'), ('ipe','advanced_management','available'), ('mogno','advanced_management','available'),
  ('cedro','forms','hidden'), ('jacaranda','forms','preview'), ('ipe','forms','available'), ('mogno','forms','available'),
  ('cedro','whatsapp','hidden'), ('jacaranda','whatsapp','preview'), ('ipe','whatsapp','available'), ('mogno','whatsapp','available'),
  ('cedro','reports','hidden'), ('jacaranda','reports','preview'), ('ipe','reports','available'), ('mogno','reports','available'),
  ('cedro','reports_advanced','hidden'), ('jacaranda','reports_advanced','hidden'), ('ipe','reports_advanced','preview'), ('mogno','reports_advanced','available'),
  ('cedro','bulk_send','hidden'), ('jacaranda','bulk_send','hidden'), ('ipe','bulk_send','preview'), ('mogno','bulk_send','available'),
  ('cedro','api_webhooks','hidden'), ('jacaranda','api_webhooks','hidden'), ('ipe','api_webhooks','preview'), ('mogno','api_webhooks','available')
) as m(plan_id, code, mode)
on conflict do nothing;
-- Planos fora do catálogo: mesma matriz do Ipê (ninguém usa; só para a versão ficar completa).
insert into public.plan_version_features (version_id, plan_id, feature_code, mode)
select 'lancamento_2026_11', x.plan_id, pf.feature_code, pf.mode
from public.plan_version_features pf cross join (values ('angico'), ('aroeira')) as x(plan_id)
where pf.version_id = 'lancamento_2026_11' and pf.plan_id = 'ipe'
on conflict do nothing;

-- 4. Relatórios: filtros avançados só com relatórios avançados ------------------------------------------
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
  -- Filtros avançados (origem, modelo, departamento, grupo e pasta) só no plano com relatórios
  -- avançados. Período, situação e pessoa da equipe valem para os relatórios gerenciais básicos.
  if (f ?| array['origin', 'template', 'unit', 'group', 'folder'])
     and not public.feature_enabled(org, 'reports_advanced') then
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
