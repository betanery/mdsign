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

select 'todos os testes de RLS do Bloco 1 passaram' as resultado;
