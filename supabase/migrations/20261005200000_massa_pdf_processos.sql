-- MDSign — Envio em massa a partir de um PDF com vários documentos (separação no navegador,
-- uma parte por destinatário) e Processos MDSign (configurações reutilizáveis).

alter table public.bulk_jobs
  add column source text not null default 'template' check (source in ('template', 'pdf')),
  -- Pasta das partes no bucket bulk-sources: {organization_id}/{uuid}
  add column source_folder text check (source_folder ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  add column source_name text check (char_length(source_name) <= 200),
  add column source_sha256 text check (source_sha256 ~ '^[0-9a-f]{64}$'),
  add column source_pages integer check (source_pages between 1 and 1000),
  -- Regra de separação e de identificação usadas (auditoria e "Fazer de novo")
  add column split jsonb not null default '{}'::jsonb,
  add constraint bulk_jobs_pdf_source check (
    (source = 'pdf') = (source_folder is not null)
    and (source_folder is null or split_part(source_folder, '/', 1) = organization_id::text));

alter table public.bulk_items
  add column page_from integer check (page_from >= 1),
  add column page_to integer check (page_to >= page_from),
  -- Como o destinatário foi associado: { method, value, confidence, confirmed_by, confirmed_at }
  add column match jsonb not null default '{}'::jsonb;

-- Processos MDSign: configuração salva para repetir ("Fazer de novo").
create table public.processes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 2 and 160),
  kind text not null check (kind in ('bulk_pdf', 'bulk_template')),
  config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index processes_org_idx on public.processes (organization_id, name);
alter table public.processes enable row level security;

create policy processes_select on public.processes for select to authenticated
  using (public.has_org_permission(organization_id, 'bulk.send'));
create policy processes_insert on public.processes for insert to authenticated
  with check (public.has_org_permission(organization_id, 'bulk.send'));
create policy processes_update on public.processes for update to authenticated
  using (public.has_org_permission(organization_id, 'bulk.send'))
  with check (public.has_org_permission(organization_id, 'bulk.send'));
create policy processes_delete on public.processes for delete to authenticated
  using (public.has_org_permission(organization_id, 'bulk.send'));
revoke all on public.processes from anon, authenticated;
grant select, insert, update, delete on public.processes to authenticated;
create trigger processes_touch before update on public.processes
  for each row execute function public.touch_updated_at();

-- O bucket bulk-sources passa a guardar as partes já separadas (cada uma pequena).
update storage.buckets set file_size_limit = 20971520 where id = 'bulk-sources';
