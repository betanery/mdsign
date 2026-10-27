-- Testes de isolamento e permissões do Bloco 1 (PRD §54: "RLS/permissões testados").
-- Rodam dentro de uma transação que é desfeita no final (scripts/test-rls.sh): nada fica gravado.
-- Cada verificação usa ASSERT; a primeira falha interrompe com a mensagem do caso.

-- Estado-base da bateria (desfeito no rollback, como todo o resto): matriz 2026_10 vigente,
-- a oficial 2026_11 em rascunho, nenhuma outra versão e WhatsApp ainda em desenvolvimento —
-- a situação em que os testes foram escritos, independente do que foi publicado depois.
do $$
declare extra text[] := array(select id from public.plan_versions
                              where id not in ('matriz_2026_10', 'matriz_2026_11'));
begin
  update public.subscriptions set plan_version_id = 'matriz_2026_10' where plan_version_id = any(extra);
  update public.free_allowances set version_id = 'matriz_2026_10' where version_id = any(extra);
  delete from public.plan_version_features where version_id = any(extra);
  delete from public.plan_version_entitlements where version_id = any(extra);
  delete from public.plan_version_prices where version_id = any(extra);
  update public.plan_versions set status = 'retired' where status = 'published';
  delete from public.plan_versions where id = any(extra);
  update public.plan_versions set status = 'published' where id = 'matriz_2026_10';
  update public.plan_versions set status = 'draft', published_at = null where id = 'matriz_2026_11';
  update public.subscriptions set plan_version_id = 'matriz_2026_10' where plan_version_id = 'matriz_2026_11';
  update public.features set implementation = 'in_development' where code = 'whatsapp';
end $$;

-- Usuários de teste
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@teste.mdsign', 'authenticated', 'authenticated', '{"full_name":"Ana Teste","locale":"en"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bruno@teste.mdsign', 'authenticated', 'authenticated', '{"full_name":"Bruno Teste"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carla@teste.mdsign', 'authenticated', 'authenticated', '{"locale":"xx"}');
update auth.users set email_confirmed_at = now() where email like '%@teste.mdsign' and email_confirmed_at is null;

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
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
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
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
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
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
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
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
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
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
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
do $$ begin
  perform public.admin_health();
  assert false, 'gestora comum não vê a saúde da plataforma';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.admin_set_subscription_status((select v from t_ids where k = 'orgB'), 'suspended');
  assert false, 'gestora comum não suspende organização';
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
do $$ begin
  perform public.admin_set_policy('usage_alert', true, '{"percent": "noventa"}');
  assert false, 'política só aceita números';
exception when raise_exception then null;
end $$;
do $$ begin
  assert (public.admin_health() ? 'jobs'), 'Super Admin vê a saúde da plataforma';
  perform public.admin_set_subscription_status((select v from t_ids where k = 'orgB'), 'suspended');
  assert (select status from public.subscriptions where organization_id = (select v from t_ids where k = 'orgB')) = 'suspended', 'Super Admin suspende';
  perform public.admin_set_subscription_status((select v from t_ids where k = 'orgB'), 'active');
  assert (select count(*) from public.admin_activity(10) where action in ('subscription.suspended', 'subscription.reactivated', 'policy.changed', 'plan.changed')) >= 4, 'ações administrativas ficam no histórico';
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
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
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
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
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
-- Fora do Mogno (Empresa A está no Ipê): Integrações desligadas, nada entra na fila.
insert into public.document_events (document_id, organization_id, type, actor_name)
  values ((select id from public.documents where name = 'Doc webhook' and organization_id = (select v from t_ids where k = 'orgA')), (select v from t_ids where k = 'orgA'), 'participant.approved', 'Fulano');
do $$ begin
  assert (select count(*) from public.webhook_deliveries) = 0, 'sem Integrações no plano, eventos não viram webhook';
end $$;
update public.subscriptions set plan_id = 'mogno' where organization_id = (select v from t_ids where k = 'orgA');
insert into public.document_events (document_id, organization_id, type, actor_name)
  values ((select id from public.documents where name = 'Doc webhook' and organization_id = (select v from t_ids where k = 'orgA')), (select v from t_ids where k = 'orgA'), 'participant.signed', 'Fulano');
insert into public.document_events (document_id, organization_id, type)
  values ((select id from public.documents where name = 'Doc webhook' and organization_id = (select v from t_ids where k = 'orgA')), (select v from t_ids where k = 'orgA'), 'participant.reminded');
do $$ begin
  assert (select count(*) from public.webhook_deliveries where organization_id = (select v from t_ids where k = 'orgA') and event_type = 'participant.signed') = 1, 'evento vira webhook';
  assert (select count(*) from public.webhook_deliveries where organization_id = (select v from t_ids where k = 'orgA')) = 1, 'eventos internos (lembrete) não viram webhook';
end $$;
update public.subscriptions set plan_id = 'ipe' where organization_id = (select v from t_ids where k = 'orgA');
-- Carla (gestora, sem integrations.manage) não vê; a proprietária vê, mas sem o segredo
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
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

-- Bloco A (Asaas): cobrança isolada por organização e escrita só pelo servidor.
insert into public.billing_checkouts (organization_id, plan_id, environment, value_cents)
  values ((select v from t_ids where k = 'orgA'), 'aroeira', 'sandbox', 14997),
         ((select v from t_ids where k = 'orgB'), 'jacaranda', 'sandbox', 3990);
insert into public.billing_payments (asaas_payment_id, organization_id, environment, status, value_cents)
  values ('pay_A', (select v from t_ids where k = 'orgA'), 'sandbox', 'RECEIVED', 14997),
         ('pay_B', (select v from t_ids where k = 'orgB'), 'sandbox', 'RECEIVED', 3990);
insert into public.billing_events (id, event, environment, organization_id)
  values ('evt_A', 'PAYMENT_RECEIVED', 'sandbox', (select v from t_ids where k = 'orgA'));
do $$ begin
  assert not public.entitlement_bool((select v from t_ids where k = 'orgA'), 'integrations_access'), 'Integrações fora do Mogno';
end $$;
update public.subscriptions set plan_id = 'mogno' where organization_id = (select v from t_ids where k = 'orgB');
do $$ begin
  assert public.entitlement_bool((select v from t_ids where k = 'orgB'), 'integrations_access'), 'Integrações no Mogno';
end $$;
update public.subscriptions set plan_id = 'cedro' where organization_id = (select v from t_ids where k = 'orgB');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.billing_checkouts) = 1, 'proprietária vê só os checkouts da própria organização';
  assert (select count(*) from public.billing_payments) = 1, 'proprietária vê só as próprias cobranças';
  assert (select count(*) from public.billing_events) = 0, 'eventos do Asaas só para o Super Admin';
  assert (select count(*) from public.org_billing((select v from t_ids where k = 'orgA'))) = 1, 'resumo financeiro da própria organização';
  assert (select count(*) from public.org_billing((select v from t_ids where k = 'orgB'))) = 0, 'sem resumo financeiro de outra organização';
end $$;
do $$ begin
  insert into public.billing_payments (asaas_payment_id, organization_id, environment, status)
    values ('pay_X', (select v from t_ids where k = 'orgA'), 'sandbox', 'RECEIVED');
  assert false, 'navegador não grava cobranças';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.subscriptions set plan_id = 'mogno' where organization_id = (select v from t_ids where k = 'orgA');
  assert false, 'navegador não troca o próprio plano';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.admin_billing();
  assert false, 'só o Super Admin vê o painel financeiro';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Bloco B: busca global respeita a organização e o RLS de cada tabela.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.global_search((select v from t_ids where k = 'orgA'), 'Doc webhook') where kind = 'document') = 1, 'proprietária encontra o próprio documento';
  assert (select count(*) from public.global_search((select v from t_ids where k = 'orgA'), 'x')) = 0, 'busca exige 2 caracteres';
  assert (select count(*) from public.global_search((select v from t_ids where k = 'orgA'), '%')) = 0, 'curinga é tratado como texto';
end $$;
reset role;
update public.documents set deleted_at = now() where name = 'Doc webhook';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.global_search((select v from t_ids where k = 'orgA'), 'Doc webhook') where kind = 'document') = 0, 'excluído não aparece na busca';
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.global_search((select v from t_ids where k = 'orgB'), 'Doc observado') where kind = 'document') = 1, 'Bruno encontra o documento da Empresa B';
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.global_search((select v from t_ids where k = 'orgB'), 'Doc observado')) = 0, 'Ana não encontra nada da Empresa B';
end $$;
do $$ begin
  update public.documents set deleted_at = null where name = 'Doc webhook';
  assert not found, 'navegador não altera documentos';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Bloco C: grupos e delegações.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
insert into public.org_groups (organization_id, name, created_by)
  values ((select v from t_ids where k = 'orgA'), 'Jurídico', '00000000-0000-0000-0000-00000000000a');
insert into public.org_group_members (group_id, organization_id, user_id)
  select g.id, g.organization_id, u from public.org_groups g,
    unnest(array['00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c']::uuid[]) u
  where g.name = 'Jurídico';
do $$ begin
  assert (select count(*) from public.org_group_members) = 2, 'proprietária monta o grupo com membros da organização';
end $$;
reset role;
insert into public.org_groups (organization_id, name) values ((select v from t_ids where k = 'orgB'), 'Diretoria B');
do $$ begin
  insert into public.org_group_members (group_id, organization_id, user_id)
    select id, organization_id, '00000000-0000-0000-0000-00000000000a' from public.org_groups where name = 'Diretoria B';
  assert false, 'quem não é da organização não entra no grupo';
exception when raise_exception then null;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  insert into public.org_groups (organization_id, name, created_by)
    values ((select v from t_ids where k = 'orgA'), 'Grupo do Bruno', '00000000-0000-0000-0000-00000000000b');
  assert false, 'operador não cria grupo';
exception when insufficient_privilege then null;
end $$;
insert into public.delegations (organization_id, delegator_id, delegate_id, ends_at, created_by)
  values ((select v from t_ids where k = 'orgA'), '00000000-0000-0000-0000-00000000000b',
          '00000000-0000-0000-0000-00000000000a', now() + interval '7 days', '00000000-0000-0000-0000-00000000000b');
do $$ begin
  insert into public.delegations (organization_id, delegator_id, delegate_id, ends_at, created_by)
    values ((select v from t_ids where k = 'orgA'), '00000000-0000-0000-0000-00000000000a',
            '00000000-0000-0000-0000-00000000000c', now() + interval '7 days', '00000000-0000-0000-0000-00000000000b');
  assert false, 'operador não delega a aprovação de outra pessoa';
exception when insufficient_privilege then null;
end $$;
reset role;
do $$ begin
  assert public.active_delegate((select v from t_ids where k = 'orgA'), '00000000-0000-0000-0000-00000000000b', 'approvals') = '00000000-0000-0000-0000-00000000000a', 'delegação ativa encontrada';
  assert exists (select 1 from public.audit_log where action = 'delegation.insert'), 'delegação auditada';
  assert exists (select 1 from public.audit_log where action = 'group.member_insert'), 'membro do grupo auditado';
end $$;
update public.delegations set revoked_at = now(), active = false where delegator_id = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert public.active_delegate((select v from t_ids where k = 'orgA'), '00000000-0000-0000-0000-00000000000b', 'approvals') is null, 'revogada deixa de valer';
  assert exists (select 1 from public.audit_log where action = 'delegation.revoked'), 'revogação auditada';
end $$;

-- Bloco D: relatório respeita a organização.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$ declare r jsonb; begin
  r := public.org_report((select v from t_ids where k = 'orgB'), now() - interval '1 day', now() + interval '1 day');
  assert (r->'documents'->>'created')::int >= 1, 'dono vê os números da própria organização';
  assert r ? 'signatures' and r ? 'pending' and r ? 'bulk' and r ? 'usage', 'todas as seções';
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform public.org_report((select v from t_ids where k = 'orgB'), now() - interval '1 day', now() + interval '1 day');
  assert false, 'quem não é da organização não vê o relatório';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Bloco E: notificações e link seguro.
insert into public.notifications (organization_id, document_id, channel, kind)
  values ((select v from t_ids where k = 'orgB'), (select v from t_ids where k = 'docObs'), 'whatsapp', 'signature_requested');
insert into public.sign_links (organization_id, document_id, participant_id, token_hash, expires_at)
  select (select v from t_ids where k = 'orgB'), (select v from t_ids where k = 'docObs'), p.id, repeat('b', 64), now() + interval '7 days'
  from public.document_participants p where p.document_id = (select v from t_ids where k = 'docObs') limit 1;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.notifications where document_id = (select v from t_ids where k = 'docObs')) = 0, 'notificações de documento de outra organização não aparecem';
end $$;
do $$ begin
  perform token_hash from public.sign_links;
  assert false, 'links de assinatura não são legíveis pelo navegador';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.notification_settings (organization_id, whatsapp_enabled) values ((select v from t_ids where k = 'orgB'), true);
  assert false, 'não configura canal de outra organização';
exception when insufficient_privilege then null;
end $$;
insert into public.notification_settings (organization_id, whatsapp_enabled) values ((select v from t_ids where k = 'orgA'), true);
do $$ begin
  assert (select whatsapp_enabled from public.notification_settings where organization_id = (select v from t_ids where k = 'orgA')), 'proprietária configura o canal';
end $$;
reset role;

-- Grupo como participante: identidade dos membros só para quem envia na organização.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.group_member_identities((select id from public.org_groups where name = 'Jurídico'))) = 2, 'quem envia vê os membros do grupo';
end $$;
do $$ begin
  perform public.group_member_identities((select id from public.org_groups where name = 'Diretoria B'));
  assert false, 'não lê membros de grupo de outra organização';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Funil PLG: origem e aceites no cadastro, eventos únicos, Cedro por pessoa, isolamento.
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000d', 'dani@teste.mdsign', 'authenticated', 'authenticated',
   '{"full_name":"Dani Teste","terms_version":"2026-10","marketing_opt_in":false,"acq":{"utm_source":"google","utm_campaign":"cedro-out","landing_page":"/pt/assinar-gratis","first_seen_at":"2026-10-08T10:00:00Z"}}');
update auth.users set email_confirmed_at = now() where email like '%@teste.mdsign' and email_confirmed_at is null;
do $$ begin
  assert (select utm_campaign from public.user_acquisition where user_id = '00000000-0000-0000-0000-00000000000d') = 'cedro-out', 'origem do cadastro gravada';
  assert (select granted from public.user_consents where user_id = '00000000-0000-0000-0000-00000000000d' and kind = 'terms'), 'aceite dos termos gravado';
  assert not (select granted from public.user_consents where user_id = '00000000-0000-0000-0000-00000000000d' and kind = 'marketing'), 'recusa de marketing não impede o cadastro';
  assert (select count(*) from public.growth_events where user_id = '00000000-0000-0000-0000-00000000000d' and event = 'signup_completed') = 1, 'cadastro vira evento';
  perform public.growth_mark(null, '00000000-0000-0000-0000-00000000000d', 'signup_completed');
  assert (select count(*) from public.growth_events where user_id = '00000000-0000-0000-0000-00000000000d' and event = 'signup_completed') = 1, 'marco não duplica';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
set local role authenticated;
insert into t_ids values ('orgD1', public.create_organization('Dani 1'));
insert into t_ids values ('orgD2', public.create_organization('Dani 2'));
do $$ begin
  perform 1 from public.growth_events;
  assert false, 'navegador não lê eventos do funil';
exception when insufficient_privilege then null;
end $$;
reset role;
do $$ begin
  for i in 1..3 loop
    assert public.consume_document((select v from t_ids where k = 'orgD1'), 'teste'), 'Cedro: 1ª organização usa o grátis';
  end loop;
  assert public.consume_document((select v from t_ids where k = 'orgD2'), 'teste'), '4º grátis na 2ª organização';
  assert public.consume_document((select v from t_ids where k = 'orgD2'), 'teste'), '5º grátis na 2ª organização';
  assert not public.consume_document((select v from t_ids where k = 'orgD2'), 'teste'), 'Cedro soma por pessoa: 6º bloqueado';
  assert not public.consume_document((select v from t_ids where k = 'orgD1'), 'teste'), 'também bloqueado na 1ª organização';
  assert exists (select 1 from public.growth_events where organization_id = (select v from t_ids where k = 'orgD2') and event = 'free_document_4_used'), 'evento 4 de 5';
  assert exists (select 1 from public.growth_events where organization_id = (select v from t_ids where k = 'orgD2') and event = 'free_document_5_used'), 'evento limite';
  assert exists (select 1 from public.growth_events where organization_id = (select v from t_ids where k = 'orgD2') and event = 'paid_feature_attempted'), 'tentativa além do grátis registrada';
  assert public.org_growth_stage((select v from t_ids where k = 'orgD2')) = 'pql_hot', 'quem esgotou o grátis é PQL quente';
  assert public.org_growth_stage((select v from t_ids where k = 'orgB')) <> 'opportunity', 'cadastro não vira oportunidade sozinho';
  -- Outra pessoa não é afetada pela soma da Dani.
  update public.free_allowances set used = 0 where user_id = '00000000-0000-0000-0000-00000000000b';
  assert public.consume_document((select v from t_ids where k = 'orgB'), 'teste'), 'outra pessoa tem o próprio grátis';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select documents_total_used from public.org_usage((select v from t_ids where k = 'orgD1'))) = 5, 'tela mostra a soma por pessoa';
end $$;
insert into public.org_qualification (organization_id, use_case, answered_by)
  values ((select v from t_ids where k = 'orgD1'), 'send_others', '00000000-0000-0000-0000-00000000000d');
do $$ begin
  insert into public.org_qualification (organization_id, use_case, answered_by)
    values ((select v from t_ids where k = 'orgA'), 'company', '00000000-0000-0000-0000-00000000000d');
  assert false, 'não qualifica organização de outra pessoa';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.admin_growth_funnel(now() - interval '1 day', now() + interval '1 day');
  assert false, 'só o Super Admin vê o funil';
exception when insufficient_privilege then null;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.org_qualification) = 0, 'Bruno não vê a qualificação da Dani';
end $$;
reset role;
-- Documento concluído vira marco (uma vez); checkout pago vira cliente pago.
update public.documents set status = 'concluded' where name = 'Doc observado';
update public.documents set status = 'pending' where name = 'Doc observado';
update public.documents set status = 'concluded' where name = 'Doc observado';
do $$ begin
  assert (select count(*) from public.growth_events where organization_id = (select v from t_ids where k = 'orgB') and event = 'first_document_completed') = 1, '1º documento concluído uma vez só';
end $$;
insert into public.billing_checkouts (organization_id, plan_id, environment, value_cents)
  values ((select v from t_ids where k = 'orgD1'), 'jacaranda', 'sandbox', 3990);
update public.billing_checkouts set status = 'paid' where organization_id = (select v from t_ids where k = 'orgD1');
do $$ begin
  assert exists (select 1 from public.growth_events where organization_id = (select v from t_ids where k = 'orgD1') and event = 'upgrade_checkout_started'), 'checkout iniciado';
  assert exists (select 1 from public.growth_events where organization_id = (select v from t_ids where k = 'orgD1') and event = 'plan_upgraded'), 'pagamento confirmado ativa o marco pago';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ begin
  assert (public.admin_growth_funnel(now() - interval '1 day', now() + interval '1 day') ->> 'signups')::int >= 1, 'Super Admin vê o funil';
  assert (public.admin_growth_funnel(now() - interval '1 day', now() + interval '1 day', 'cedro-out') ->> 'signups')::int = 1, 'filtro por campanha';
end $$;
reset role;

-- Cedro: disponibilidade de 6 meses por documento (sem apagar); plano pago não tem prazo.
do $$ begin
  assert public.document_available_until((select id from public.documents where name = 'Doc observado'))
    between now() + interval '5 months' and now() + interval '7 months', 'documento do Cedro disponível por 6 meses';
  assert public.document_available_until((select id from public.documents where name = 'Doc webhook' and organization_id = (select v from t_ids where k = 'orgA'))) is null, 'plano pago sem prazo';
  assert public.cedro_availability_months() = 6, 'prazo padrão de 6 meses';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert public.document_available_until((select id from public.documents where name = 'Doc observado' limit 1)) is null, 'quem não vê o documento não recebe a data';
end $$;
reset role;

-- Encerramento de conta: só o proprietário; 30 dias para exportar/desfazer; 60º dia apaga o operacional.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ begin
  perform public.close_organization((select v from t_ids where k = 'orgA'), 'Empresa A');
  assert false, 'quem não é proprietário não encerra';
exception when insufficient_privilege then null;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform public.close_organization((select v from t_ids where k = 'orgD1'), 'outro nome');
  assert false, 'precisa confirmar o nome';
exception when raise_exception then null;
end $$;
do $$ begin
  perform public.close_organization((select v from t_ids where k = 'orgD1'), 'dani 1');
  assert public.is_org_member((select v from t_ids where k = 'orgD1')), 'nos 30 dias a proprietária ainda acessa';
  perform public.reopen_organization((select v from t_ids where k = 'orgD1'));
  assert (select closed_at is null from public.organizations where id = (select v from t_ids where k = 'orgD1')), 'reativa nos 30 dias';
  assert (select plan_id from public.subscriptions where organization_id = (select v from t_ids where k = 'orgD1')) = 'cedro', 'reativada volta ao Cedro';
  perform public.close_organization((select v from t_ids where k = 'orgD1'), 'Dani 1');
end $$;
reset role;
do $$ begin
  assert not public.consume_document((select v from t_ids where k = 'orgD1'), 'teste'), 'conta encerrada não cria documentos';
end $$;
-- Depois dos 30 dias ninguém acessa; no 60º dia o operacional é apagado e o registro fica.
update public.organizations set export_until = now() - interval '1 day', purge_after = now() - interval '1 minute'
  where id = (select v from t_ids where k = 'orgD1');
insert into public.contacts (organization_id, name, email) values ((select v from t_ids where k = 'orgD1'), 'Contato D', 'contato.d@teste.mdsign');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert not public.is_org_member((select v from t_ids where k = 'orgD1')), 'após 30 dias não há acesso';
  assert (select count(*) from public.contacts where organization_id = (select v from t_ids where k = 'orgD1')) = 0, 'contatos invisíveis após 30 dias';
  assert public.is_org_member((select v from t_ids where k = 'orgD2')), 'outras organizações da pessoa seguem normais';
end $$;
reset role;
select public.purge_organization((select v from t_ids where k = 'orgD1'));
do $$ begin
  assert (select count(*) from public.contacts where organization_id = (select v from t_ids where k = 'orgD1')) = 0, 'contatos apagados';
  assert (select count(*) from public.memberships where organization_id = (select v from t_ids where k = 'orgD1')) = 0, 'membros removidos';
  assert (select purged_at is not null from public.organizations where id = (select v from t_ids where k = 'orgD1')), 'organização marcada como apagada';
  assert exists (select 1 from public.audit_log where organization_id = (select v from t_ids where k = 'orgD1') and action = 'organization.purged'), 'auditoria guardada';
end $$;

-- Onboarding: cada pessoa vê só o próprio; dono recebe o completo, convidado o curto; a detecção
-- segue o uso real; quem entrou antes desta versão começa dispensado.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$ declare p jsonb; begin
  p := public.onboarding_progress((select v from t_ids where k = 'orgA'));
  assert p->>'track' = 'full', 'proprietária recebe o onboarding completo';
  assert not (p->>'dismissed')::boolean, 'organização nova começa com o onboarding aberto';
  assert (p->'steps'->>'invite')::boolean, 'convite detectado';
  assert not (p->'steps'->>'track_status')::boolean, 'passo de tela começa desmarcado';
  perform public.onboarding_update((select v from t_ids where k = 'orgA'), 'mark', 'viewed_document');
  assert (public.onboarding_progress((select v from t_ids where k = 'orgA'))->'steps'->>'track_status')::boolean, 'passo de tela marcado';
  perform public.onboarding_update((select v from t_ids where k = 'orgA'), 'dismiss');
  assert (public.onboarding_progress((select v from t_ids where k = 'orgA'))->>'dismissed')::boolean, 'dispensado';
end $$;
do $$ begin
  perform public.onboarding_update((select v from t_ids where k = 'orgA'), 'mark', 'qualquer');
  assert false, 'só passos da lista';
exception when raise_exception then null;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert public.onboarding_progress((select v from t_ids where k = 'orgA'))->>'track' = 'invited', 'convidado recebe o roteiro curto';
  assert (select count(*) from public.onboarding_state) = 1, 'cada pessoa vê só o próprio onboarding';
end $$;
reset role;
update public.memberships set created_at = public.onboarding_since() - interval '1 day'
  where user_id = '00000000-0000-0000-0000-00000000000c' and organization_id = (select v from t_ids where k = 'orgA');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ begin
  assert (public.onboarding_progress((select v from t_ids where k = 'orgA'))->>'dismissed')::boolean, 'quem já usava começa dispensado';
end $$;
reset role;

-- Erros do motor: só o servidor grava; só o Super Admin lê; saúde mostra a contagem.
insert into public.engine_errors (operation, kind, http_status, message) values ('POST /api/documents', 'http', 500, 'teste');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform 1 from public.engine_errors;
  assert false, 'navegador não lê erros do motor';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.admin_engine_errors(10);
  assert false, 'só o Super Admin vê os erros do motor';
exception when insufficient_privilege then null;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.admin_engine_errors(10)) >= 1, 'Super Admin vê os erros do motor';
  assert (public.admin_health()->>'engine_errors_24h')::int >= 1, 'saúde conta os erros do motor';
end $$;
reset role;

-- MFA: Super Admin sem a sessão confirmada pelo código (aal1) não acessa nada de administração.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
do $$ begin
  assert not public.is_platform_admin(), 'sem o código não é Super Admin';
  assert public.platform_admin_status() = 'needs_mfa', 'tela explica que falta o código';
  perform public.admin_overview();
  assert false, 'sem o código não vê as organizações';
exception when insufficient_privilege then null;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ begin
  assert public.is_platform_admin() and public.platform_admin_status() = 'ok', 'com o código é Super Admin';
end $$;
reset role;

-- Canal do titular: protocolo, pedido próprio visível, resto só Super Admin (com o código).
select public.create_data_request('00000000-0000-0000-0000-00000000000b', 'Bruno Teste', 'bruno@teste.mdsign', 'user', 'access', null, 'Quero saber quais dados meus vocês tratam.', null);
select public.create_data_request(null, 'Pessoa Externa', 'externa@teste.mdsign', 'signer', 'deletion', 'Empresa A', 'Peço a exclusão dos meus dados.', 'h1');
do $$ begin
  assert (select protocol ~ '^LGPD-\d{4}-\d{6}$' from public.data_requests limit 1), 'protocolo no formato LGPD-AAAA-000000';
  assert (select identity_verified from public.data_requests where email = 'bruno@teste.mdsign'), 'logado com o e-mail da conta: identidade confirmada';
  assert not (select identity_verified from public.data_requests where email = 'externa@teste.mdsign'), 'sem login: identidade a verificar';
  assert (select due_at::date from public.data_requests where email = 'externa@teste.mdsign') = (now() + interval '15 days')::date, 'prazo de 15 dias';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.data_requests) = 1, 'a pessoa vê só o próprio pedido';
end $$;
do $$ begin
  perform public.admin_data_requests();
  assert false, 'só o Super Admin lista os pedidos';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.create_data_request(null, 'X', 'x@teste.mdsign', 'user', 'access', null, 'tentativa direta', null);
  assert false, 'navegador não cria pedido direto no banco';
exception when insufficient_privilege then null;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ declare r uuid; begin
  r := (select id from public.admin_data_requests() where email = 'externa@teste.mdsign');
  perform public.admin_update_data_request(r, 'answered', true, 'Identidade conferida por e-mail.', 'Dados excluídos, exceto evidências de assinatura guardadas por obrigação legal.');
  assert (select status = 'answered' and answered_at is not null and identity_verified from public.admin_data_requests() where id = r), 'resposta registrada';
  assert (select count(*) from public.admin_data_request_events(r)) = 5, 'histórico: criação, situação, verificação, nota e resposta';
  assert (public.admin_health()->>'data_requests_open')::int = 1, 'saúde conta os pedidos em aberto';
end $$;
reset role;

-- Alertas da plataforma: abrem com a condição, fecham quando ela some; só o Super Admin vê.
insert into public.engine_webhook_events (dedupe_key, type, payload, attempts) values ('teste-falha', 'DocumentSigned', '{}', 5);
do $$ begin
  perform public.refresh_platform_alerts();
  assert exists (select 1 from public.platform_alerts where kind = 'engine_events_failed' and resolved_at is null), 'alerta aberto para webhook do motor que esgotou as tentativas';
  perform public.refresh_platform_alerts();
  assert (select count(*) from public.platform_alerts where kind = 'engine_events_failed' and resolved_at is null) = 1, 'um alerta por tipo, sem duplicar';
  update public.engine_webhook_events set processed_at = now() where dedupe_key = 'teste-falha';
  perform public.refresh_platform_alerts();
  assert not exists (select 1 from public.platform_alerts where kind = 'engine_events_failed' and resolved_at is null), 'alerta fecha sozinho';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform public.admin_alerts();
  assert false, 'só o Super Admin vê os alertas';
exception when insufficient_privilege then null;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.admin_alerts()) >= 1, 'Super Admin vê os alertas (inclusive os resolvidos na semana)';
end $$;
reset role;

-- Comprovante de cookies: só o servidor grava e lê.
insert into public.cookie_consents (consent_id, analytics, marketing, version) values (gen_random_uuid(), true, false, 1);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform 1 from public.cookie_consents;
  assert false, 'navegador não lê os comprovantes de cookies';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Homologação 17/10 (SEC-13): visitante não executa funções privilegiadas; quem está logado sim.
set local role anon;
do $$ begin
  perform public.entitlement_exists(gen_random_uuid(), 'integrations_access');
  assert false, 'anônimo não executa entitlement_exists';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.is_org_member(gen_random_uuid());
  assert false, 'anônimo não executa is_org_member';
exception when insufficient_privilege then null;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert public.is_org_member(gen_random_uuid()) = false, 'logado executa is_org_member';
end $$;
reset role;

-- Growth & Aquisição: primeira e última origem no cadastro; módulo só para Super Admin com MFA.
reset role;
insert into auth.users (id, email, aud, role, created_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'gabi@teste.mdsign', 'authenticated', 'authenticated', now(),
   '{"full_name":"Gabi Teste","acq":{"utm_source":"instagram","utm_medium":"paid_social","utm_campaign":"lancamento_outubro","landing_page":"/pt/assinar-gratis","first_seen_at":"2026-10-01T10:00:00Z","session_id":"sessaoteste01","last":{"utm_source":"google","utm_medium":"cpc","utm_campaign":"busca_marca","landing_page":"/pt/lp/assinar-pdf-gratis","seen_at":"2026-10-05T10:00:00Z"}}}');
update auth.users set email_confirmed_at = now() where email like '%@teste.mdsign' and email_confirmed_at is null;
do $$ begin
  assert (select utm_campaign from public.user_acquisition where user_id = '00000000-0000-0000-0000-0000000000d1') = 'lancamento_outubro', 'primeira origem preservada';
  assert (select last_utm_campaign from public.user_acquisition where user_id = '00000000-0000-0000-0000-0000000000d1') = 'busca_marca', 'última origem gravada';
  assert (select session_id from public.user_acquisition where user_id = '00000000-0000-0000-0000-0000000000d1') = 'sessaoteste01', 'sessão do cadastro gravada';
  assert not public.growth_internal_user('00000000-0000-0000-0000-0000000000d1'), 'cadastro comum não é interno';
  assert public.growth_internal_user('00000000-0000-0000-0000-00000000000c'), 'Super Admin é tráfego interno';
  assert not exists (select 1 from public.growth_people(false) where user_id = '00000000-0000-0000-0000-00000000000c'), 'interno fica fora por padrão';
  assert (select first_campaign from public.growth_people(false) where user_id = '00000000-0000-0000-0000-0000000000d1') = 'lancamento_outubro', 'first-touch na base comercial';
  assert (select last_campaign from public.growth_people(false) where user_id = '00000000-0000-0000-0000-0000000000d1') = 'busca_marca', 'last-touch na base comercial';
end $$;
insert into auth.users (id, email, aud, role, created_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d2', 'hugo@teste.mdsign', 'authenticated', 'authenticated', now(),
   '{"full_name":"Hugo Teste","acq":{"utm_source":"google","utm_campaign":"antiga","first_seen_at":"2026-01-01T10:00:00Z","last":{"utm_source":"google","utm_campaign":"antiga","seen_at":"2026-01-02T10:00:00Z"}}}');
update auth.users set email_confirmed_at = now() where email like '%@teste.mdsign' and email_confirmed_at is null;
do $$ begin
  assert (select last_source from public.growth_people(false) where user_id = '00000000-0000-0000-0000-0000000000d2') = 'nao_identificada', 'última origem fora da janela não conta';
  assert (select first_campaign from public.growth_people(false) where user_id = '00000000-0000-0000-0000-0000000000d2') = 'antiga', 'primeira origem continua registrada';
  assert public.growth_clean_path('/app/invite/79c340ca-4c01-413b-b0eb-06577e31769d') = '/app/invite/:codigo', 'código de convite mascarado';
  assert public.growth_clean_path('/pt/assinar-gratis') = '/pt/assinar-gratis', 'landing normal intacta';
end $$;

-- Usuário comum (Bruno) não acessa nada do módulo.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ begin
  perform public.admin_growth_overview('{}');
  assert false, 'usuário comum não vê a visão geral de Growth';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.admin_growth_leads('{}');
  assert false, 'usuário comum não vê leads';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform 1 from public.growth_campaigns;
  assert false, 'campanhas não são lidas direto';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Super Admin sem MFA (aal1) também não.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
do $$ begin
  perform public.admin_growth_campaigns(null, null);
  assert false, 'Super Admin sem MFA não acessa Growth';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Super Admin com MFA: campanha, identificador travado, links validados, relatórios.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$
declare cid uuid; lid uuid; r jsonb;
begin
  cid := public.admin_growth_campaign_save('{"slug":"lancamento_outubro","name":"Lançamento outubro","channel":"instagram","medium":"paid_social","landing_path":"/pt/assinar-gratis","status":"active","budget_cents":"150000"}');
  insert into t_ids values ('campanha', cid);
  begin
    perform public.admin_growth_campaign_save('{"slug":"lancamento_outubro","name":"Outra"}');
    assert false, 'identificador repetido é recusado';
  exception when others then assert sqlerrm = 'campaign_slug_taken', 'erro de identificador repetido: ' || sqlerrm;
  end;
  begin
    perform public.admin_growth_campaign_save('{"slug":"Com Espaço","name":"Inválida"}');
    assert false, 'identificador inválido é recusado';
  exception when others then assert sqlerrm = 'invalid_request', 'erro de identificador inválido: ' || sqlerrm;
  end;
  perform public.admin_growth_campaign_save(jsonb_build_object('id', cid, 'name', 'Lançamento MDSign Outubro', 'status', 'paused', 'slug', 'tentou_trocar'));
  r := public.admin_growth_campaigns('Lançamento MDSign', null);
  assert r -> 0 ->> 'slug' = 'lancamento_outubro', 'editar não troca o identificador';
  assert r -> 0 ->> 'name' = 'Lançamento MDSign Outubro', 'nome editado';
  begin
    update public.growth_campaigns set slug = 'outro' where id = cid;
    assert false, 'update direto bloqueado';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_growth_link_save(jsonb_build_object('campaign_id', cid, 'landing_path', '/pt/assinar-gratis', 'utm_source', 'Instagram Ads', 'utm_medium', 'paid_social', 'utm_campaign', 'lancamento_outubro'));
    assert false, 'UTM com espaço é recusada';
  exception when others then assert sqlerrm = 'invalid_request', 'erro de UTM inválida: ' || sqlerrm;
  end;
  begin
    perform public.admin_growth_link_save(jsonb_build_object('campaign_id', cid, 'landing_path', 'https://outro.site/', 'utm_source', 'instagram', 'utm_medium', 'paid_social', 'utm_campaign', 'lancamento_outubro'));
    assert false, 'destino fora do site é recusado';
  exception when others then assert sqlerrm = 'invalid_request', 'erro de destino: ' || sqlerrm;
  end;
  lid := public.admin_growth_link_save(jsonb_build_object('campaign_id', cid, 'label', 'Stories', 'landing_path', '/pt/assinar-gratis', 'utm_source', 'instagram', 'utm_medium', 'paid_social', 'utm_campaign', 'lancamento_outubro', 'utm_content', 'stories_v1'));
  assert jsonb_array_length(public.admin_growth_links(cid)) = 1, 'link listado na campanha';
  perform public.admin_growth_campaign_status(cid, 'ended');
  assert exists (select 1 from jsonb_array_elements(public.admin_growth_campaigns(null, 'ended')) e
    where e ->> 'slug' = 'lancamento_outubro'), 'campanha encerrada continua listada';
  r := public.admin_growth_campaigns('lancamento_outubro', null);
  assert (r -> 0 ->> 'signups_first')::int = 1 and (r -> 0 ->> 'signups_last')::int = 0, 'campanha conta o cadastro pela primeira origem';
  r := public.admin_growth_overview('{"from":"2026-01-01T00:00:00Z","to":"2026-12-31T00:00:00Z"}');
  assert (r -> 'kpis') ? 'visits' and jsonb_typeof(r -> 'daily') = 'array', 'visão geral responde';
  r := public.admin_growth_overview('{"from":"2026-01-01T00:00:00Z","to":"2027-01-01T00:00:00Z","campaign":"lancamento_outubro"}');
  assert (r -> 'kpis' ->> 'signups')::int >= 0, 'filtro por campanha';
  begin
    perform public.admin_growth_overview('{"from":"2026-10-10T00:00:00Z","to":"2026-10-01T00:00:00Z"}');
    assert false, 'período invertido é recusado';
  exception when others then assert sqlerrm = 'invalid_request', 'erro de período: ' || sqlerrm;
  end;
  r := public.admin_growth_leads('{"from":"2026-01-01T00:00:00Z","to":"2027-01-01T00:00:00Z","q":"gabi","size":500}');
  assert (r ->> 'total')::int = 1 and (r ->> 'size')::int = 100, 'leads paginados com limite de 100';
  assert r -> 'rows' -> 0 ->> 'campaign' = 'lancamento_outubro', 'lead com a campanha de origem';
  r := public.admin_growth_funnel_v2('{"from":"2026-01-01T00:00:00Z","to":"2027-01-01T00:00:00Z"}');
  assert (r -> 'people' ->> 'signup_completed')::int >= 1, 'funil por pessoas';
  r := public.admin_growth_opportunities('{}');
  assert r ? 'rows', 'oportunidades respondem';
  r := public.admin_growth_timeline('00000000-0000-0000-0000-0000000000d1', null);
  assert r -> 'acquisition' ->> 'last_utm_campaign' = 'busca_marca', 'histórico mostra a origem';
  begin
    perform public.admin_growth_save_settings('{"channels":["Instagram!"],"mediums":[],"internal_email_domains":[],"exclude_org_ids":[],"attribution_days":30,"goals":{}}');
    assert false, 'canal inválido é recusado';
  exception when others then assert sqlerrm = 'invalid_settings', 'erro de configuração: ' || sqlerrm;
  end;
  perform public.admin_growth_save_settings('{"channels":["instagram","google"],"mediums":["cpc"],"internal_email_domains":["mundodigitaltech.com.br"],"exclude_org_ids":[],"attribution_days":20,"goals":{"visit_to_signup":7},"naming_hint":"x","preco":999}');
  assert (public.admin_growth_settings() -> 'settings' ->> 'attribution_days')::int = 20, 'configuração salva';
  assert not (public.admin_growth_settings() -> 'settings') ? 'preco', 'chave fora da lista é descartada';
  perform public.admin_growth_log_export('leads', 10);
end $$;
reset role;
do $$ begin
  assert (select slug from public.growth_campaigns where id = (select v from t_ids where k = 'campanha')) = 'lancamento_outubro', 'identificador intacto no banco';
  begin
    update public.growth_campaigns set slug = 'outro' where id = (select v from t_ids where k = 'campanha');
    assert false, 'identificador não muda nem pelo servidor';
  exception when others then assert sqlerrm = 'campaign_slug_locked', 'trava do identificador: ' || sqlerrm;
  end;
  assert exists (select 1 from public.audit_log where action = 'growth.campaign.created'), 'criação de campanha auditada';
  assert exists (select 1 from public.audit_log where action = 'growth.campaign.updated'), 'edição de campanha auditada';
  assert exists (select 1 from public.audit_log where action = 'growth.settings.changed'), 'configuração auditada';
  assert exists (select 1 from public.audit_log where action = 'growth.export'), 'exportação auditada';
end $$;
set local role anon;
do $$ begin
  perform public.admin_growth_overview('{}');
  assert false, 'anônimo não executa funções de Growth';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Etapa 1 comercial: franquia por pessoa, consumo seguro e matriz versionada.
reset role;
insert into auth.users (id, email, aud, role, created_at, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'eva@teste.mdsign', 'authenticated', 'authenticated', now(), now(), '{"full_name":"Eva Teste"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'fabio@teste.mdsign', 'authenticated', 'authenticated', now(), null, '{"full_name":"Fabio Teste"}');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
insert into t_ids values ('orgE1', public.create_organization('Eva A'));
insert into t_ids values ('orgE2', public.create_organization('Eva B'));
insert into t_ids values ('orgE3', public.create_organization('Eva paga'));
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
insert into t_ids values ('orgF1', public.create_organization('Fabio'));
reset role;
do $$
declare r jsonb; a uuid := (select v from t_ids where k = 'orgE1'); b uuid := (select v from t_ids where k = 'orgE2');
  paid uuid := (select v from t_ids where k = 'orgE3'); res uuid;
begin
  -- 1. Cinco documentos na organização A; 6º bloqueado.
  for i in 1..5 loop
    r := public.reserve_document(a, 'teste:eva:' || i, 'teste');
    assert (r ->> 'ok')::boolean and (r ->> 'used')::int = i, 'Eva usa o ' || i || 'º grátis';
    perform public.commit_document((r ->> 'reservation')::uuid, null, null);
  end loop;
  assert exists (select 1 from public.growth_events where organization_id = a and event = 'free_document_3_used'), 'evento do 3º documento';
  r := public.reserve_document(a, 'teste:eva:6', 'teste');
  assert not (r ->> 'ok')::boolean and r ->> 'reason' = 'plan_limit_reached', '6º bloqueado';
  -- 2. A mesma pessoa cria a organização B: sem franquia nova.
  r := public.reserve_document(b, 'teste:eva:b1', 'teste');
  assert not (r ->> 'ok')::boolean, 'nova organização não dá nova franquia';
  assert (select count(*) from public.growth_events where user_id = '00000000-0000-0000-0000-0000000000e1' and event = 'free_document_limit_reached') = 1, 'tentativa de exceder registrada uma vez só';
  -- 5. Reenvio da mesma requisição: não consome de novo.
  r := public.reserve_document(a, 'teste:eva:3', 'teste');
  assert (r ->> 'duplicate')::boolean and (r ->> 'status') = 'committed', 'mesma chave devolve o mesmo consumo';
  assert (select used from public.free_allowances where user_id = '00000000-0000-0000-0000-0000000000e1') = 5, 'reenvio não conta duas vezes';
  -- 4. Falha no motor: a reserva devolvida libera o documento.
  update public.free_allowances set used = 4 where user_id = '00000000-0000-0000-0000-0000000000e1';
  r := public.reserve_document(a, 'teste:eva:falha', 'teste');
  assert (r ->> 'ok')::boolean, 'reserva do 5º';
  perform public.release_document((r ->> 'reservation')::uuid, 'motor recusou');
  assert (select used from public.free_allowances where user_id = '00000000-0000-0000-0000-0000000000e1') = 4, 'falha no motor devolve o documento';
  r := public.reserve_document(a, 'teste:eva:falha', 'teste');
  assert (r ->> 'ok')::boolean and not (r ->> 'duplicate')::boolean, 'nova tentativa com a mesma chave após devolução';
  -- Resultado desconhecido: continua contado e fica para conferência.
  perform public.mark_document_unknown((r ->> 'reservation')::uuid, 'tempo esgotado');
  assert (select status from public.document_charges where id = (r ->> 'reservation')::uuid) = 'unknown', 'resultado desconhecido marcado';
  assert (select used from public.free_allowances where user_id = '00000000-0000-0000-0000-0000000000e1') = 5, 'desconhecido continua contado';
  insert into t_ids values ('chargeUnknown', (r ->> 'reservation')::uuid);
  -- 8 e 9. Organização paga da mesma pessoa não usa a franquia; voltar ao Cedro não reinicia.
  update public.subscriptions set plan_id = 'ipe', billing_status = 'exempt' where organization_id = paid;
  for i in 1..3 loop
    r := public.reserve_document(paid, 'teste:eva:paga:' || i, 'teste');
    assert (r ->> 'ok')::boolean, 'plano pago cria documentos';
  end loop;
  assert (select used from public.free_allowances where user_id = '00000000-0000-0000-0000-0000000000e1') = 5, 'plano pago não mexe na franquia';
  update public.subscriptions set plan_id = 'cedro', billing_status = 'free' where organization_id = paid;
  r := public.reserve_document(paid, 'teste:eva:volta', 'teste');
  assert not (r ->> 'ok')::boolean, 'voltar ao Cedro não reinicia a franquia pessoal';
  -- E-mail não confirmado: sem franquia.
  r := public.reserve_document((select v from t_ids where k = 'orgF1'), 'teste:fabio:1', 'teste');
  assert r ->> 'reason' = 'email_not_confirmed', 'franquia exige e-mail confirmado';
end $$;

-- 6 e 7. Jacarandá: contrato antigo (20/mês) preservado; novo contrato depois da publicação (50/mês).
do $$
declare r jsonb; old_org uuid := (select v from t_ids where k = 'orgE2'); new_org uuid := (select v from t_ids where k = 'orgF1');
begin
  assert public.current_plan_version() = 'matriz_2026_10', 'nova matriz ainda em rascunho';
  update public.subscriptions set plan_id = 'jacaranda', billing_status = 'paid' where organization_id = old_org;
  assert (select plan_version_id from public.subscriptions where organization_id = old_org) = 'matriz_2026_10', 'contrato liga à versão vigente';
  assert public.entitlement_int(old_org, 'documents_month') = 20, 'Jacarandá antigo: 20 por mês';
  -- Publicação (Super Admin) só afeta contratações novas.
  update public.plan_versions set status = 'retired' where status = 'published';
  update public.plan_versions set status = 'published', published_at = now() where id = 'matriz_2026_11';
  update public.subscriptions set updated_at = now(), billing_status = 'paid' where organization_id = old_org;
  assert public.entitlement_int(old_org, 'documents_month') = 20, 'renovação não muda o contrato antigo';
  for i in 1..20 loop
    r := public.reserve_document(old_org, 'teste:jac:old:' || i, 'teste');
    assert (r ->> 'ok')::boolean, 'antigo usa os 20';
  end loop;
  assert not (public.reserve_document(old_org, 'teste:jac:old:21', 'teste') ->> 'ok')::boolean, 'antigo para no 21º';
  update public.subscriptions set plan_id = 'jacaranda', billing_status = 'paid' where organization_id = new_org;
  assert (select plan_version_id from public.subscriptions where organization_id = new_org) = 'matriz_2026_11', 'contrato novo liga à nova matriz';
  for i in 1..50 loop
    r := public.reserve_document(new_org, 'teste:jac:new:' || i, 'teste');
    assert (r ->> 'ok')::boolean, 'novo usa os 50';
  end loop;
  assert not (public.reserve_document(new_org, 'teste:jac:new:51', 'teste') ->> 'ok')::boolean, 'novo para no 51º';
  assert (public.plan_offer() ->> 'version') = 'matriz_2026_11', 'oferta mostra a versão publicada';
  -- Volta ao estado de rascunho para o resto da bateria.
  update public.plan_versions set status = 'draft', published_at = null where id = 'matriz_2026_11';
  update public.plan_versions set status = 'published' where id = 'matriz_2026_10';
end $$;

-- 10. Navegador não manipula consumo, franquia nem matriz.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ begin
  perform public.reserve_document((select v from t_ids where k = 'orgE1'), 'teste:hack:1', 'teste');
  assert false, 'navegador não reserva consumo';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.release_document((select v from t_ids where k = 'chargeUnknown'), 'hack');
  assert false, 'navegador não devolve consumo';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.free_allowances set used = 0;
  assert false, 'navegador não zera a franquia';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform 1 from public.document_charges;
  assert false, 'navegador não lê consumos';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.plan_version_entitlements set value_int = 999;
  assert false, 'navegador não altera a matriz';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.subscriptions set plan_id = 'ipe' where organization_id = (select v from t_ids where k = 'orgE1');
  assert not found, 'navegador não troca o próprio plano';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.admin_publish_plan_version('matriz_2026_11');
  assert false, 'só Super Admin publica a matriz';
exception when insufficient_privilege then null;
end $$;
-- 11. Quem esgotou o grátis continua vendo os documentos e o consumo.
do $$ begin
  assert (select documents_total_used from public.org_usage((select v from t_ids where k = 'orgE1'))) = 5, 'tela mostra 5 de 5 (franquia da pessoa)';
  assert (select documents_total_used from public.org_usage((select v from t_ids where k = 'orgE2'))) is not null, 'consumo visível em todas as organizações';
  assert (public.plan_offer() ->> 'version') = 'matriz_2026_10', 'oferta pública = versão publicada';
end $$;
reset role;
insert into public.documents (organization_id, created_by, kind, name, status)
  values ((select v from t_ids where k = 'orgE1'), '00000000-0000-0000-0000-0000000000e1', 'send', 'Doc antigo', 'concluded');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.documents where organization_id = (select v from t_ids where k = 'orgE1')) = 1, 'documento existente continua acessível após esgotar';
end $$;
reset role;

-- Super Admin: conferência de resultado desconhecido e alerta.
do $$ begin
  assert public.refresh_platform_alerts() >= 1, 'alerta abre com consumo a conferir';
  assert exists (select 1 from public.platform_alerts where kind = 'document_charges_unknown' and resolved_at is null), 'alerta de consumo a conferir';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ begin
  assert jsonb_array_length(public.admin_document_charges('unknown')) >= 1, 'Super Admin vê o consumo a conferir';
  perform public.admin_resolve_charge((select v from t_ids where k = 'chargeUnknown'), false);
  assert jsonb_array_length(public.admin_plan_versions()) = 2, 'Super Admin vê as duas versões';
end $$;
reset role;
do $$ begin
  assert (select status from public.document_charges where id = (select v from t_ids where k = 'chargeUnknown')) = 'released', 'conferido como não criado: devolvido';
  assert (select used from public.free_allowances where user_id = '00000000-0000-0000-0000-0000000000e1') = 4, 'franquia devolvida após conferência';
  assert exists (select 1 from public.audit_log where action = 'document_charge.resolved'), 'conferência auditada';
end $$;

-- Planos & Funcionalidades: matriz oficial, navegação progressiva no banco e governança.
reset role;
insert into auth.users (id, email, aud, role, created_at, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'gil@teste.mdsign', 'authenticated', 'authenticated', now(), now(), '{"full_name":"Gil Teste"}');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
insert into t_ids values ('pCedro', public.create_organization('Gil Cedro'));
insert into t_ids values ('pJac', public.create_organization('Gil Jacaranda'));
insert into t_ids values ('pAngico', public.create_organization('Gil Angico'));
insert into t_ids values ('pAroeira', public.create_organization('Gil Aroeira'));
insert into t_ids values ('pIpe', public.create_organization('Gil Ipe'));
insert into t_ids values ('pMogno', public.create_organization('Gil Mogno'));
reset role;

-- Publicação validada pelo Super Admin (Carla, com MFA).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ begin
  -- Rascunho incompleto não publica.
  perform public.admin_plan_version_clone('matriz_2026_10', 'teste_incompleta', 'Teste incompleto');
  assert false, 'só um rascunho por vez';
exception when others then assert sqlerrm = 'invalid_request', 'clone com rascunho aberto: ' || sqlerrm;
end $$;
do $$ begin
  perform public.admin_plan_version_save_plan('matriz_2026_10', 'jacaranda', '{"price_cents":3990,"documents":{"mode":"month","value":50},"users_max":1}');
  assert false, 'versão publicada não é editada';
exception when others then assert sqlerrm = 'version_not_draft', 'edição fora do rascunho: ' || sqlerrm;
end $$;
do $$ begin
  perform public.admin_plan_version_save_plan('matriz_2026_11', 'jacaranda', '{"price_cents":39.9,"documents":{"mode":"month","value":50},"users_max":1}');
  assert false, 'preço tem de ser em centavos inteiros';
exception when others then assert sqlerrm = 'invalid_plan', 'preço inválido: ' || sqlerrm;
end $$;
do $$ begin
  perform public.admin_plan_version_save_plan('matriz_2026_11', 'cedro', '{"price_cents":0,"documents":{"mode":"month","value":5},"users_max":1}');
  assert false, 'Cedro só tem franquia total';
exception when others then assert sqlerrm = 'invalid_plan', 'Cedro mensal: ' || sqlerrm;
end $$;
do $$ begin
  perform public.admin_plan_version_set_feature('matriz_2026_11', 'ipe', 'api_webhooks', 'available');
  assert false, 'API não pode ser liberada fora do Mogno';
exception when others then assert sqlerrm = 'feature_exclusive', 'exclusividade: ' || sqlerrm;
end $$;
do $$ begin
  perform public.admin_plan_version_set_feature('matriz_2026_11', 'cedro', 'documents', 'hidden');
  assert false, 'recurso essencial não sai do plano';
exception when others then assert sqlerrm = 'feature_core', 'essencial: ' || sqlerrm;
end $$;
do $$ begin
  perform public.admin_plan_version_save_plan('matriz_2026_11', 'jacaranda', '{"price_cents":3990,"documents":{"mode":"month","value":50},"users_max":1,"description":"Produtividade individual.","benefits":["50 documentos por mês"],"sort":2,"highlight":false,"is_public":true,"cta":"Assinar"}');
  perform public.admin_plan_version_set_feature('matriz_2026_11', 'angico', 'forms', 'available');
  perform public.admin_publish_plan_version('matriz_2026_11');
  assert public.admin_plans_catalog() ->> 'current' = 'matriz_2026_11', 'matriz oficial publicada';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.audit_log where action = 'plan_version.plan_changed'), 'edição de plano auditada';
  assert exists (select 1 from public.audit_log where action = 'plan_version.feature_changed'), 'edição de funcionalidade auditada';
  assert exists (select 1 from public.audit_log where action = 'plan_version.published'), 'publicação auditada';
  -- Exclusividade vale até contra edição direta no banco.
  begin
    update public.plan_version_features set mode = 'available' where version_id = 'matriz_2026_11' and plan_id = 'ipe' and feature_code = 'api_webhooks';
    assert false, 'banco recusa API fora do Mogno';
  exception when others then assert sqlerrm = 'feature_exclusive', 'guarda no banco: ' || sqlerrm;
  end;
end $$;

-- Contratações na matriz oficial (cada uma registra as condições aceitas).
update public.subscriptions set plan_id = 'jacaranda', billing_status = 'paid' where organization_id = (select v from t_ids where k = 'pJac');
update public.subscriptions set plan_id = 'angico', billing_status = 'paid' where organization_id = (select v from t_ids where k = 'pAngico');
update public.subscriptions set plan_id = 'aroeira', billing_status = 'paid' where organization_id = (select v from t_ids where k = 'pAroeira');
update public.subscriptions set plan_id = 'ipe', billing_status = 'paid' where organization_id = (select v from t_ids where k = 'pIpe');
update public.subscriptions set plan_id = 'mogno', billing_status = 'exempt' where organization_id = (select v from t_ids where k = 'pMogno');
update public.subscriptions set plan_version_id = 'matriz_2026_11' where organization_id = (select v from t_ids where k = 'pCedro');
do $$
declare r jsonb; c uuid := (select v from t_ids where k = 'pCedro'); j uuid := (select v from t_ids where k = 'pJac');
  an uuid := (select v from t_ids where k = 'pAngico'); ar uuid := (select v from t_ids where k = 'pAroeira');
  ip uuid := (select v from t_ids where k = 'pIpe'); mo uuid := (select v from t_ids where k = 'pMogno');
begin
  assert (select count(*) from public.subscription_terms where organization_id = j and plan_id = 'jacaranda'
    and version_id = 'matriz_2026_11' and price_cents = 3990 and (entitlements ->> 'documents_month')::int = 50) = 1,
    'condições aceitas registradas na contratação';
  -- Franquias e usuários.
  assert public.entitlement_int(j, 'documents_month') = 50 and public.entitlement_int(j, 'users_max') = 1, 'Jacarandá: 50/mês e 1 usuário';
  assert not public.entitlement_exists(an, 'documents_month') and public.entitlement_int(an, 'users_max') = 4, 'Angico: ilimitado e 4 usuários';
  assert not public.entitlement_exists(ar, 'documents_month') and public.entitlement_int(ar, 'users_max') = 6, 'Aroeira: ilimitado e 6';
  assert not public.entitlement_exists(ip, 'documents_month') and public.entitlement_int(ip, 'users_max') = 10, 'Ipê: ilimitado e 10';
  assert public.entitlement_int(c, 'documents_total') = 5 and public.entitlement_int(c, 'users_max') = 1, 'Cedro: 5 e 1 usuário';
  for i in 1..120 loop
    r := public.reserve_document(an, 'teste:angico:' || i, 'teste');
    assert (r ->> 'ok')::boolean, 'Angico sem bloqueio quantitativo';
  end loop;
  -- Funcionalidades por plano (matriz oficial).
  assert public.feature_mode(c, 'templates') = 'preview' and public.feature_mode(c, 'forms') = 'hidden', 'Cedro: modelos em prévia, formulários ocultos';
  assert public.feature_mode(j, 'templates') = 'available' and public.feature_mode(j, 'bulk_send') = 'preview', 'Jacarandá: modelos sim, massa em prévia';
  assert public.feature_mode(an, 'team') = 'available' and public.feature_mode(an, 'forms') = 'available' and public.feature_mode(an, 'reports') = 'preview', 'Angico';
  assert public.feature_mode(ar, 'bulk_send') = 'available' and public.feature_mode(ar, 'advanced_management') = 'preview', 'Aroeira';
  assert public.feature_mode(ip, 'advanced_management') = 'available' and public.feature_mode(ip, 'api_webhooks') = 'preview', 'Ipê: gestão sim, API em prévia';
  assert public.feature_mode(mo, 'api_webhooks') = 'available' and public.feature_mode(mo, 'templates') = 'available', 'Mogno: API e contrato';
  assert public.feature_mode(ip, 'certificate_signature') = 'hidden', 'em desenvolvimento nunca aparece como disponível';
  assert public.entitlement_bool(mo, 'integrations_access') and not public.entitlement_bool(ip, 'integrations_access'), 'integrações seguem a matriz';
  assert public.feature_mode(j, 'dashboard') = 'available', 'essencial sempre disponível';
end $$;

-- Acesso direto pelo navegador a recurso fora do plano: recusado no banco.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare c uuid := (select v from t_ids where k = 'pCedro'); j uuid := (select v from t_ids where k = 'pJac');
begin
  assert (public.org_features(c) ->> 'templates') = 'preview', 'tela recebe o modo do plano';
  begin
    insert into public.templates (organization_id, owner_id, scope, name, body)
      values (c, auth.uid(), 'organization', 'Burlando', 'Texto');
    assert false, 'Cedro não cria modelo direto';
  exception when insufficient_privilege or check_violation or not_null_violation then null;
  end;
  begin
    insert into public.org_groups (organization_id, name) values (j, 'Grupo');
    assert false, 'Jacarandá não cria grupo (gestão avançada)';
  exception when insufficient_privilege or not_null_violation then null;
  end;
  begin
    insert into public.organization_units (organization_id, name) values (j, 'Unidade');
    assert false, 'Jacarandá não cria unidade';
  exception when insufficient_privilege or not_null_violation then null;
  end;
  begin
    perform public.org_report(j, now() - interval '30 days', now());
    assert false, 'Jacarandá não abre relatórios avançados';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_plans_catalog();
    assert false, 'usuário comum não lê a matriz administrativa';
  exception when insufficient_privilege then null;
  end;
  perform public.growth_app_event(c, 'feature_preview_viewed', '{"feature":"templates"}');
  perform public.growth_app_event(c, 'feature_preview_viewed', '{"feature":"templates"}');
  perform public.growth_app_event(c, 'locked_feature_clicked', '{"feature":"templates"}');
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.growth_events where organization_id = (select v from t_ids where k = 'pCedro') and event = 'feature_preview_viewed') = 1, 'prévia vista sem duplicar no dia';
  assert exists (select 1 from public.growth_events where organization_id = (select v from t_ids where k = 'pCedro') and event = 'locked_feature_clicked'), 'clique em recurso bloqueado registrado';
end $$;

-- Contrato Mogno: condições individuais só no Mogno; custo e indicadores.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$
declare r jsonb; mo uuid := (select v from t_ids where k = 'pMogno'); ip uuid := (select v from t_ids where k = 'pIpe');
begin
  begin
    perform public.admin_mogno_contract_save(ip, '{"api_webhooks":"available"}', '{}');
    assert false, 'contrato individual só no Mogno';
  exception when others then assert sqlerrm = 'not_mogno', 'contrato fora do Mogno: ' || sqlerrm;
  end;
  perform public.admin_mogno_contract_save(mo, '{"bulk_send":"hidden"}', '{"documents_month":1000,"users_max":50}');
  assert (public.org_features(mo) ->> 'bulk_send') = 'hidden', 'contrato Mogno restringe funcionalidade';
  assert public.entitlement_int(mo, 'documents_month') = 1000 and public.entitlement_int(mo, 'users_max') = 50, 'contrato Mogno define limites';
  r := public.admin_consumption(null);
  assert (r ->> 'cost_cents_per_document')::int = 3, 'custo padrão de R$ 0,03';
  assert exists (select 1 from jsonb_array_elements(r -> 'rows') x
    where x ->> 'name' = 'Gil Angico' and (x ->> 'docs')::int = 120 and (x ->> 'cost_cents')::int = 360), 'custo estimado = documentos × custo';
  r := public.admin_plans_overview();
  assert jsonb_array_length(r -> 'by_plan') = 6, 'visão geral por plano';
  assert jsonb_array_length(public.admin_commercial_audit()) >= 3, 'auditoria comercial';
end $$;
reset role;

-- Etapa 3: Meu plano, eventos de contratação e Growth de planos.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (public.org_plan((select v from t_ids where k = 'pJac')) ->> 'plan_id') = 'jacaranda', 'Meu plano mostra o plano contratado';
  assert (public.org_plan((select v from t_ids where k = 'pJac')) ->> 'price_cents')::int = 3990, 'preço da versão contratada';
  perform public.growth_app_event((select v from t_ids where k = 'pCedro'), 'upgrade_cta_clicked', '{"feature":"templates","from_plan":"cedro","to_plan":"jacaranda","where":"menu"}');
end $$;
do $$ begin
  perform public.org_plan((select v from t_ids where k = 'orgA'));
  assert false, 'não vê o plano de outra organização';
exception when insufficient_privilege then null;
end $$;
reset role;
-- Checkout iniciado não é contratação; confirmação conta uma vez por checkout (inclusive o 2º upgrade).
insert into public.billing_checkouts (organization_id, plan_id, previous_plan_id, environment, value_cents, created_by)
  values ((select v from t_ids where k = 'pCedro'), 'jacaranda', 'cedro', 'sandbox', 3990, '00000000-0000-0000-0000-0000000000f1');
do $$ begin
  assert exists (select 1 from public.growth_events where organization_id = (select v from t_ids where k = 'pCedro')
    and event = 'upgrade_checkout_started' and data ->> 'from_plan' = 'cedro' and data ->> 'to_plan' = 'jacaranda'), 'checkout com origem e destino';
  assert not exists (select 1 from public.growth_events where organization_id = (select v from t_ids where k = 'pCedro') and event = 'plan_upgraded'), 'checkout iniciado não é contratação';
end $$;
update public.billing_checkouts set status = 'paid' where organization_id = (select v from t_ids where k = 'pCedro') and plan_id = 'jacaranda';
update public.billing_checkouts set status = 'paid' where organization_id = (select v from t_ids where k = 'pCedro') and plan_id = 'jacaranda';
insert into public.billing_checkouts (organization_id, plan_id, previous_plan_id, environment, value_cents, status)
  values ((select v from t_ids where k = 'pCedro'), 'angico', 'jacaranda', 'sandbox', 9997, 'pending');
update public.billing_checkouts set status = 'paid' where organization_id = (select v from t_ids where k = 'pCedro') and plan_id = 'angico';
do $$ begin
  assert (select count(*) from public.growth_events where organization_id = (select v from t_ids where k = 'pCedro') and event = 'plan_upgraded') = 2, '2 upgrades confirmados, sem duplicar';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ declare r jsonb; begin
  r := public.admin_growth_plan_funnel('{"from":"2026-01-01T00:00:00Z","to":"2027-01-01T00:00:00Z","internal":true}');
  assert (r -> 'steps' ->> 'signups')::int >= 1 and (r -> 'steps' ->> 'paid')::int >= 1, 'funil de planos';
  assert (r -> 'steps' ->> 'checkout_started')::int >= (r -> 'steps' ->> 'paid')::int, 'pagos nunca passam de checkouts';
  r := public.admin_growth_plan_funnel('{"from":"2026-01-01T00:00:00Z","to":"2027-01-01T00:00:00Z","internal":true,"feature":"templates"}');
  assert (r -> 'steps' ->> 'signups')::int >= 1, 'segmenta por funcionalidade de interesse';
  r := public.admin_growth_upgrade_insights('{"from":"2026-01-01T00:00:00Z","to":"2027-01-01T00:00:00Z","internal":true}');
  assert (r ->> 'cedro_to_jacaranda')::int >= 1, 'conversão Cedro → Jacarandá';
  assert exists (select 1 from jsonb_array_elements(r -> 'paid_transitions') x where x ->> 'from_plan' = 'jacaranda' and x ->> 'to_plan' = 'angico'), 'conversão entre pagos';
  assert exists (select 1 from jsonb_array_elements(r -> 'locked_clicks') x where x ->> 'feature' = 'templates'), 'recurso bloqueado mais clicado';
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ begin
  perform public.admin_growth_upgrade_insights('{}');
  assert false, 'usuário comum não vê oportunidades';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Anexos: vê quem vê o documento (observadora sim, outra organização não); gravação só no servidor.
insert into public.document_attachments (document_id, organization_id, name, content_type, size_bytes, storage_path)
  values ((select v from t_ids where k = 'docObs'), (select v from t_ids where k = 'orgB'),
          'apoio.pdf', 'application/pdf', 1234, 'teste/docObs/1.pdf');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.document_attachments) = 1, 'observadora vê o anexo do documento';
end $$;
do $$ begin
  insert into public.document_attachments (document_id, organization_id, name, content_type, size_bytes, storage_path)
    values ((select v from t_ids where k = 'docObs'), (select v from t_ids where k = 'orgB'), 'x.pdf', 'application/pdf', 1, 'x/y.pdf');
  raise exception 'FALHOU: usuário gravou anexo direto';
exception when insufficient_privilege then null;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.document_attachments
          where document_id = (select v from t_ids where k = 'docObs')) = 0, 'outra organização não vê o anexo';
end $$;
reset role;

-- Pastas: quem gerencia cria; outra organização não vê nem usa; apagar deixa "sem pasta".
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
insert into public.document_folders (organization_id, name, created_by)
  values ((select v from t_ids where k = 'orgB'), 'Contratos', '00000000-0000-0000-0000-00000000000b');
reset role;
insert into t_ids values ('fldB', (select id from public.document_folders where name = 'Contratos'
  and organization_id = (select v from t_ids where k = 'orgB')));
set local role authenticated;
do $$ declare fld uuid := (select v from t_ids where k = 'fldB'); begin
  assert public.move_documents((select v from t_ids where k = 'orgB'),
    array[(select v from t_ids where k = 'docObs'), (select id from public.documents where name = 'Doc webhook' and organization_id = (select v from t_ids where k = 'orgA'))], fld) = 1,
    'move só o documento da própria organização';
  assert (select folder_id from public.documents where id = (select v from t_ids where k = 'docObs')) = fld, 'documento na pasta';
end $$;
do $$ begin
  insert into public.document_folders (organization_id, name, created_by)
    values ((select v from t_ids where k = 'orgB'), ' contratos ', '00000000-0000-0000-0000-00000000000b');
  assert false, 'nome repetido na mesma organização';
exception when unique_violation then null;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ begin
  assert not exists (select 1 from public.document_folders where name = 'Contratos'), 'outra organização não vê a pasta';
end $$;
do $$ begin
  perform public.move_documents((select v from t_ids where k = 'orgA'),
    array[(select id from public.documents where name = 'Doc webhook' and organization_id = (select v from t_ids where k = 'orgA'))],
    (select v from t_ids where k = 'fldB'));
  assert false, 'pasta de outra organização';
exception when others then assert sqlerrm in ('folder_not_found', 'forbidden'), 'pasta alheia recusada: ' || sqlerrm;
end $$;
do $$ begin
  insert into public.document_folders (organization_id, name, created_by)
    values ((select v from t_ids where k = 'orgB'), 'Invasão', '00000000-0000-0000-0000-00000000000a');
  assert false, 'não cria pasta em outra organização';
exception when insufficient_privilege then null;
end $$;
reset role;
delete from public.document_folders where name = 'Contratos' and organization_id = (select v from t_ids where k = 'orgB');
do $$ begin
  assert (select folder_id from public.documents where id = (select v from t_ids where k = 'docObs')) is null,
    'apagar a pasta deixa o documento sem pasta';
end $$;

-- Validação pública: tentativas só para o servidor (nem visitante nem usuário logado leem).
set local role anon;
do $$
begin
  perform 1 from public.validation_attempts limit 1;
  raise exception 'FALHOU: visitante leu validation_attempts';
exception when insufficient_privilege then null;
end $$;
reset role;
set local role authenticated;
do $$
begin
  insert into public.validation_attempts (kind) values ('code');
  raise exception 'FALHOU: usuário gravou validation_attempts';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Relatórios: filtros avançados só com "relatórios avançados"; período/situação continuam liberados.
update public.plan_version_features set mode = 'hidden'
  where feature_code = 'reports_advanced'
    and (version_id, plan_id) = (select s.plan_version_id, s.plan_id from public.subscriptions s
                                 where s.organization_id = (select v from t_ids where k = 'orgB'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r jsonb;
begin
  r := public.org_report((select v from t_ids where k = 'orgB'), now() - interval '1 day', now() + interval '1 day',
                         '{"status":"pending"}'::jsonb);
  assert r is not null, 'filtro por situação continua no relatório básico';
  begin
    r := public.org_report((select v from t_ids where k = 'orgB'), now() - interval '1 day', now() + interval '1 day',
                           '{"folder":"none"}'::jsonb);
    raise exception 'FALHOU: filtro por pasta sem relatórios avançados';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Versões do documento: leitura acompanha quem vê o documento; ninguém grava pelo navegador;
-- histórico (eventos e versões) não pode ser editado depois de gravado.
insert into public.document_versions (document_id, organization_id, number, sha256)
values ((select v from t_ids where k = 'docObs'), (select v from t_ids where k = 'orgB'), 2, repeat('c', 64));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$
declare doc uuid := (select v from t_ids where k = 'docObs');
begin
  assert (select count(*) from public.document_versions where document_id = doc)
       = case when public.can_view_document(doc) then (select count(*) from public.document_versions where document_id = doc) else 0 end,
    'versões seguem a visibilidade do documento';
  begin
    insert into public.document_versions (document_id, organization_id, number)
      values (doc, (select v from t_ids where k = 'orgB'), 9);
    raise exception 'FALHOU: usuário gravou versão';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.document_versions where document_id = (select v from t_ids where k = 'docObs')
          and number = 2) = 1, 'quem vê o documento vê as versões';
end $$;
reset role;
do $$
begin
  update public.document_versions set sha256 = repeat('d', 64) where number = 2
    and document_id = (select v from t_ids where k = 'docObs');
  raise exception 'FALHOU: versão foi editada';
exception when insufficient_privilege then null;
end $$;
insert into public.document_events (document_id, organization_id, type, source)
values ((select v from t_ids where k = 'docObs'), (select v from t_ids where k = 'orgB'), 'participant.returned', 'mdsign');
do $$
begin
  update public.document_events set type = 'x' where document_id = (select v from t_ids where k = 'docObs');
  if found then raise exception 'FALHOU: evento foi editado'; end if;
exception when insufficient_privilege then null;
end $$;

-- Convite: a página mostra organização, situação e e-mail mascarado; nunca o e-mail completo.
insert into public.invitations (organization_id, email, role, invited_by, expires_at, token)
values ((select v from t_ids where k = 'orgB'), 'convidada.teste@exemplo.com', 'member',
        '00000000-0000-0000-0000-00000000000b', now() + interval '7 days', '00000000-0000-0000-0000-0000000000a1'),
       ((select v from t_ids where k = 'orgB'), 'velha@exemplo.com', 'member',
        '00000000-0000-0000-0000-00000000000b', now() - interval '1 day', '00000000-0000-0000-0000-0000000000a2');
set local role anon;
do $$
declare p jsonb := public.invitation_preview('00000000-0000-0000-0000-0000000000a1');
begin
  assert p->>'status' = 'valid', 'convite válido';
  assert p->>'organization' = 'Empresa B', 'mostra a organização';
  assert p->>'email_hint' = 'co***@exemplo.com', 'e-mail mascarado';
  assert position('convidada.teste' in p::text) = 0, 'não expõe o e-mail completo';
  assert not (p->>'email_match')::boolean, 'visitante não é o convidado';
  assert public.invitation_preview('00000000-0000-0000-0000-0000000000a2')->>'status' = 'expired', 'convite vencido';
  assert public.invitation_preview('00000000-0000-0000-0000-0000000000ff')->>'status' = 'not_found', 'convite inexistente';
end $$;
reset role;
update public.invitations set accepted_at = now() where token = '00000000-0000-0000-0000-0000000000a1';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$
declare p jsonb := public.invitation_preview('00000000-0000-0000-0000-0000000000a1');
begin
  assert p->>'status' = 'used', 'convite já usado';
  assert (p->>'already_member')::boolean, 'quem já é membro vê "você já faz parte"';
end $$;
reset role;

-- Fluxos salvos: só quem envia documentos na organização vê e cria; outra organização não vê.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
insert into public.saved_flows (organization_id, name, participants, created_by)
values ((select v from t_ids where k = 'orgB'), 'Contrato padrão', '[{"name":"Jurídico","role":"approver"}]', auth.uid());
do $$ begin
  assert (select count(*) from public.saved_flows where name = 'Contrato padrão') = 1, 'Bruno vê o fluxo salvo';
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert not exists (select 1 from public.saved_flows where name = 'Contrato padrão'), 'Ana não vê fluxo de outra organização';
  begin
    insert into public.saved_flows (organization_id, name, participants, created_by)
      values ((select v from t_ids where k = 'orgB'), 'Invasão', '[{}]', auth.uid());
    raise exception 'FALHOU: Ana criou fluxo na Empresa B';
  exception when insufficient_privilege then null;
  end;
  -- Cópias enviadas: ninguém grava pelo navegador.
  begin
    insert into public.document_shares (document_id, organization_id, email, token_hash, expires_at)
      values ((select v from t_ids where k = 'docObs'), (select v from t_ids where k = 'orgB'),
              'x@exemplo.com', repeat('e', 64), now() + interval '1 day');
    raise exception 'FALHOU: usuário gravou cópia';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'todos os testes de RLS e permissões passaram' as resultado;
