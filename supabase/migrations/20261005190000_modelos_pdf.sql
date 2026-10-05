-- MDSign — Modelos a partir de PDF pronto (campos posicionados, papéis do fluxo, marcas de
-- assinatura/rubrica) e armazenamento privado dos PDFs.

-- Buckets privados: sem políticas para usuários; só as funções (service role) acessam,
-- entregando URLs assinadas de curta duração.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('templates', 'templates', false, 20971520, array['application/pdf']),
  ('bulk-sources', 'bulk-sources', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

alter table public.templates
  add column kind text not null default 'text' check (kind in ('text', 'pdf')),
  add column file_path text check (file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'),
  add column page_count integer check (page_count between 1 and 200),
  -- Papéis do fluxo: [{ slot, label, role: signer|approver, authLevel }]
  add column participants jsonb not null default '[]'::jsonb,
  -- Padrões do envio: { sequential, notify, message, reminders, expiresInDays }
  add column flow jsonb not null default '{}'::jsonb,
  -- Assinatura/rubrica/carimbo por papel: [{ slot, type, page, x, y, w, h }] (frações da página)
  add column marks jsonb not null default '[]'::jsonb,
  add constraint templates_pdf_file check ((kind = 'pdf') = (file_path is not null));

-- O arquivo de um modelo PDF fica na pasta da organização dele.
alter table public.templates add constraint templates_pdf_folder
  check (file_path is null or split_part(file_path, '/', 1) = organization_id::text);
