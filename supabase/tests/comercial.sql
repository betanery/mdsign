-- Testes comerciais da matriz de lançamento (Cedro, Jacarandá, Ipê, Mogno): franquia, limites,
-- recursos por plano e oferta. Tudo dentro de begin/rollback: nada fica gravado.
-- Uso: npx supabase db query --linked -f supabase/tests/comercial.sql
begin;
create temp table r (n serial, caso text, ok boolean, detalhe text);
grant all on r to authenticated; grant all on r_n_seq to authenticated;

insert into auth.users (id, email, aud, role, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'cedro@teste.mdsign', 'authenticated', 'authenticated', now(), '{"full_name":"Pessoa Cedro"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'ipe@teste.mdsign', 'authenticated', 'authenticated', now(), '{"full_name":"Dona Ipe"}');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

-- Cedro: pessoa cria a organização (plano grátis)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
insert into ids values ('cedro1', public.create_organization('Teste Cedro 1', null));
reset role;

insert into r (caso, ok, detalhe)
select 'Cedro: organização nova nasce no Cedro da matriz de lançamento',
  s.plan_id = 'cedro' and s.plan_version_id = 'lancamento_2026_11', s.plan_id || ' / ' || s.plan_version_id
from public.subscriptions s where s.organization_id = (select v from ids where k = 'cedro1');

-- 5 documentos grátis, avisos no 3º/4º/5º, 6º bloqueado
do $$
declare org uuid := (select v from ids where k = 'cedro1'); x jsonb; i int;
begin
  for i in 1..6 loop
    x := public.reserve_document(org, 'teste-cedro-' || i || '-xxxxxxxx', 'send');
    if (x->>'ok')::boolean then perform public.commit_document((x->>'reservation')::uuid, null, null); end if;
    insert into r (caso, ok, detalhe) values ('Cedro: documento ' || i,
      case when i <= 5 then (x->>'ok')::boolean else not (x->>'ok')::boolean and x->>'reason' = 'plan_limit_reached' end,
      x::text);
  end loop;
end $$;
insert into r (caso, ok, detalhe)
select 'Cedro: marcos do funil 3º, 4º e 5º documento e tentativa do 6º',
  count(*) filter (where event = 'free_document_3_used') = 1 and count(*) filter (where event = 'free_document_4_used') = 1
  and count(*) filter (where event = 'free_document_5_used') = 1 and count(*) filter (where event = 'free_document_limit_reached') = 1,
  string_agg(event, ', ' order by created_at)
from public.growth_events where organization_id = (select v from ids where k = 'cedro1');

-- Mesma requisição de novo não consome outra vez
do $$
declare org uuid := (select v from ids where k = 'cedro1'); x jsonb;
begin
  x := public.reserve_document(org, 'teste-cedro-1-xxxxxxxx', 'send');
  insert into r (caso, ok, detalhe) values ('Consumo idempotente: reenvio da mesma requisição não cobra de novo',
    (x->>'duplicate')::boolean, x::text);
end $$;

-- Segunda organização da mesma pessoa não reinicia a franquia
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
insert into ids values ('cedro2', public.create_organization('Teste Cedro 2', null));
reset role;
do $$
declare x jsonb;
begin
  x := public.reserve_document((select v from ids where k = 'cedro2'), 'teste-cedro2-1-xxxxxxx', 'send');
  insert into r (caso, ok, detalhe) values ('Cedro: segunda organização da mesma pessoa não ganha franquia nova',
    not (x->>'ok')::boolean, x::text);
end $$;

-- Recursos do Cedro
insert into r (caso, ok, detalhe)
select 'Cedro: modelos, várias aprovações e certificado com cadeado; equipe com cadeado; massa/API/relatórios ocultos',
  public.feature_mode(o, 'templates') = 'preview' and public.feature_mode(o, 'approval_multi') = 'preview'
  and public.feature_mode(o, 'team') = 'preview' and public.feature_mode(o, 'bulk_send') = 'hidden'
  and public.feature_mode(o, 'api_webhooks') = 'hidden' and public.feature_mode(o, 'reports') = 'hidden'
  and public.feature_mode(o, 'e_signature') = 'available',
  public.org_features(o)::text
from (select v as o from ids where k = 'cedro1') x;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into public.templates (organization_id, scope, owner_id, name)
      values ((select v from ids where k = 'cedro1'), 'personal', auth.uid(), 'Modelo proibido');
    insert into r (caso, ok, detalhe) values ('Cedro: banco recusa criar modelo', false, 'gravou');
  exception when insufficient_privilege or check_violation or not_null_violation then
    insert into r (caso, ok, detalhe) values ('Cedro: banco recusa criar modelo', true, sqlerrm);
  end;
  begin
    perform public.invite_member((select v from ids where k = 'cedro1'), 'convidado@teste.mdsign', 'member', null);
    insert into r (caso, ok, detalhe) values ('Cedro: não convida 2º usuário', false, 'convidou');
  exception when others then
    insert into r (caso, ok, detalhe) values ('Cedro: não convida 2º usuário', sqlerrm like '%limit%', sqlerrm);
  end;
end $$;
reset role;

-- Jacarandá: 50 por mês
update public.subscriptions set plan_id = 'jacaranda', plan_version_id = 'lancamento_2026_11'
  where organization_id = (select v from ids where k = 'cedro2');
do $$
declare org uuid := (select v from ids where k = 'cedro2'); x jsonb; i int; okn int := 0;
begin
  for i in 1..51 loop
    x := public.reserve_document(org, 'teste-jac-' || i || '-xxxxxxxxx', 'send');
    if (x->>'ok')::boolean then okn := okn + 1; perform public.commit_document((x->>'reservation')::uuid, null, null); end if;
  end loop;
  insert into r (caso, ok, detalhe) values ('Jacarandá: 50 documentos no mês e o 51º bloqueado', okn = 50 and not (x->>'ok')::boolean,
    okn || ' aceitos; último: ' || x::text);
end $$;
insert into r (caso, ok, detalhe)
select 'Jacarandá: modelos e várias aprovações liberados; equipe com cadeado; formulários/WhatsApp com cadeado; massa e API ocultos',
  public.feature_mode(o, 'templates') = 'available' and public.feature_mode(o, 'approval_multi') = 'available'
  and public.feature_mode(o, 'team') = 'preview' and public.feature_mode(o, 'forms') = 'preview'
  and public.feature_mode(o, 'whatsapp') = 'preview' and public.feature_mode(o, 'bulk_send') = 'hidden'
  and public.feature_mode(o, 'api_webhooks') = 'hidden' and public.entitlement_int(o, 'users_max') = 1,
  public.org_features(o)::text
from (select v as o from ids where k = 'cedro2') x;

-- Ipê: 4 usuários, ilimitado
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
insert into ids values ('ipe', public.create_organization('Teste Ipe', null));
reset role;
update public.subscriptions set plan_id = 'ipe', plan_version_id = 'lancamento_2026_11', billing_status = 'exempt'
  where organization_id = (select v from ids where k = 'ipe');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare org uuid := (select v from ids where k = 'ipe'); i int; okn int := 0; erro text;
begin
  for i in 1..4 loop
    begin
      perform public.invite_member(org, 'pessoa' || i || '@teste.mdsign', 'member', null);
      okn := okn + 1;
    exception when others then erro := sqlerrm;
    end;
  end loop;
  insert into r (caso, ok, detalhe) values ('Ipê: dona + 3 convites cabem; o 4º convite (5º usuário) é recusado',
    okn = 3 and erro like '%limit%', okn || ' convites; erro: ' || coalesce(erro, '-'));
end $$;
reset role;
do $$
declare org uuid := (select v from ids where k = 'ipe'); x jsonb; i int; okn int := 0;
begin
  for i in 1..120 loop
    x := public.reserve_document(org, 'teste-ipe-' || i || '-xxxxxxxxx', 'send');
    if (x->>'ok')::boolean then okn := okn + 1; end if;
  end loop;
  insert into r (caso, ok, detalhe) values ('Ipê: documentos ilimitados (120 no mês, sem bloqueio)', okn = 120, okn || ' aceitos');
end $$;
insert into r (caso, ok, detalhe)
select 'Ipê: equipe, permissões, formulários, WhatsApp e relatórios liberados; massa, API e relatórios avançados com cadeado',
  public.feature_mode(o, 'team') = 'available' and public.feature_mode(o, 'advanced_management') = 'available'
  and public.feature_mode(o, 'forms') = 'available' and public.feature_mode(o, 'reports') = 'available'
  and public.feature_mode(o, 'bulk_send') = 'preview' and public.feature_mode(o, 'api_webhooks') = 'preview'
  and public.feature_mode(o, 'reports_advanced') = 'preview' and not public.entitlement_bool(o, 'integrations_access'),
  public.org_features(o)::text
from (select v as o from ids where k = 'ipe') x;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare x jsonb;
begin
  x := public.org_report((select v from ids where k = 'ipe'), now() - interval '1 day', now() + interval '1 day', '{"status":"pending"}');
  begin
    x := public.org_report((select v from ids where k = 'ipe'), now() - interval '1 day', now() + interval '1 day', '{"origin":"send"}');
    insert into r (caso, ok, detalhe) values ('Ipê: relatório básico sim, filtro avançado não', false, 'filtro avançado passou');
  exception when insufficient_privilege then
    insert into r (caso, ok, detalhe) values ('Ipê: relatório básico sim, filtro avançado não', true, sqlerrm);
  end;
  begin
    insert into public.processes (organization_id, name, created_by)
      values ((select v from ids where k = 'ipe'), 'Processo proibido', auth.uid());
    insert into r (caso, ok, detalhe) values ('Ipê: banco recusa criar envio em massa', false, 'gravou');
  exception when insufficient_privilege or not_null_violation or check_violation then
    insert into r (caso, ok, detalhe) values ('Ipê: banco recusa criar envio em massa', true, sqlerrm);
  end;
end $$;
reset role;

-- Mogno: capacidade por contrato
update public.subscriptions set plan_id = 'mogno', plan_version_id = 'lancamento_2026_11'
  where organization_id = (select v from ids where k = 'ipe');
insert into public.org_entitlement_overrides (organization_id, key, value_int)
  values ((select v from ids where k = 'ipe'), 'users_max', 20), ((select v from ids where k = 'ipe'), 'documents_month', 200);
insert into r (caso, ok, detalhe)
select 'Mogno: API, massa e relatórios avançados liberados; usuários e documentos pelo contrato',
  public.feature_mode(o, 'api_webhooks') = 'available' and public.feature_mode(o, 'bulk_send') = 'available'
  and public.feature_mode(o, 'reports_advanced') = 'available' and public.entitlement_bool(o, 'integrations_access')
  and public.entitlement_int(o, 'users_max') = 20 and public.entitlement_int(o, 'documents_month') = 200,
  'usuarios=' || public.entitlement_int(o, 'users_max') || ' docs/mês=' || public.entitlement_int(o, 'documents_month')
from (select v as o from ids where k = 'ipe') x;
do $$
declare x jsonb;
begin
  -- já usou 120 no mês; contrato de 200 → o 121º passa
  x := public.reserve_document((select v from ids where k = 'ipe'), 'teste-mogno-1-xxxxxxx', 'send');
  insert into r (caso, ok, detalhe) values ('Mogno: consumo segue o limite do contrato', (x->>'ok')::boolean, x::text);
end $$;

-- Catálogo: planos públicos e preço do Ipê (Angico e Aroeira vêm marcados como fora do catálogo)
insert into r (caso, ok, detalhe)
select 'Oferta: públicos só Cedro, Jacarandá, Ipê e Mogno; Ipê R$ 99,97 com 4 usuários',
  (select string_agg(p->>'id', ',' order by (p->>'sort')::int) from jsonb_array_elements(o->'plans') p
     where (p->>'is_public')::boolean) = 'cedro,jacaranda,ipe,mogno'
  and exists (select 1 from jsonb_array_elements(o->'plans') p where p->>'id' = 'ipe'
              and (p->>'price_cents')::int = 9997 and (p->'entitlements'->>'users_max')::int = 4),
  (select string_agg((p->>'id') || ':' || coalesce(p->>'price_cents', 'contrato'), ', ') from jsonb_array_elements(o->'plans') p)
from (select public.plan_offer() o) x;

select n, case when ok then 'PASSOU' else 'FALHOU' end resultado, caso, left(detalhe, 160) detalhe from r order by n;
rollback;
