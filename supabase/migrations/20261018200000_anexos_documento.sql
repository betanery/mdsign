-- MDSign: anexos do documento (arquivos de apoio, sem assinatura). Só acréscimos.
-- O motor recebe os anexos para quem assina ver na cerimônia; o MDSign guarda uma cópia
-- (o motor não oferece download de anexo pela API).

create table public.document_attachments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  content_type text not null check (content_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
create index document_attachments_doc_idx on public.document_attachments (document_id);
alter table public.document_attachments enable row level security;

-- Vê os anexos quem vê o documento (a subconsulta passa pelo RLS de documents).
create policy document_attachments_select on public.document_attachments for select
  to authenticated using (exists (select 1 from public.documents d where d.id = document_id));
-- Gravação só pelo servidor (service role), junto com a criação do documento.
revoke insert, update, delete on public.document_attachments from anon, authenticated;

-- Arquivos num bucket privado; download só por URL assinada gerada pelo servidor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;
