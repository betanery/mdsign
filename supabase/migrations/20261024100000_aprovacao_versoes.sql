-- MDSign — fluxo de aprovação: devolução para correção, rejeição definitiva e versões do
-- documento. Só acréscimos.
--
-- O motor tem uma única "recusa". O MDSign registra o tipo:
-- - 'return' (devolvido para correção): quem enviou corrige e sobe uma nova versão; o motor
--   reinicia o fluxo, então a aprovação da versão anterior não vale para a nova.
-- - 'reject' (rejeitado definitivamente): o processo termina; não aceita nova versão.
-- Recusa feita na tela do motor (sem o tipo) conta como devolução (decisão de 24/10/2026).

alter table public.documents
  add column if not exists refusal_kind text check (refusal_kind in ('return', 'reject'));
comment on column public.documents.refusal_kind is
  'Tipo da recusa: return = devolvido para correção (aceita nova versão); reject = rejeitado definitivamente. Null numa recusa = devolução.';

-- Versões do arquivo: cada envio e cada correção. Nunca sobrescreve: a versão anterior fica.
create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number integer not null check (number between 1 and 1000),
  file_name text check (char_length(file_name) <= 200),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes integer check (size_bytes >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_by_name text check (char_length(created_by_name) <= 160),
  created_at timestamptz not null default now(),
  unique (document_id, number)
);
create index document_versions_doc_idx on public.document_versions (document_id, number);
alter table public.document_versions enable row level security;

-- Vê as versões quem vê o documento (a subconsulta passa pelo RLS de documents).
create policy document_versions_select on public.document_versions for select
  to authenticated using (exists (select 1 from public.documents d where d.id = document_id));
revoke insert, update, delete on public.document_versions from anon, authenticated;

-- Documentos já existentes: versão 1 (sem hash: o arquivo original está no motor).
insert into public.document_versions (document_id, organization_id, number, created_by, created_at)
select d.id, d.organization_id, 1, d.created_by, d.created_at from public.documents d
on conflict (document_id, number) do nothing;

-- Histórico e versões não são editáveis depois de gravados (nem pelo servidor).
create or replace function public.forbid_history_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'history_immutable' using errcode = '42501';
end;
$$;
revoke execute on function public.forbid_history_update() from public, anon, authenticated;
create trigger document_events_immutable before update on public.document_events
  for each row execute function public.forbid_history_update();
create trigger document_versions_immutable before update on public.document_versions
  for each row execute function public.forbid_history_update();
