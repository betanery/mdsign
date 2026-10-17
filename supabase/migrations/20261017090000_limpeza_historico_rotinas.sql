-- MDSign — Limpeza diária do histórico das rotinas agendadas (teste de carga, auditoria Fase 5).
-- O pg_cron guarda cada execução (a rotina de minuto gera ~1.400 linhas por dia); sem limpeza o
-- histórico cresce sem fim e deixa a saúde da plataforma lenta. Mantém 14 dias.
select cron.unschedule('mdsign-cron-cleanup')
  where exists (select 1 from cron.job where jobname = 'mdsign-cron-cleanup');
select cron.schedule(
  'mdsign-cron-cleanup',
  '15 3 * * *',
  $job$ delete from cron.job_run_details where end_time < now() - interval '14 days' $job$
);
