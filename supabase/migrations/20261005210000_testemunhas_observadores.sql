-- MDSign — Testemunhas (signatário com título "Testemunha" no SignDoc) e observadores
-- (acompanham e recebem as notificações, sem assinar). Edição do fluxo após o envio.

alter table public.document_participants drop constraint document_participants_role_check;
alter table public.document_participants add constraint document_participants_role_check
  check (role in ('signer', 'approver', 'witness'));

create table public.document_observers (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  engine_observer_id text,
  created_at timestamptz not null default now(),
  unique (document_id, email)
);
create index document_observers_user_idx on public.document_observers (user_id);
alter table public.document_observers enable row level security;

-- Quem observa um documento (com conta MDSign) também pode vê-lo.
create or replace function public.can_view_document(doc uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d
    where d.id = doc
      and (public.has_org_permission(d.organization_id, 'documents.view')
           or exists (select 1 from public.document_participants p
                      where p.document_id = d.id and p.user_id = auth.uid())
           or exists (select 1 from public.document_observers o
                      where o.document_id = d.id and o.user_id = auth.uid()))
  );
$$;

create policy document_observers_select on public.document_observers for select to authenticated
  using (public.can_view_document(document_id));
revoke all on public.document_observers from anon, authenticated;
grant select on public.document_observers to authenticated;

-- Ao entrar no MDSign, a pessoa passa a ver também os documentos que observa.
create or replace function public.link_participant_documents() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.document_participants set user_id = new.id
  where user_id is null and lower(email) = lower(new.email);
  update public.document_observers set user_id = new.id
  where user_id is null and lower(email) = lower(new.email);
  return new;
end;
$$;
