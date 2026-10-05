-- Testes de isolamento e permissões do Bloco 1 (PRD §54: "RLS/permissões testados").
-- Rodam dentro de uma transação que é desfeita no final (scripts/test-rls.sh): nada fica gravado.
-- Cada verificação usa ASSERT; a primeira falha interrompe com a mensagem do caso.

-- Usuários de teste
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@teste.mdsign', 'authenticated', 'authenticated', '{"full_name":"Ana Teste","locale":"en"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bruno@teste.mdsign', 'authenticated', 'authenticated', '{"full_name":"Bruno Teste"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carla@teste.mdsign', 'authenticated', 'authenticated', '{"locale":"xx"}');

do $$ begin
  assert (select locale from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'en', 'perfil criado com o idioma do cadastro';
  assert (select locale from public.profiles where id = '00000000-0000-0000-0000-00000000000c') = 'pt', 'idioma inválido vira pt';
end $$;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to authenticated;

-- Ana cria a organização A
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
insert into t_ids values ('orgA', public.create_organization('Empresa A', '12.345.678/0001-90'));
do $$ begin
  assert (select cnpj from public.organizations where id = (select v from t_ids where k = 'orgA')) = '12345678000190', 'CNPJ salvo só com dígitos';
  assert public.org_role_of((select v from t_ids where k = 'orgA')) = 'owner', 'quem cria é proprietário';
  assert (select count(*) from public.audit_log) = 1, 'criação registrada na auditoria';
end $$;
reset role;

-- Bruno cria a organização B
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
insert into t_ids values ('orgB', public.create_organization('Empresa B'));
do $$ begin
  assert (select count(*) from public.organizations) = 1, 'Bruno vê só a própria organização';
  assert not exists (select 1 from public.organizations where id = (select v from t_ids where k = 'orgA')), 'Bruno não vê a Empresa A';
  assert (select count(*) from public.list_members((select v from t_ids where k = 'orgA'))) = 0, 'Bruno não lista membros da Empresa A';
  assert (select count(*) from public.audit_log) = 1, 'Bruno só vê a auditoria da própria organização';
  assert not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'Bruno não vê o perfil da Ana';
end $$;
-- Bruno não consegue convidar na Empresa A
do $$ begin
  perform public.invite_member((select v from t_ids where k = 'orgA'), 'x@teste.mdsign', 'admin');
  assert false, 'Bruno não deveria convidar na Empresa A';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Empresa A no Ipê (10 usuários) para os convites abaixo; Empresa B segue no Cedro.
update public.subscriptions set plan_id = 'ipe' where organization_id = (select v from t_ids where k = 'orgA');

-- Ana convida Bruno como Visualizador e Carla como Gestora
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select public.invite_member((select v from t_ids where k = 'orgA'), 'Bruno@Teste.mdsign', 'viewer');
select public.invite_member((select v from t_ids where k = 'orgA'), 'carla@teste.mdsign', 'manager');
reset role;
insert into t_ids select 'invB', token from public.invitations where email = 'bruno@teste.mdsign';
insert into t_ids select 'invC', token from public.invitations where email = 'carla@teste.mdsign';

-- Carla não aceita o convite do Bruno (e-mail diferente)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform public.accept_invitation((select v from t_ids where k = 'invB'));
  assert false, 'convite não pode ser aceito por outro e-mail';
exception when insufficient_privilege then null;
end $$;
select public.accept_invitation((select v from t_ids where k = 'invC'));
reset role;

-- Bruno aceita e passa a ver a Empresa A, mas como Visualizador
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
select public.accept_invitation((select v from t_ids where k = 'invB'));
do $$ begin
  assert (select count(*) from public.organizations) = 2, 'Bruno vê as duas organizações em que é membro';
  assert not public.has_org_permission((select v from t_ids where k = 'orgA'), 'members.manage'), 'Visualizador não gerencia membros';
  assert (select array_agg(p) from public.my_permissions((select v from t_ids where k = 'orgA')) p) = array['documents.view'], 'Visualizador só vê documentos';
  assert (select count(*) from public.audit_log where organization_id = (select v from t_ids where k = 'orgA')) = 0, 'Visualizador não vê auditoria';
end $$;
-- Visualizador não edita a organização (RLS: update não afeta linhas)
update public.organizations set name = 'Hackeada' where id = (select v from t_ids where k = 'orgA');
do $$ begin
  assert (select name from public.organizations where id = (select v from t_ids where k = 'orgA')) = 'Empresa A', 'Visualizador não renomeia a organização';
end $$;
-- Visualizador não cria unidade
do $$ begin
  insert into public.organization_units (organization_id, name) values ((select v from t_ids where k = 'orgA'), 'RH');
  assert false, 'Visualizador não cria unidade';
exception when insufficient_privilege then null;
end $$;
-- Ninguém insere associação direto (só pelas funções)
do $$ begin
  insert into public.memberships (organization_id, user_id, role) values ((select v from t_ids where k = 'orgA'), '00000000-0000-0000-0000-00000000000b', 'owner');
  assert false, 'inserção direta em memberships deve ser bloqueada';
exception when insufficient_privilege then null;
end $$;
-- Ninguém apaga auditoria
do $$ begin
  delete from public.audit_log;
  assert false, 'auditoria não pode ser apagada';
exception when insufficient_privilege then null;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.audit_log) >= 6, 'auditoria não pode ser apagada';
end $$;

-- Carla (Gestora) gerencia membros, mas não mexe no proprietário
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
set local role authenticated;
select public.update_member((select v from t_ids where k = 'orgA'), '00000000-0000-0000-0000-00000000000b', 'operator');
do $$ begin
  perform public.update_member((select v from t_ids where k = 'orgA'), '00000000-0000-0000-0000-00000000000a', 'member');
  assert false, 'Gestora não rebaixa o proprietário';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.invite_member((select v from t_ids where k = 'orgA'), 'y@teste.mdsign', 'owner');
  assert false, 'Gestora não convida proprietário';
exception when insufficient_privilege then null;
end $$;
-- Gestora não altera a estrutura (unidades são do Administrador/Proprietário)
do $$ begin
  insert into public.organization_units (organization_id, name) select v, 'RH' from t_ids where k = 'orgA';
  assert false, 'Gestora não cria unidade';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Ana (única proprietária) não pode se rebaixar nem se remover
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform public.update_member((select v from t_ids where k = 'orgA'), '00000000-0000-0000-0000-00000000000a', 'admin');
  assert false, 'último proprietário não pode ser rebaixado';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.remove_member((select v from t_ids where k = 'orgA'), '00000000-0000-0000-0000-00000000000a');
  assert false, 'último proprietário não pode ser removido';
exception when insufficient_privilege then null;
end $$;
insert into public.organization_units (organization_id, name) select v, 'RH' from t_ids where k = 'orgA';
do $$ begin
  assert (select count(*) from public.organization_units) = 1, 'proprietária cria unidade';
  assert (select role from public.memberships where user_id = '00000000-0000-0000-0000-00000000000b' and organization_id = (select v from t_ids where k = 'orgA')) = 'operator', 'Gestora alterou o papel do Bruno';
  assert (select count(*) from public.list_members((select v from t_ids where k = 'orgA'))) = 3, 'proprietária vê os 3 membros';
end $$;
reset role;

-- Anônimo não vê nada
set local role anon;
do $$ begin
  perform 1 from public.organizations;
  assert false, 'anônimo não lê organizações';
exception when insufficient_privilege then null;
end $$;
reset role;

-- CPF único por conta
update public.profiles set cpf = '81976153069' where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  update public.profiles set cpf = '81976153069' where id = '00000000-0000-0000-0000-00000000000b';
  assert false, 'o mesmo CPF não pode estar em duas contas';
exception when unique_violation then null;
end $$;

-- Bloco 6: planos e consumo
do $$ begin
  assert (select plan_id from public.subscriptions where organization_id = (select v from t_ids where k = 'orgB')) = 'cedro', 'organização nova nasce no Cedro';
  for i in 1..5 loop
    assert public.consume_document((select v from t_ids where k = 'orgB'), 'teste'), 'Cedro permite até 5 documentos';
  end loop;
  assert not public.consume_document((select v from t_ids where k = 'orgB'), 'teste'), 'Cedro bloqueia o 6º documento';
  perform public.refund_document((select v from t_ids where k = 'orgB'));
  assert public.consume_document((select v from t_ids where k = 'orgB'), 'teste'), 'documento devolvido libera de novo';
  assert exists (select 1 from public.policy_events where organization_id = (select v from t_ids where k = 'orgB') and policy_id = 'usage_alert'), 'alerta de 80% registrado';
  assert exists (select 1 from public.policy_events where organization_id = (select v from t_ids where k = 'orgB') and policy_id = 'usage_block'), 'bloqueio registrado';
  for i in 1..50 loop
    assert public.consume_document((select v from t_ids where k = 'orgA'), 'teste'), 'Ipê é ilimitado';
  end loop;
end $$;

-- Bruno vê o consumo da Empresa B (dele) e não o de uma organização onde não é membro
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.org_usage((select v from t_ids where k = 'orgB'))) = 0, 'Carla não vê o consumo da Empresa B';
  assert (select documents_total_used from public.org_usage((select v from t_ids where k = 'orgA'))) = 50, 'Carla vê o consumo da Empresa A';
end $$;
reset role;

-- Limite de usuários: Empresa B (Cedro, 1 usuário) não convida mais ninguém
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform public.invite_member((select v from t_ids where k = 'orgB'), 'novo@teste.mdsign', 'member');
  assert false, 'Cedro não permite segundo usuário';
exception when raise_exception then null;
end $$;
reset role;


-- Blocos 4 e 5: modelos, formulários e massa
-- Carla (gestora da Empresa A) cria modelo da organização; Bruno (visualizador) não.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
set local role authenticated;
insert into public.templates (organization_id, owner_id, scope, name, body)
  values ((select v from t_ids where k = 'orgA'), '00000000-0000-0000-0000-00000000000c', 'organization', 'Modelo A', 'Olá {{nome}}');
do $$ begin
  assert (select count(*) from public.templates where scope = 'mdsign') >= 4, 'biblioteca MDSign visível';
  assert exists (select 1 from public.templates where name = 'Modelo A'), 'gestora vê o modelo da organização';
end $$;
reset role;
insert into t_ids values ('tplA', (select id from public.templates where name = 'Modelo A'));

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  insert into public.templates (organization_id, owner_id, scope, name, body)
    values ((select v from t_ids where k = 'orgA'), '00000000-0000-0000-0000-00000000000b', 'organization', 'Invasor', 'x');
  assert false, 'visualizador não cria modelo da organização';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.templates set name = 'Hack' where scope = 'mdsign';
  assert (select count(*) from public.templates where name = 'Hack') = 0, 'ninguém altera a biblioteca MDSign';
  -- Bruno vê o modelo da Empresa A (é membro), mas não o pessoal de outra pessoa.
  assert exists (select 1 from public.templates where name = 'Modelo A'), 'membro vê modelo da organização';
  assert (select count(*) from public.forms) = 0, 'visualizador não vê formulários';
end $$;
reset role;

-- Reserva de vagas do formulário: máximo de 2 respostas
insert into public.forms (organization_id, template_id, name, max_responses)
  values ((select v from t_ids where k = 'orgA'), (select v from t_ids where k = 'tplA'), 'Form A', 2);
do $$
declare f uuid := (select id from public.forms where name = 'Form A');
begin
  assert (select token from public.forms where id = f) ~ '^[a-f0-9]{32}$', 'token aleatório de 32 hex';
  assert public.claim_form_slot(f), '1ª resposta';
  assert public.claim_form_slot(f), '2ª resposta';
  assert not public.claim_form_slot(f), 'máximo de respostas respeitado';
  perform public.release_form_slot(f);
  assert public.claim_form_slot(f), 'vaga devolvida pode ser usada';
  update public.forms set expires_at = now() - interval '1 minute', responses_count = 0 where id = f;
  assert not public.claim_form_slot(f), 'formulário vencido não aceita respostas';
end $$;

-- Lote: itens reservados uma vez só e lote encerrado quando não há pendentes
insert into public.bulk_jobs (organization_id, name, status, total)
  values ((select v from t_ids where k = 'orgA'), 'Lote A', 'sending', 3);
insert into public.bulk_items (job_id, organization_id, row_number, data)
  select (select id from public.bulk_jobs where name = 'Lote A'), (select v from t_ids where k = 'orgA'), g, '{}'::jsonb
  from generate_series(1, 3) g;
do $$
declare j uuid := (select id from public.bulk_jobs where name = 'Lote A');
begin
  assert (select count(*) from public.claim_bulk_items(j, 2)) = 2, 'pega 2 itens';
  assert (select count(*) from public.claim_bulk_items(j, 2)) = 1, 'não pega de novo os já reservados';
  update public.bulk_items set status = 'sent' where job_id = j and row_number < 3;
  update public.bulk_items set status = 'failed' where job_id = j and row_number = 3;
  perform public.refresh_bulk_job(j);
  assert (select status from public.bulk_jobs where id = j) = 'done', 'lote encerrado';
  assert (select sent from public.bulk_jobs where id = j) = 2 and (select failed from public.bulk_jobs where id = j) = 1, 'totais do lote';
end $$;

-- Bruno (agora operador, com bulk.send) vê o lote, mas não grava nem chama as reservas
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.bulk_jobs) = 1, 'operador vê o lote da organização';
  update public.bulk_items set status = 'pending';
  assert false, 'usuário não altera itens do lote';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.claim_form_slot(gen_random_uuid());
  assert false, 'usuário não chama claim_form_slot';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Super Admin: só quem está em platform_admins
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform public.admin_overview();
  assert false, 'gestora comum não acessa o Super Admin';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.admin_set_plan((select v from t_ids where k = 'orgB'), 'ipe');
  assert false, 'gestora comum não troca plano';
exception when insufficient_privilege then null;
end $$;
reset role;
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-00000000000c');
set local role authenticated;
do $$ begin
  assert (select count(*) from public.admin_overview()) >= 2, 'Super Admin vê as organizações';
  perform public.admin_set_plan((select v from t_ids where k = 'orgB'), 'angico', 'paid');
  assert (select plan_id from public.subscriptions where organization_id = (select v from t_ids where k = 'orgB')) = 'angico', 'Super Admin troca o plano';
  perform public.admin_set_policy('usage_alert', true, '{"percent": 90}');
  assert (select config->>'percent' from public.policies where id = 'usage_alert') = '90', 'Super Admin ajusta política';
end $$;
reset role;

-- Modelos PDF: arquivo obrigatório e sempre na pasta da própria organização; buckets sem políticas
do $$ begin
  assert not exists (select 1 from pg_policies where schemaname = 'storage'
    and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(templates|bulk-sources)'),
    'buckets de PDF não têm políticas para usuários';
  assert (select not public from storage.buckets where id = 'templates'), 'bucket templates privado';
  assert (select not public from storage.buckets where id = 'bulk-sources'), 'bucket bulk-sources privado';
end $$;
do $$ begin
  insert into public.templates (organization_id, scope, name, body, kind)
    values ((select v from t_ids where k = 'orgA'), 'organization', 'PDF sem arquivo', '', 'pdf');
  assert false, 'modelo PDF exige arquivo';
exception when check_violation then null;
end $$;
do $$ begin
  insert into public.templates (organization_id, scope, name, body, kind, file_path)
    values ((select v from t_ids where k = 'orgA'), 'organization', 'PDF de outra pasta', '', 'pdf',
            (select v from t_ids where k = 'orgB')::text || '/' || gen_random_uuid()::text || '.pdf');
  assert false, 'arquivo do modelo fica na pasta da organização';
exception when check_violation then null;
end $$;

-- Processos: só quem tem bulk.send na organização; lotes de PDF exigem pasta da própria organização
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
set local role authenticated;
insert into public.processes (organization_id, name, kind, config)
  values ((select v from t_ids where k = 'orgA'), 'Contracheques mensais', 'bulk_pdf', '{"split":{"mode":"content"}}');
do $$ begin
  assert (select count(*) from public.processes) = 1, 'gestora vê o processo da organização';
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  -- Bruno é operador da Empresa A (bulk.send): vê; mas não cria processo na Empresa B como outra org.
  assert (select count(*) from public.processes where organization_id = (select v from t_ids where k = 'orgA')) = 1, 'operador vê o processo';
end $$;
reset role;
do $$ begin
  insert into public.bulk_jobs (organization_id, name, source, source_folder)
    values ((select v from t_ids where k = 'orgA'), 'Lote PDF', 'pdf',
            (select v from t_ids where k = 'orgB')::text || '/' || gen_random_uuid()::text);
  assert false, 'partes ficam na pasta da organização do lote';
exception when check_violation then null;
end $$;
do $$ begin
  insert into public.bulk_jobs (organization_id, name, source)
    values ((select v from t_ids where k = 'orgA'), 'Lote PDF sem pasta', 'pdf');
  assert false, 'lote de PDF exige a pasta das partes';
exception when check_violation then null;
end $$;

-- Testemunha é um papel válido; observador com conta vê o documento
insert into public.documents (organization_id, created_by, kind, name, engine_document_id)
  values ((select v from t_ids where k = 'orgB'), '00000000-0000-0000-0000-00000000000b', 'send', 'Doc observado', '00000000-0000-0000-0000-0000000000e1');
insert into t_ids values ('docObs', (select id from public.documents where engine_document_id = '00000000-0000-0000-0000-0000000000e1'));
insert into public.document_participants (document_id, organization_id, role, step, name, email)
  values ((select v from t_ids where k = 'docObs'), (select v from t_ids where k = 'orgB'), 'witness', 2, 'Testemunha Um', 'test1@teste.mdsign');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert not public.can_view_document((select v from t_ids where k = 'docObs')), 'Carla ainda não vê o documento da Empresa B';
end $$;
reset role;
insert into public.document_observers (document_id, organization_id, user_id, name, email)
  values ((select v from t_ids where k = 'docObs'), (select v from t_ids where k = 'orgB'),
          '00000000-0000-0000-0000-00000000000c', 'Carla', 'carla@teste.mdsign');
set local role authenticated;
do $$ begin
  assert public.can_view_document((select v from t_ids where k = 'docObs')), 'observadora vê o documento';
  assert (select count(*) from public.document_observers) = 1, 'observadora vê a lista de observadores';
end $$;
reset role;

-- Integrações: só integrations.manage vê; o segredo do webhook nunca é lido pelo navegador
insert into public.webhook_endpoints (organization_id, url, secret)
  values ((select v from t_ids where k = 'orgA'), 'https://exemplo.test/hook', 'segredo-123');
insert into public.api_keys (organization_id, name, prefix, key_hash)
  values ((select v from t_ids where k = 'orgA'), 'ERP', 'mds_abc12345', repeat('a', 64));
insert into public.documents (organization_id, kind, name, engine_document_id)
  values ((select v from t_ids where k = 'orgA'), 'send', 'Doc webhook', '00000000-0000-0000-0000-0000000000f1');
insert into public.document_events (document_id, organization_id, type, actor_name)
  values ((select id from public.documents where name = 'Doc webhook'), (select v from t_ids where k = 'orgA'), 'participant.signed', 'Fulano');
insert into public.document_events (document_id, organization_id, type)
  values ((select id from public.documents where name = 'Doc webhook'), (select v from t_ids where k = 'orgA'), 'participant.reminded');
do $$ begin
  assert (select count(*) from public.webhook_deliveries where organization_id = (select v from t_ids where k = 'orgA') and event_type = 'participant.signed') = 1, 'evento vira webhook';
  assert (select count(*) from public.webhook_deliveries where organization_id = (select v from t_ids where k = 'orgA')) = 1, 'eventos internos (lembrete) não viram webhook';
end $$;
-- Carla (gestora, sem integrations.manage) não vê; a proprietária vê, mas sem o segredo
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.api_keys) = 0, 'gestora não vê chaves de API';
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.api_keys) = 1, 'proprietária vê as chaves (sem o hash)';
  assert (select count(*) from public.webhook_deliveries) = 1, 'proprietária vê as entregas';
end $$;
do $$ begin
  perform secret from public.webhook_endpoints;
  assert false, 'segredo do webhook não é legível pelo navegador';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform key_hash from public.api_keys;
  assert false, 'hash da chave não é legível pelo navegador';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'todos os testes de RLS e permissões passaram' as resultado;
