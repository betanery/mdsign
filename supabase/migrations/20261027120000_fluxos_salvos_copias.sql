-- MDSign — fluxos de assinatura salvos e cópia do documento concluído para e-mails de fora.
-- Só acréscimos.

-- 1. Fluxos salvos: participantes, papéis, ordem e autenticação com um nome, para reaplicar no
--    envio. Ficam na organização; quem envia documentos usa; quem criou (ou gestor) apaga.
create table public.saved_flows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  sequential boolean not null default true,
  participants jsonb not null check (jsonb_typeof(participants) = 'array'
                                     and jsonb_array_length(participants) between 1 and 30),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);
create index saved_flows_org_idx on public.saved_flows (organization_id, name);
alter table public.saved_flows enable row level security;
create policy saved_flows_select on public.saved_flows for select to authenticated
  using (public.has_org_permission(organization_id, 'documents.create'));
create policy saved_flows_insert on public.saved_flows for insert to authenticated
  with check (public.has_org_permission(organization_id, 'documents.create') and created_by = auth.uid());
create policy saved_flows_delete on public.saved_flows for delete to authenticated
  using (created_by = auth.uid() or public.has_org_permission(organization_id, 'documents.manage'));
revoke all on public.saved_flows from anon, authenticated;
grant select, insert, delete on public.saved_flows to authenticated;

-- 2. Cópias do documento concluído enviadas por e-mail: cada destinatário recebe um link
--    próprio, com prazo; o arquivo é buscado no motor na hora do clique (nada fica guardado).
--    Só o hash do token fica no banco. Leitura acompanha quem vê o documento; gravação só pelo
--    servidor.
create table public.document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  open_count integer not null default 0,
  revoked_at timestamptz
);
create index document_shares_doc_idx on public.document_shares (document_id, created_at desc);
alter table public.document_shares enable row level security;
create policy document_shares_select on public.document_shares for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id));
revoke insert, update, delete on public.document_shares from anon, authenticated;
