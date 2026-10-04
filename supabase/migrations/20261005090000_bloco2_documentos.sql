-- MDSign Fase 2 — Bloco 2: documentos, participantes, timeline e eventos do motor
-- (PRD §8, §9, §25, §26, §27). Escritas só pelas Edge Functions (service role): o navegador
-- apenas lê, filtrado por RLS. A chave do SignDoc nunca chega ao navegador.

-- Estrangeiros sem CPF (decisão: tratar no Bloco 2). Exige o modo de identificador opcional
-- no motor (`General.CountryIdentifierMode = Nullable` na 2.9.0).
alter table public.profiles add column no_cpf boolean not null default false;
comment on column public.profiles.no_cpf is 'Pessoa sem CPF (ex.: estrangeira). Assina identificada pelo e-mail.';

create type public.document_status as enum (
  'pending',     -- aguardando ações (Pending / FlowConcluded no motor)
  'concluded',   -- concluído
  'refused',     -- recusado
  'canceled',    -- cancelado
  'expired'      -- expirado
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('self', 'send')),
  name text not null check (char_length(name) between 1 and 200),
  status public.document_status not null default 'pending',
  engine_document_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  concluded_at timestamptz,
  expires_at timestamptz
);

create index documents_org_created_idx on public.documents (organization_id, created_at desc);

create table public.document_participants (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  role text not null default 'signer' check (role in ('signer', 'approver')),
  step integer not null default 1 check (step between 1 and 50),
  name text not null check (char_length(name) between 1 and 160),
  email text not null,
  cpf text check (cpf ~ '^[0-9]{11}$'),
  status text not null default 'pending' check (status in ('created', 'pending', 'completed', 'refused')),
  engine_flow_action_id uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index document_participants_doc_idx on public.document_participants (document_id);
create index document_participants_user_idx on public.document_participants (user_id);

-- Timeline: só eventos confirmados (PRD §27 — nunca inferir visualização).
create table public.document_events (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type text not null,
  actor_name text,
  data jsonb not null default '{}'::jsonb,
  source text not null default 'mdsign' check (source in ('mdsign', 'engine')),
  occurred_at timestamptz not null default now()
);

create index document_events_doc_idx on public.document_events (document_id, occurred_at);

-- Registro bruto dos webhooks do motor (idempotência e diagnóstico; PRD §4).
create table public.engine_webhook_events (
  id bigint generated always as identity primary key,
  dedupe_key text not null unique,
  type text not null,
  engine_document_id uuid,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

-- Quem vê um documento: quem tem documents.view na organização ou é participante dele.
create function public.can_view_document(doc uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d
    where d.id = doc
      and (public.has_org_permission(d.organization_id, 'documents.view')
           or exists (select 1 from public.document_participants p
                      where p.document_id = d.id and p.user_id = auth.uid()))
  );
$$;

alter table public.documents enable row level security;
alter table public.document_participants enable row level security;
alter table public.document_events enable row level security;
alter table public.engine_webhook_events enable row level security;

create policy documents_select on public.documents for select to authenticated
  using (public.can_view_document(id));
create policy participants_select on public.document_participants for select to authenticated
  using (public.can_view_document(document_id));
create policy events_select on public.document_events for select to authenticated
  using (public.can_view_document(document_id));
-- engine_webhook_events: sem políticas (somente service role).

revoke all on public.documents, public.document_participants, public.document_events,
  public.engine_webhook_events from anon, authenticated;
grant select on public.documents, public.document_participants, public.document_events to authenticated;
grant execute on function public.can_view_document(uuid) to authenticated;

create trigger documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();

-- Auditoria registrada pelas Edge Functions (service role) em nome do usuário que agiu.
create function public.write_audit_as(org uuid, actor uuid, act text, ent text, ent_id text,
  payload jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (organization_id, actor_id, action, entity, entity_id, data)
  values (org, actor, act, ent, ent_id, coalesce(payload, '{}'::jsonb));
$$;
revoke execute on function public.write_audit_as(uuid, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.write_audit_as(uuid, uuid, text, text, text, jsonb) to service_role;
