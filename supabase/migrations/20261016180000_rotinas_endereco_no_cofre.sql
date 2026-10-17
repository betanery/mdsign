-- MDSign — Rotinas agendadas sem endereço fixo do projeto (preparação da migração para
-- sa-east-1). O endereço base das funções vem do cofre (Vault): segredo `mdsign_functions_url`,
-- ex.: https://<projeto>.supabase.co/functions/v1. Num projeto novo, gravar esse segredo e o
-- `mdsign_cron_secret` antes de ligar as rotinas (docs/migracao-sa-east-1.md).
-- Sem o segredo, a chamada simplesmente não acontece (a URL fica nula).

select cron.unschedule('mdsign-reminders-run')
  where exists (select 1 from cron.job where jobname = 'mdsign-reminders-run');
select cron.unschedule('mdsign-webhooks-run')
  where exists (select 1 from cron.job where jobname = 'mdsign-webhooks-run');

select cron.schedule(
  'mdsign-reminders-run',
  '7 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'mdsign_functions_url') || '/reminders-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'mdsign_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'mdsign_functions_url');
  $job$
);

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
      or exists (select 1 from public.notifications where status = 'pending' and scheduled_at <= now()));
  $job$
);
