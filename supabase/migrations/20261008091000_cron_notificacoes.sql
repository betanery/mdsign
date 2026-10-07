-- O agendador de cada minuto também processa a fila de notificações (WhatsApp): chama a função
-- quando há webhooks de saída OU notificações vencidas. Mesmo job, sem um segundo agendador.
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
  where exists (select 1 from public.webhook_deliveries where status = 'pending' and next_attempt_at <= now())
     or exists (select 1 from public.notifications where status = 'pending' and scheduled_at <= now());
  $job$
);
