-- MDSign — Auditoria 16/10/2026, Fase 3: reprocessamento dos webhooks do motor que falharam e
-- alertas da plataforma (rotinas com falha, erros do motor, fila parada, pedidos vencidos).

-- 1. Webhooks do motor: tentativas com espera crescente (1, 5, 30, 120, 720 min).
alter table public.engine_webhook_events
  add column attempts integer not null default 0,
  add column next_attempt_at timestamptz;
create index engine_webhook_events_retry_idx on public.engine_webhook_events (next_attempt_at)
  where processed_at is null;

-- 2. Alertas: um por tipo enquanto a condição durar; fecham sozinhos quando ela some.
create table public.platform_alerts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('cron_failed', 'engine_errors', 'notifications_stuck',
    'engine_events_failed', 'data_requests_overdue', 'bulk_stuck')),
  detail jsonb not null default '{}'::jsonb,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index platform_alerts_open_idx on public.platform_alerts (kind) where resolved_at is null;
alter table public.platform_alerts enable row level security;
revoke all on public.platform_alerts from anon, authenticated;

-- Limiares ajustáveis no Super Admin → Políticas.
insert into public.policies (id, description, config) values
  ('platform_alerts', 'Alertas da plataforma: erros do motor por hora e minutos de fila parada',
   '{"engine_errors_per_hour": 5, "queue_stuck_minutes": 30}')
on conflict (id) do nothing;

create function public.refresh_platform_alerts() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb := coalesce((select config from public.policies where id = 'platform_alerts' and active), '{}');
  max_errors integer := coalesce((cfg->>'engine_errors_per_hour')::int, 5);
  stuck_min integer := coalesce((cfg->>'queue_stuck_minutes')::int, 30);
  checks jsonb;
  k text;
  v jsonb;
  opened integer := 0;
begin
  checks := jsonb_build_object(
    'cron_failed', (select count(*) from cron.job_run_details r join cron.job j on j.jobid = r.jobid
      where j.jobname like 'mdsign-%' and r.status = 'failed' and r.start_time > now() - interval '1 hour'),
    'engine_errors', (select case when count(*) >= max_errors then count(*) else 0 end
      from public.engine_errors where created_at > now() - interval '1 hour'),
    'notifications_stuck', (select count(*) from public.notifications
      where status = 'pending' and scheduled_at < now() - make_interval(mins => stuck_min)),
    'engine_events_failed', (select count(*) from public.engine_webhook_events
      where processed_at is null and attempts >= 5),
    'data_requests_overdue', (select count(*) from public.data_requests
      where status not in ('answered', 'rejected') and due_at < now()),
    'bulk_stuck', (select count(*) from public.bulk_jobs
      where status = 'sending' and updated_at < now() - interval '1 hour')
  );
  for k, v in select * from jsonb_each(checks) loop
    if (v #>> '{}')::int > 0 then
      insert into public.platform_alerts (kind, detail) values (k, jsonb_build_object('count', v))
      on conflict (kind) where resolved_at is null
        do update set last_seen = now(), detail = excluded.detail;
      opened := opened + 1;
    else
      update public.platform_alerts set resolved_at = now() where kind = k and resolved_at is null;
    end if;
  end loop;
  return opened;
end;
$$;
revoke execute on function public.refresh_platform_alerts() from public, anon, authenticated;
grant execute on function public.refresh_platform_alerts() to service_role;

create function public.admin_alerts() returns setof public.platform_alerts
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select * from public.platform_alerts
    where resolved_at is null or resolved_at > now() - interval '7 days'
    order by (resolved_at is not null), last_seen desc;
end;
$$;
revoke execute on function public.admin_alerts() from public, anon;
grant execute on function public.admin_alerts() to authenticated;

-- 3. Rotina de minuto também roda quando há webhook do motor para reprocessar.
select cron.unschedule('mdsign-webhooks-run')
  where exists (select 1 from cron.job where jobname = 'mdsign-webhooks-run');
select cron.schedule(
  'mdsign-webhooks-run',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'mdsign_functions_url') || '/webhooks-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'mdsign_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'mdsign_functions_url')
    and (exists (select 1 from public.webhook_deliveries where status = 'pending' and next_attempt_at <= now())
      or exists (select 1 from public.notifications where status = 'pending' and scheduled_at <= now())
      or exists (select 1 from public.engine_webhook_events where processed_at is null
                   and attempts < 5 and coalesce(next_attempt_at, received_at) <= now()));
  $job$
);
