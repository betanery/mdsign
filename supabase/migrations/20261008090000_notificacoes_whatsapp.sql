-- MDSign — Bloco E: serviço de notificações (e-mail pelo motor; WhatsApp pelo MDSign) e link
-- seguro de assinatura. WhatsApp é CANAL: não substitui autenticação nem a cerimônia do motor.
-- Nada de "entregue" sem confirmação do provedor.

-- 1. Configuração por organização (canal desligado por padrão).
create table public.notification_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  whatsapp_enabled boolean not null default false,
  whatsapp_on_invite boolean not null default true,
  whatsapp_on_reminder boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 2. Fila e registro de cada notificação (o registro é a auditoria do canal).
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  participant_id uuid references public.document_participants (id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'email')),
  kind text not null check (kind in ('signature_requested', 'reminder', 'resend')),
  provider text,
  provider_message_id text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'delivered', 'failed', 'blocked', 'skipped')),
  error text,
  attempts integer not null default 0,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index notifications_due_idx on public.notifications (scheduled_at) where status = 'pending';
create index notifications_doc_idx on public.notifications (document_id, created_at);

-- 3. Link seguro de assinatura: o código só existe na mensagem; aqui fica o hash.
create table public.sign_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  participant_id uuid not null references public.document_participants (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  opened_at timestamptz,
  open_count integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- 4. Descadastro do WhatsApp por organização (palavra "SAIR" ou pedido da pessoa).
create table public.whatsapp_opt_outs (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  phone text not null,
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (organization_id, phone)
);

-- 5. Ritmo de envio (o provedor pode bloquear número que dispara em rajada).
insert into public.policies (id, description, config) values
  ('whatsapp_rate', 'Limite de mensagens de WhatsApp por execução e por dia (por organização)',
   '{"per_run": 15, "per_day": 150}')
on conflict (id) do nothing;

-- 6. RLS: quem vê o documento vê as notificações dele; configuração com members.manage.
alter table public.notification_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.sign_links enable row level security;
alter table public.whatsapp_opt_outs enable row level security;

create policy notification_settings_select on public.notification_settings for select to authenticated
  using (public.is_org_member(organization_id));
create policy notification_settings_write on public.notification_settings for all to authenticated
  using (public.has_org_permission(organization_id, 'members.manage'))
  with check (public.has_org_permission(organization_id, 'members.manage'));
create policy notifications_select on public.notifications for select to authenticated
  using (public.can_view_document(document_id));
create policy whatsapp_opt_outs_select on public.whatsapp_opt_outs for select to authenticated
  using (public.has_org_permission(organization_id, 'members.manage'));
-- sign_links: sem políticas (só o servidor lê e grava).

revoke all on public.notification_settings, public.notifications, public.sign_links,
  public.whatsapp_opt_outs from anon, authenticated;
grant select, insert, update on public.notification_settings to authenticated;
grant select on public.notifications, public.whatsapp_opt_outs to authenticated;
