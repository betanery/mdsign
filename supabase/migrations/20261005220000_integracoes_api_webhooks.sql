-- MDSign — Integrações (PRD §31, P0): chaves de API por organização, webhooks de saída para o
-- sistema do cliente (com assinatura HMAC e novas tentativas) e registro das chamadas.

-- Chaves de API: o MDSign guarda só o hash (SHA-256); a chave aparece uma única vez.
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  prefix text not null unique,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_org_idx on public.api_keys (organization_id);

-- Destinos de webhook: o segredo de assinatura nunca é lido pelo navegador.
create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  url text not null check (url ~ '^https://' and char_length(url) <= 500),
  description text check (char_length(description) <= 160),
  events text[] not null default array['*'],
  secret text not null,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index webhook_endpoints_org_idx on public.webhook_endpoints (organization_id) where active;

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.webhook_endpoints (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  response_status integer,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index webhook_deliveries_due_idx on public.webhook_deliveries (next_attempt_at) where status = 'pending';
create index webhook_deliveries_endpoint_idx on public.webhook_deliveries (endpoint_id, created_at desc);

-- Registro das chamadas à API (diagnóstico e limite por minuto).
create table public.api_requests (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  api_key_id uuid references public.api_keys (id) on delete set null,
  method text not null,
  path text not null,
  status integer not null,
  duration_ms integer,
  error text,
  created_at timestamptz not null default now()
);
create index api_requests_key_idx on public.api_requests (api_key_id, created_at desc);
create index api_requests_org_idx on public.api_requests (organization_id, created_at desc);

alter table public.api_keys enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.api_requests enable row level security;

create policy api_keys_select on public.api_keys for select to authenticated
  using (public.has_org_permission(organization_id, 'integrations.manage'));
create policy webhook_endpoints_select on public.webhook_endpoints for select to authenticated
  using (public.has_org_permission(organization_id, 'integrations.manage'));
create policy webhook_deliveries_select on public.webhook_deliveries for select to authenticated
  using (public.has_org_permission(organization_id, 'integrations.manage'));
create policy api_requests_select on public.api_requests for select to authenticated
  using (public.has_org_permission(organization_id, 'integrations.manage'));

revoke all on public.api_keys, public.webhook_endpoints, public.webhook_deliveries,
  public.api_requests from anon, authenticated;
grant select (id, organization_id, name, prefix, created_at, last_used_at, revoked_at)
  on public.api_keys to authenticated;
grant select (id, organization_id, url, description, events, active, created_at)
  on public.webhook_endpoints to authenticated;
grant select on public.webhook_deliveries, public.api_requests to authenticated;

-- Eventos da timeline viram webhooks para os destinos ativos que os assinam.
create function public.enqueue_webhooks() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  doc record;
  public_type text := case new.type
    when 'document.created' then 'document.created'
    when 'document.sent' then 'document.sent'
    when 'participant.signed' then 'participant.signed'
    when 'participant.approved' then 'participant.approved'
    when 'participant.refused' then 'participant.refused'
    when 'participant.added' then 'participant.added'
    when 'participant.removed' then 'participant.removed'
    when 'document.version_added' then 'document.version_added'
    when 'document.concluded' then 'document.concluded'
    when 'document.refused' then 'document.refused'
    when 'document.canceled' then 'document.canceled'
    when 'document.expired' then 'document.expired'
    else null end;
begin
  if public_type is null then return new; end if;
  if not exists (select 1 from public.webhook_endpoints
                 where organization_id = new.organization_id and active) then
    return new;
  end if;
  select id, name, status, kind, created_at into doc from public.documents where id = new.document_id;
  insert into public.webhook_deliveries (endpoint_id, organization_id, event_type, payload)
  select e.id, new.organization_id, public_type,
    jsonb_build_object(
      'id', gen_random_uuid(),
      'type', public_type,
      'occurredAt', new.occurred_at,
      'data', jsonb_build_object(
        'documentId', doc.id,
        'documentName', doc.name,
        'documentStatus', doc.status,
        'participantName', new.actor_name,
        'details', new.data - 'by'))
  from public.webhook_endpoints e
  where e.organization_id = new.organization_id and e.active
    and (e.events @> array['*'] or e.events @> array[public_type]);
  return new;
end;
$$;
revoke execute on function public.enqueue_webhooks() from public, anon, authenticated;

create trigger document_events_webhooks after insert on public.document_events
  for each row execute function public.enqueue_webhooks();

-- Entrega a cada minuto (novas tentativas com espera crescente na função webhooks-run).
select cron.schedule(
  'mdsign-webhooks-run',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://vrksxqbopteeyeovdwpu.supabase.co/functions/v1/webhooks-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'mdsign_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (select 1 from public.webhook_deliveries where status = 'pending' and next_attempt_at <= now());
  $job$
);
