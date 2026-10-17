-- MDSign — Quórum em grupos ("qualquer N do grupo assina/aprova"), auditoria Fase 5.
-- Os membros continuam sendo participantes (um por pessoa); os do mesmo grupo viram uma única
-- regra no motor (SignRule/ApproverRule com ruleUsers e numberRequiredActions).
-- Quando a regra se cumpre, quem não precisou agir fica 'skipped'.
-- A opção só aparece na tela com a política 'quorum_groups' ativa (desligada até o teste real).

alter table public.document_participants
  add column rule_key text check (char_length(rule_key) <= 64),
  add column rule_name text check (char_length(rule_name) <= 160),
  add column rule_required integer check (rule_required between 1 and 50),
  add constraint document_participants_rule_check
    check ((rule_key is null) = (rule_required is null));

alter table public.document_participants drop constraint if exists document_participants_status_check;
alter table public.document_participants add constraint document_participants_status_check
  check (status in ('created', 'pending', 'completed', 'refused', 'skipped'));

insert into public.policies (id, description, config, active) values
  ('quorum_groups', 'Grupos com quórum ("qualquer N do grupo assina"). Ligar só depois do teste real com várias pessoas.',
   '{}', false)
on conflict (id) do nothing;
