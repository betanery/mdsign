-- MDSign — Bloco B: exclusão lógica de documentos (ações em lote) e busca global.

-- 1. Exclusão lógica: o documento some das listas, mas continua guardado (prova jurídica no
-- motor e auditoria no MDSign). Só o servidor marca, depois de conferir status e permissão.
alter table public.documents
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users (id) on delete set null;
create index documents_live_idx on public.documents (organization_id, created_at desc)
  where deleted_at is null;

-- 2. Busca global. SECURITY INVOKER: cada tabela aplica o próprio RLS com a identidade de
-- quem busca — nada de outra organização (ou sem permissão) aparece. Até 6 por grupo.
create function public.global_search(org uuid, q text)
returns table (kind text, id text, title text, subtitle text, status text, created_at timestamptz)
language plpgsql stable security invoker set search_path = '' as $$
declare
  term text := btrim(coalesce(q, ''));
  pat text;
  digits text := regexp_replace(coalesce(q, ''), '\D', '', 'g');
begin
  if length(term) < 2 then return; end if;
  pat := '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  (select 'document'::text, d.id::text, d.name, null::text, d.status::text, d.created_at
   from public.documents d
   where d.organization_id = org and d.deleted_at is null
     and (d.name ilike pat
          or exists (select 1 from public.document_participants p
                     where p.document_id = d.id
                       and (p.name ilike pat or p.email ilike pat
                            or (length(digits) >= 4 and p.cpf like '%' || digits || '%'))))
   order by d.created_at desc limit 6)
  union all
  (select 'process', pr.id::text, pr.name, pr.kind, null, pr.created_at
   from public.processes pr
   where pr.organization_id = org and pr.name ilike pat
   order by pr.created_at desc limit 6)
  union all
  (select 'template', t.id::text, t.name, t.category, null, t.created_at
   from public.templates t
   where (t.scope = 'mdsign' or t.organization_id = org) and t.name ilike pat
   order by t.name limit 6)
  union all
  (select 'contact', c.id::text, c.name, c.email, null, c.created_at
   from public.contacts c
   where c.organization_id = org
     and (c.name ilike pat or c.email ilike pat or c.company ilike pat
          or (length(digits) >= 4 and (c.cpf like '%' || digits || '%'
                                       or regexp_replace(coalesce(c.phone, ''), '\D', '', 'g')
                                          like '%' || digits || '%')))
   order by c.name limit 6)
  union all
  (select 'bulk', b.id::text, b.name, b.source, b.status, b.created_at
   from public.bulk_jobs b
   where b.organization_id = org and b.name ilike pat
   order by b.created_at desc limit 6)
  union all
  (select 'user', m.user_id::text, coalesce(m.full_name, m.email), m.email, m.role::text, m.created_at
   from public.list_members(org) m
   where m.full_name ilike pat or m.email ilike pat
   limit 6);
end;
$$;
revoke execute on function public.global_search(uuid, text) from public, anon;
grant execute on function public.global_search(uuid, text) to authenticated;
