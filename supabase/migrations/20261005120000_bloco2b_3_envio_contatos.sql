-- MDSign Fase 2 — Bloco 2B/2C/3: envio para assinatura, contatos, lembretes e webhooks
-- (PRD §9, §10, §21, §27, §28).

-- Participantes: telefone, sem CPF (estrangeiro) e nível de autenticação.
alter table public.document_participants
  add column phone text check (char_length(phone) <= 30),
  add column no_cpf boolean not null default false,
  add column auth_level text not null default 'basic'
    check (auth_level in ('basic', 'reinforced', 'identity', 'high', 'qualified')),
  add column last_reminded_at timestamptz,
  add column reminder_count integer not null default 0;

-- Documentos: mensagem, lembretes automáticos (PRD §28) e quem recebe a cópia final.
alter table public.documents
  add column message text check (char_length(message) <= 2000),
  add column reminders_enabled boolean not null default true,
  add column reminder_first_days integer not null default 2 check (reminder_first_days between 1 and 30),
  add column reminder_every_days integer not null default 3 check (reminder_every_days between 1 and 30),
  add column reminder_max integer not null default 3 check (reminder_max between 0 and 10);

-- Contatos (PRD §21): base da organização para autocompletar participantes.
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  cpf text check (cpf ~ '^[0-9]{11}$'),
  no_cpf boolean not null default false,
  phone text check (char_length(phone) <= 30),
  company text check (char_length(company) <= 160),
  source text not null default 'mdsign' check (source in ('mdsign', 'excel', 'hcm', 'api', 'document')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create index contacts_org_name_idx on public.contacts (organization_id, name);

alter table public.contacts enable row level security;

-- Quem cria documentos consulta contatos; quem tem contacts.manage edita.
create policy contacts_select on public.contacts for select to authenticated
  using (public.has_org_permission(organization_id, 'documents.create')
         or public.has_org_permission(organization_id, 'contacts.manage'));
create policy contacts_insert on public.contacts for insert to authenticated
  with check (public.has_org_permission(organization_id, 'contacts.manage'));
create policy contacts_update on public.contacts for update to authenticated
  using (public.has_org_permission(organization_id, 'contacts.manage'))
  with check (public.has_org_permission(organization_id, 'contacts.manage'));
create policy contacts_delete on public.contacts for delete to authenticated
  using (public.has_org_permission(organization_id, 'contacts.manage'));

revoke all on public.contacts from anon, authenticated;
grant select, insert, update, delete on public.contacts to authenticated;

create trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();

-- Liga participante a uma conta MDSign pelo e-mail (para "Para mim"). Só o servidor usa.
create function public.user_id_by_email(target text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(target) limit 1;
$$;
revoke execute on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;

-- Ao entrar no MDSign, a pessoa passa a ver os documentos enviados para o e-mail dela.
create function public.link_participant_documents() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.document_participants set user_id = new.id
  where user_id is null and lower(email) = lower(new.email);
  return new;
end;
$$;
create trigger on_auth_user_created_link_documents
  after insert on auth.users
  for each row execute function public.link_participant_documents();
revoke execute on function public.link_participant_documents() from public, anon, authenticated;
