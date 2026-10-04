-- MDSign Fase 2 — agendador: chama reminders-run de hora em hora (lembretes automáticos e
-- continuação de lotes de envio em massa). O segredo fica no Vault ('mdsign_cron_secret'),
-- gravado fora das migrações.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'mdsign-reminders-run',
  '7 * * * *',
  $job$
  select net.http_post(
    url := 'https://vrksxqbopteeyeovdwpu.supabase.co/functions/v1/reminders-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'mdsign_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
