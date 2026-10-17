-- MDSign — Super Admin → Planos & Funcionalidades: matriz comercial editável (preço, franquia,
-- usuários, apresentação), catálogo de funcionalidades reais, disponibilidade por plano
-- (disponível, prévia, oculto, conforme contrato), navegação progressiva, contratos Mogno,
-- condições aceitas por contratação, custo documental e auditoria.
--
-- Regras:
-- - Só acréscimos. Tudo é editado numa versão em RASCUNHO e só vale depois de publicada
--   (validação na publicação). Quem contratou mantém a versão contratada.
-- - O navegador nunca concede funcionalidade: feature_mode/feature_enabled decidem no banco e
--   as operações (RLS e funções) conferem.
-- - Funcionalidade que não está funcional (implementation <> 'functional') nunca aparece como
--   disponível, qualquer que seja a configuração.
-- - Exclusivas do Mogno (API e Webhooks) não podem ser liberadas em outros planos.

-- 1. Apresentação comercial por versão ----------------------------------------------------------
alter table public.plan_version_prices
  add column period text not null default 'month' check (period in ('one_time', 'month', 'contract')),
  add column description text check (char_length(description) <= 300),
  add column benefits jsonb not null default '[]'::jsonb check (jsonb_typeof(benefits) = 'array'),
  add column sort integer not null default 0,
  add column highlight boolean not null default false,
  add column is_public boolean not null default true,
  add column cta text check (char_length(cta) <= 40),
  add column audience text check (char_length(audience) <= 200);

update public.plan_version_prices vp set sort = p.sort, is_public = p.is_public,
  period = case vp.plan_id when 'cedro' then 'one_time' when 'mogno' then 'contract' else 'month' end
from public.plans p where p.id = vp.plan_id;

-- Textos da matriz oficial (rascunho matriz_2026_11).
update public.plan_version_prices set
  description = case plan_id
    when 'cedro' then 'Para experimentar o MDSign.'
    when 'jacaranda' then 'Produtividade individual.'
    when 'angico' then 'Colaboração para pequenas equipes.'
    when 'aroeira' then 'Escala operacional.'
    when 'ipe' then 'Gestão avançada.'
    when 'mogno' then 'Corporativo, sob medida.' end,
  audience = case plan_id
    when 'cedro' then 'Pessoas que desejam experimentar a plataforma.'
    when 'jacaranda' then 'Profissional que assina e envia documentos regularmente.'
    when 'angico' then 'Pequenas equipes que compartilham a operação de assinaturas.'
    when 'aroeira' then 'Equipes com maior necessidade de organização e acompanhamento.'
    when 'ipe' then 'Empresas que precisam de capacidade administrativa e controle operacional.'
    when 'mogno' then 'Organizações com integração, automação e contratação empresarial.' end,
  benefits = case plan_id
    when 'cedro' then '["5 documentos gratuitos por pessoa", "Assinatura eletrônica", "1 usuário"]'::jsonb
    when 'jacaranda' then '["50 documentos por mês", "Modelos de documentos", "1 usuário"]'::jsonb
    when 'angico' then '["Documentos ilimitados", "Até 4 usuários", "Equipes e colaboração"]'::jsonb
    when 'aroeira' then '["Documentos ilimitados", "Até 6 usuários", "Envio em massa e relatórios"]'::jsonb
    when 'ipe' then '["Documentos ilimitados", "Até 10 usuários", "Gestão avançada"]'::jsonb
    when 'mogno' then '["API e Webhooks", "Integrações corporativas", "Condições contratuais"]'::jsonb end,
  cta = case plan_id when 'cedro' then 'Começar grátis' when 'mogno' then 'Falar com especialista' else 'Assinar' end,
  highlight = plan_id = 'angico'
where version_id = 'matriz_2026_11';

-- 2. Catálogo de funcionalidades reais ------------------------------------------------------------
create table public.features (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{2,40}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text not null check (char_length(description) <= 400),
  benefit text check (char_length(benefit) <= 300),
  category text not null check (category in ('essencial', 'produtividade', 'equipe', 'gestao', 'integracao', 'seguranca')),
  implementation text not null check (implementation in ('functional', 'partial', 'in_development', 'not_applicable')),
  implementation_note text check (char_length(implementation_note) <= 400),
  depends_on text[] not null default '{}',
  permission text,
  nav_keys text[] not null default '{}',
  core boolean not null default false,
  exclusive_plan text references public.plans (id),
  sort integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.features (code, name, description, benefit, category, implementation, implementation_note,
  depends_on, permission, nav_keys, core, exclusive_plan, sort) values
  ('dashboard', 'Painel inicial', 'Início com pendências, atalhos e consumo do plano.', 'Saber o que precisa de atenção hoje.',
   'essencial', 'functional', 'Tela e dados reais (org_usage, documentos).', '{}', null, '{home}', true, null, 10),
  ('documents', 'Documentos', 'Lista, busca, situação, linha do tempo e download dos documentos.', 'Acompanhar cada assinatura até o fim.',
   'essencial', 'functional', 'RLS por organização; download pelo motor.', '{}', 'documents.view', '{documents}', true, null, 20),
  ('e_signature', 'Assinatura eletrônica', 'Só eu assino e envio para assinatura com autenticação por e-mail.', 'Assinar e coletar assinaturas com validade jurídica.',
   'essencial', 'functional', 'Testado em envios reais (17/10/2026).', '{documents}', 'documents.create', '{sign,send}', true, null, 30),
  ('contacts', 'Contatos', 'Agenda de pessoas com quem a organização assina.', 'Preencher participantes em segundos.',
   'essencial', 'functional', 'RLS contacts.manage.', '{}', 'contacts.manage', '{contacts}', true, null, 40),
  ('certificate_signature', 'Assinatura com certificado digital', 'Assinatura com certificado ICP-Brasil (A1/A3).', 'Máxima força jurídica, validada pelo ITI.',
   'seguranca', 'in_development', 'Código pronto; falta teste real com certificado e liberar o método (SIGNDOC_AUTH_METHODS=certificate).', '{e_signature}', 'documents.create', '{}', false, null, 50),
  ('templates', 'Modelos de documentos', 'Modelos com campos, papéis e posições de assinatura; biblioteca MDSign.', 'Gerar contratos repetitivos em minutos.',
   'produtividade', 'functional', 'RLS templates.manage e geração no servidor.', '{e_signature}', 'templates.manage', '{templates}', false, null, 60),
  ('team', 'Equipes e colaboração', 'Convidar pessoas para a organização com papéis e permissões.', 'Dividir a operação de assinaturas com a equipe.',
   'equipe', 'functional', 'Limite de usuários aplicado no convite (invite_member).', '{}', 'members.manage', '{members}', false, null, 70),
  ('forms', 'Formulários e links públicos', 'Links em que a pessoa preenche os dados e assina sem criar conta.', 'Receber documentos assinados sem trabalho manual.',
   'produtividade', 'functional', 'RLS forms e função pública com vagas atômicas.', '{templates}', 'templates.manage', '{forms}', false, null, 80),
  ('bulk_send', 'Envio em massa', 'Um documento para cada linha da planilha ou parte de um PDF, com processos salvos.', 'Enviar centenas de documentos de uma vez.',
   'produtividade', 'functional', 'Lotes no servidor com reserva por item.', '{templates}', 'bulk.send', '{bulk,processes}', false, null, 90),
  ('reports', 'Relatórios avançados', 'Indicadores por período, pessoa, unidade, modelo e origem, com exportação.', 'Medir a operação e prestar contas.',
   'gestao', 'functional', 'org_report por organização.', '{documents}', 'reports.export', '{reports}', false, null, 100),
  ('advanced_management', 'Gestão avançada', 'Unidades e departamentos, grupos (inclusive com quórum) e delegações de aprovação.', 'Organizar a empresa e garantir continuidade nas aprovações.',
   'gestao', 'functional', 'RLS em unidades, grupos e delegações.', '{team}', 'members.manage', '{units,groups,delegations}', false, null, 110),
  ('api_webhooks', 'API e Webhooks', 'API REST com chaves e avisos assinados para o sistema do cliente.', 'Integrar o MDSign ao ERP, RH ou CRM.',
   'integracao', 'functional', 'Exclusivo Mogno (política comercial).', '{}', 'integrations.manage', '{integrations}', false, 'mogno', 120),
  ('whatsapp', 'Notificações por WhatsApp', 'Convites e lembretes por WhatsApp com link seguro.', 'Mais assinaturas no mesmo dia.',
   'produtividade', 'in_development', 'Provedor (BotConversa) ainda não configurado.', '{e_signature}', 'members.manage', '{}', false, null, 130);

-- 3. Disponibilidade por plano e versão -----------------------------------------------------------
create table public.plan_version_features (
  version_id text not null references public.plan_versions (id) on delete restrict,
  plan_id text not null references public.plans (id) on delete restrict,
  feature_code text not null references public.features (code) on delete restrict,
  mode text not null check (mode in ('available', 'preview', 'hidden', 'contract')),
  primary key (version_id, plan_id, feature_code)
);

-- Versão vigente (matriz_2026_10): o comportamento de hoje — tudo liberado, API só no Mogno.
insert into public.plan_version_features (version_id, plan_id, feature_code, mode)
select 'matriz_2026_10', p.id, f.code,
  case when f.exclusive_plan is not null and f.exclusive_plan <> p.id then 'hidden'
       when f.code = 'certificate_signature' and p.id = 'cedro' then 'hidden'
       else 'available' end
from public.plans p cross join public.features f;

-- Rascunho oficial (matriz_2026_11): diferenciação proposta, ajustada pela auditoria.
insert into public.plan_version_features (version_id, plan_id, feature_code, mode)
select 'matriz_2026_11', x.plan_id, x.code, x.mode from (values
  ('dashboard','cedro','available'),('dashboard','jacaranda','available'),('dashboard','angico','available'),('dashboard','aroeira','available'),('dashboard','ipe','available'),('dashboard','mogno','available'),
  ('documents','cedro','available'),('documents','jacaranda','available'),('documents','angico','available'),('documents','aroeira','available'),('documents','ipe','available'),('documents','mogno','available'),
  ('e_signature','cedro','available'),('e_signature','jacaranda','available'),('e_signature','angico','available'),('e_signature','aroeira','available'),('e_signature','ipe','available'),('e_signature','mogno','available'),
  ('contacts','cedro','available'),('contacts','jacaranda','available'),('contacts','angico','available'),('contacts','aroeira','available'),('contacts','ipe','available'),('contacts','mogno','available'),
  ('certificate_signature','cedro','hidden'),('certificate_signature','jacaranda','available'),('certificate_signature','angico','available'),('certificate_signature','aroeira','available'),('certificate_signature','ipe','available'),('certificate_signature','mogno','contract'),
  ('templates','cedro','preview'),('templates','jacaranda','available'),('templates','angico','available'),('templates','aroeira','available'),('templates','ipe','available'),('templates','mogno','contract'),
  ('team','cedro','preview'),('team','jacaranda','preview'),('team','angico','available'),('team','aroeira','available'),('team','ipe','available'),('team','mogno','contract'),
  ('forms','cedro','hidden'),('forms','jacaranda','preview'),('forms','angico','available'),('forms','aroeira','available'),('forms','ipe','available'),('forms','mogno','contract'),
  ('bulk_send','cedro','hidden'),('bulk_send','jacaranda','preview'),('bulk_send','angico','preview'),('bulk_send','aroeira','available'),('bulk_send','ipe','available'),('bulk_send','mogno','contract'),
  ('reports','cedro','hidden'),('reports','jacaranda','preview'),('reports','angico','preview'),('reports','aroeira','available'),('reports','ipe','available'),('reports','mogno','contract'),
  ('advanced_management','cedro','hidden'),('advanced_management','jacaranda','hidden'),('advanced_management','angico','preview'),('advanced_management','aroeira','preview'),('advanced_management','ipe','available'),('advanced_management','mogno','contract'),
  ('api_webhooks','cedro','hidden'),('api_webhooks','jacaranda','hidden'),('api_webhooks','angico','hidden'),('api_webhooks','aroeira','hidden'),('api_webhooks','ipe','preview'),('api_webhooks','mogno','available'),
  ('whatsapp','cedro','hidden'),('whatsapp','jacaranda','preview'),('whatsapp','angico','available'),('whatsapp','aroeira','available'),('whatsapp','ipe','available'),('whatsapp','mogno','contract')
) as x(code, plan_id, mode);

-- Exclusivas do Mogno: nenhuma versão pode liberar em outro plano (nem por edição direta).
create function public.plan_version_features_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare excl text;
begin
  select exclusive_plan into excl from public.features where code = new.feature_code;
  if excl is not null and new.plan_id <> excl and new.mode in ('available', 'contract') then
    raise exception 'feature_exclusive' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger plan_version_features_guard before insert or update on public.plan_version_features
  for each row execute function public.plan_version_features_guard();

-- 4. Contratos Mogno: condições individuais (funcionalidades e limites) ---------------------------
create table public.org_feature_overrides (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  feature_code text not null references public.features (code) on delete restrict,
  mode text not null check (mode in ('available', 'preview', 'hidden')),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, feature_code)
);
create table public.org_entitlement_overrides (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key in ('documents_month', 'users_max')),
  value_int integer check (value_int is null or value_int between 0 and 1000000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, key)
);

-- 5. Condições aceitas em cada contratação (registro histórico, não muda depois) --------------------
create table public.subscription_terms (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_id text not null,
  version_id text not null,
  price_cents integer,
  entitlements jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz not null default now()
);
create index subscription_terms_org_idx on public.subscription_terms (organization_id, accepted_at desc);

create function public.record_subscription_terms() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.plan_id is distinct from old.plan_id
     or new.plan_version_id is distinct from old.plan_version_id then
    insert into public.subscription_terms (organization_id, plan_id, version_id, price_cents, entitlements, features, accepted_by)
    select new.organization_id, new.plan_id, new.plan_version_id,
      (select price_cents from public.plan_version_prices where version_id = new.plan_version_id and plan_id = new.plan_id),
      coalesce((select jsonb_object_agg(key, coalesce(to_jsonb(value_int), to_jsonb(value_bool)))
        from public.plan_version_entitlements where version_id = new.plan_version_id and plan_id = new.plan_id), '{}'::jsonb),
      coalesce((select jsonb_object_agg(feature_code, mode) from public.plan_version_features
        where version_id = new.plan_version_id and plan_id = new.plan_id), '{}'::jsonb),
      auth.uid();
  end if;
  return new;
end;
$$;
create trigger subscriptions_record_terms after insert or update of plan_id, plan_version_id on public.subscriptions
  for each row execute function public.record_subscription_terms();

-- Ponto de partida: as condições atuais de cada assinatura existente.
insert into public.subscription_terms (organization_id, plan_id, version_id, price_cents, entitlements, features)
select s.organization_id, s.plan_id, s.plan_version_id,
  (select price_cents from public.plan_version_prices where version_id = s.plan_version_id and plan_id = s.plan_id),
  coalesce((select jsonb_object_agg(key, coalesce(to_jsonb(value_int), to_jsonb(value_bool)))
    from public.plan_version_entitlements where version_id = s.plan_version_id and plan_id = s.plan_id), '{}'::jsonb),
  coalesce((select jsonb_object_agg(feature_code, mode) from public.plan_version_features
    where version_id = s.plan_version_id and plan_id = s.plan_id), '{}'::jsonb)
from public.subscriptions s;

alter table public.features enable row level security;
alter table public.plan_version_features enable row level security;
alter table public.org_feature_overrides enable row level security;
alter table public.org_entitlement_overrides enable row level security;
alter table public.subscription_terms enable row level security;
revoke all on public.features, public.plan_version_features, public.org_feature_overrides,
  public.org_entitlement_overrides, public.subscription_terms from anon, authenticated;

-- 6. Decisão de acesso (fonte única) ------------------------------------------------------------
-- feature_mode: 'available' | 'preview' | 'hidden' para a organização (versão contratada +
-- contrato Mogno). 'contract' sem condição específica = disponível no Mogno.
create function public.feature_mode(org uuid, code text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  f record;
  m text;
  ov text;
  plan text;
begin
  select * into f from public.features where features.code = feature_mode.code;
  if not found then return 'hidden'; end if;
  select s.plan_id, pf.mode into plan, m
    from public.subscriptions s
    left join public.plan_version_features pf
      on pf.version_id = s.plan_version_id and pf.plan_id = s.plan_id and pf.feature_code = f.code
    where s.organization_id = org;
  if plan = 'mogno' then
    select o.mode into ov from public.org_feature_overrides o where o.organization_id = org and o.feature_code = f.code;
    if ov is not null then m := ov; end if;
  end if;
  m := coalesce(m, 'hidden');
  if m = 'contract' then m := case when plan = 'mogno' then 'available' else 'hidden' end; end if;
  -- Exclusividade nunca é furada, nem por dado antigo.
  if f.exclusive_plan is not null and plan is distinct from f.exclusive_plan and m = 'available' then
    m := 'preview';
  end if;
  -- Não funcional nunca aparece como disponível (nem é anunciada como tal).
  if f.implementation <> 'functional' and m = 'available' then m := 'hidden'; end if;
  return m;
end;
$$;

create function public.feature_enabled(org uuid, code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.feature_mode(org, code) = 'available';
$$;

-- Para a tela do app: o modo de cada funcionalidade na organização atual (só membros).
create function public.org_features(org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  if not (public.is_org_member(org) or public.is_platform_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select coalesce(jsonb_object_agg(f.code, public.feature_mode(org, f.code)), '{}'::jsonb) into out
  from public.features f;
  return out;
end;
$$;

-- Oferta pública das funcionalidades por plano (comparação comercial): versão publicada,
-- sem dados de organização. Não funcional aparece como 'hidden'.
create function public.plan_features_offer() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'version', public.current_plan_version(),
    'features', coalesce((select jsonb_agg(jsonb_build_object('code', f.code, 'name', f.name,
        'description', f.description, 'benefit', f.benefit, 'category', f.category, 'core', f.core,
        'modes', (select jsonb_object_agg(pf.plan_id,
            case when f.implementation <> 'functional' then 'hidden' else pf.mode end)
          from public.plan_version_features pf
          where pf.version_id = public.current_plan_version() and pf.feature_code = f.code))
      order by f.sort) from public.features f), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', vp.plan_id, 'name', p.name,
        'price_cents', vp.price_cents, 'period', vp.period, 'description', vp.description,
        'benefits', vp.benefits, 'highlight', vp.highlight, 'cta', vp.cta, 'sort', vp.sort,
        'entitlements', coalesce((select jsonb_object_agg(e.key, coalesce(to_jsonb(e.value_int), to_jsonb(e.value_bool)))
          from public.plan_version_entitlements e where e.version_id = vp.version_id and e.plan_id = vp.plan_id), '{}'::jsonb))
      order by vp.sort)
      from public.plan_version_prices vp join public.plans p on p.id = vp.plan_id
      where vp.version_id = public.current_plan_version() and vp.is_public), '[]'::jsonb));
$$;

revoke execute on function public.feature_mode(uuid, text) from public, anon, authenticated;
revoke execute on function public.feature_enabled(uuid, text) from public, anon;
grant execute on function public.feature_enabled(uuid, text) to authenticated, service_role;
revoke execute on function public.org_features(uuid) from public, anon;
grant execute on function public.org_features(uuid) to authenticated;
revoke execute on function public.plan_features_offer() from public, anon;
grant execute on function public.plan_features_offer() to authenticated, service_role;
revoke execute on function public.plan_version_features_guard() from public, anon, authenticated;
revoke execute on function public.record_subscription_terms() from public, anon, authenticated;

-- 7. Direitos: contrato Mogno sobrepõe limites; booleano lido da versão contratada ----------------
create or replace function public.entitlement_exists(org uuid, ent text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (exists (select 1 from public.subscriptions s
      join public.plan_version_entitlements e
        on e.version_id = s.plan_version_id and e.plan_id = s.plan_id and e.key = ent
      where s.organization_id = org)
    or exists (select 1 from public.subscriptions s
      join public.plan_entitlements pe on pe.plan_id = s.plan_id and pe.key = ent
      where s.organization_id = org and s.plan_version_id is null)
    or exists (select 1 from public.org_entitlement_overrides o
      join public.subscriptions s on s.organization_id = o.organization_id and s.plan_id = 'mogno'
      where o.organization_id = org and o.key = ent and o.value_int is not null));
$$;
create or replace function public.entitlement_int(org uuid, ent text) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select o.value_int from public.org_entitlement_overrides o
      join public.subscriptions s on s.organization_id = o.organization_id and s.plan_id = 'mogno'
      where o.organization_id = org and o.key = ent),
    (select e.value_int from public.subscriptions s
      join public.plan_version_entitlements e
        on e.version_id = s.plan_version_id and e.plan_id = s.plan_id and e.key = ent
      where s.organization_id = org),
    (select pe.value_int from public.subscriptions s
      join public.plan_entitlements pe on pe.plan_id = s.plan_id and pe.key = ent
      where s.organization_id = org and s.plan_version_id is null));
$$;
-- API e Webhooks (integrations_access) passam a seguir a matriz de funcionalidades.
create or replace function public.entitlement_bool(org uuid, ent text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when ent = 'integrations_access' then public.feature_enabled(org, 'api_webhooks')
    else coalesce(
      (select e.value_bool from public.subscriptions s
        join public.plan_version_entitlements e
          on e.version_id = s.plan_version_id and e.plan_id = s.plan_id and e.key = ent
        where s.organization_id = org),
      (select pe.value_bool from public.subscriptions s
        join public.plan_entitlements pe on pe.plan_id = s.plan_id and pe.key = ent
        where s.organization_id = org and s.plan_version_id is null), false) end;
$$;

-- 8. Operações protegidas no banco (além do menu) -------------------------------------------------
alter policy templates_insert on public.templates
  with check ((((scope = 'organization') and public.has_org_permission(organization_id, 'templates.manage'))
    or ((scope = 'personal') and (owner_id = auth.uid()) and public.has_org_permission(organization_id, 'documents.create')))
    and public.feature_enabled(organization_id, 'templates'));
alter policy forms_insert on public.forms
  with check (public.has_org_permission(organization_id, 'templates.manage')
    and public.feature_enabled(organization_id, 'forms'));
alter policy processes_insert on public.processes
  with check (public.has_org_permission(organization_id, 'bulk.send')
    and public.feature_enabled(organization_id, 'bulk_send'));
alter policy org_groups_write on public.org_groups
  using (public.has_org_permission(organization_id, 'members.manage'))
  with check (public.has_org_permission(organization_id, 'members.manage')
    and public.feature_enabled(organization_id, 'advanced_management'));
alter policy org_group_members_write on public.org_group_members
  using (public.has_org_permission(organization_id, 'members.manage'))
  with check (public.has_org_permission(organization_id, 'members.manage')
    and public.feature_enabled(organization_id, 'advanced_management'));
alter policy units_insert on public.organization_units
  with check (public.has_org_permission(organization_id, 'units.manage')
    and public.feature_enabled(organization_id, 'advanced_management'));
alter policy delegations_insert on public.delegations
  with check ((public.has_org_permission(organization_id, 'members.manage') or (delegator_id = auth.uid()))
    and (created_by = auth.uid()) and (revoked_at is null)
    and public.feature_enabled(organization_id, 'advanced_management'));

-- 9. Custo documental e consumo excepcional (ajustáveis no Super Admin) -----------------------------
insert into public.policies (id, description, config) values
  ('document_cost', 'Custo estimado por documento (centavos) e limite de consumo excepcional por mês',
   '{"cents_per_document": 3, "exceptional_month_docs": 500}')
on conflict (id) do nothing;

-- 10. Super Admin: leitura completa da matriz (todas as versões) ---------------------------------
create function public.admin_plans_catalog() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'current', public.current_plan_version(),
    'versions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'name', v.name, 'status', v.status, 'notes', v.notes,
        'created_at', v.created_at, 'published_at', v.published_at,
        'subscriptions', (select count(*) from public.subscriptions s where s.plan_version_id = v.id),
        'plans', (select jsonb_agg(jsonb_build_object(
            'plan_id', vp.plan_id, 'name', p.name, 'price_cents', vp.price_cents, 'period', vp.period,
            'description', vp.description, 'benefits', vp.benefits, 'sort', vp.sort,
            'highlight', vp.highlight, 'is_public', vp.is_public, 'cta', vp.cta, 'audience', vp.audience,
            'entitlements', coalesce((select jsonb_object_agg(e.key, coalesce(to_jsonb(e.value_int), to_jsonb(e.value_bool)))
              from public.plan_version_entitlements e where e.version_id = v.id and e.plan_id = vp.plan_id), '{}'::jsonb),
            'features', coalesce((select jsonb_object_agg(pf.feature_code, pf.mode)
              from public.plan_version_features pf where pf.version_id = v.id and pf.plan_id = vp.plan_id), '{}'::jsonb))
          order by vp.sort)
          from public.plan_version_prices vp join public.plans p on p.id = vp.plan_id where vp.version_id = v.id))
      order by v.created_at) from public.plan_versions v), '[]'::jsonb),
    'features', coalesce((select jsonb_agg(to_jsonb(f) - 'updated_by' order by f.sort) from public.features f), '[]'::jsonb),
    'roles', coalesce((select jsonb_object_agg(role, perms) from (
        select role::text as role, jsonb_agg(permission order by permission) as perms
        from public.role_permissions group by role) r), '{}'::jsonb),
    'cost', coalesce((select config from public.policies where id = 'document_cost'), '{}'::jsonb)
  ) into out;
  return out;
end;
$$;

-- Novo rascunho a partir de uma versão (para editar sem tocar no que está publicado).
create function public.admin_plan_version_clone(from_id text, new_id text, new_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.plan_versions where id = from_id)
     or exists (select 1 from public.plan_versions where status = 'draft') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  insert into public.plan_versions (id, name, status, notes)
    values (new_id, new_name, 'draft', 'Rascunho criado a partir de ' || from_id);
  insert into public.plan_version_prices (version_id, plan_id, price_cents, period, description, benefits, sort, highlight, is_public, cta, audience)
    select new_id, plan_id, price_cents, period, description, benefits, sort, highlight, is_public, cta, audience
    from public.plan_version_prices where version_id = from_id;
  insert into public.plan_version_entitlements (version_id, plan_id, key, value_int, value_bool)
    select new_id, plan_id, key, value_int, value_bool from public.plan_version_entitlements where version_id = from_id;
  insert into public.plan_version_features (version_id, plan_id, feature_code, mode)
    select new_id, plan_id, feature_code, mode from public.plan_version_features where version_id = from_id;
  perform public.write_audit(null, 'plan_version.created', 'plan_version', new_id, jsonb_build_object('from', from_id));
exception when check_violation or unique_violation then raise exception 'invalid_request' using errcode = 'P0001';
end;
$$;

-- Editar um plano no rascunho: preço (centavos), apresentação, franquia e usuários.
-- documents: {"mode": "total"|"month"|"unlimited"|"contract", "value": n}; users: n ou null (contrato).
create function public.admin_plan_version_save_plan(vid text, pid text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  before jsonb;
  dmode text := p -> 'documents' ->> 'mode';
  dval integer;
  users integer;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.plan_versions where id = vid and status = 'draft') then
    raise exception 'version_not_draft' using errcode = 'P0001';
  end if;
  select to_jsonb(vp) into before from public.plan_version_prices vp where version_id = vid and plan_id = pid;
  if before is null then raise exception 'invalid_request' using errcode = 'P0001'; end if;
  -- Validações comerciais: preço em centavos; Cedro grátis; Mogno sob consulta.
  if pid = 'mogno' and p ? 'price_cents' and p ->> 'price_cents' is not null then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if pid <> 'mogno' and (jsonb_typeof(p -> 'price_cents') <> 'number' or (p ->> 'price_cents')::numeric < 0
       or (p ->> 'price_cents')::numeric <> floor((p ->> 'price_cents')::numeric)
       or (pid = 'cedro' and (p ->> 'price_cents')::int <> 0)) then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if dmode not in ('total', 'month', 'unlimited', 'contract')
     or (pid = 'cedro' and dmode <> 'total') or (pid = 'mogno' and dmode not in ('contract', 'month', 'unlimited'))
     or (dmode in ('total', 'month') and coalesce((p -> 'documents' ->> 'value')::int, -1) not between 1 and 1000000) then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  dval := (p -> 'documents' ->> 'value')::int;
  users := (p ->> 'users_max')::int;
  if (pid <> 'mogno' and coalesce(users, 0) not between 1 and 10000) or (users is not null and users not between 1 and 10000) then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p -> 'benefits', '[]')) <> 'array' or jsonb_array_length(coalesce(p -> 'benefits', '[]')) > 8
     or exists (select 1 from jsonb_array_elements(coalesce(p -> 'benefits', '[]')) b
                where jsonb_typeof(b) <> 'string' or char_length(b #>> '{}') not between 1 and 80) then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;

  update public.plan_version_prices set
    price_cents = case when pid = 'mogno' then null else (p ->> 'price_cents')::int end,
    period = case when pid = 'cedro' then 'one_time' when pid = 'mogno' then 'contract' else 'month' end,
    description = nullif(left(p ->> 'description', 300), ''),
    audience = nullif(left(p ->> 'audience', 200), ''),
    benefits = coalesce(p -> 'benefits', '[]'::jsonb),
    sort = coalesce((p ->> 'sort')::int, sort),
    highlight = coalesce((p ->> 'highlight')::boolean, false),
    is_public = coalesce((p ->> 'is_public')::boolean, true),
    cta = nullif(left(p ->> 'cta', 40), '')
  where version_id = vid and plan_id = pid;

  delete from public.plan_version_entitlements
    where version_id = vid and plan_id = pid and key in ('documents_total', 'documents_month', 'users_max');
  if dmode = 'total' then
    insert into public.plan_version_entitlements (version_id, plan_id, key, value_int) values (vid, pid, 'documents_total', dval);
  elsif dmode = 'month' then
    insert into public.plan_version_entitlements (version_id, plan_id, key, value_int) values (vid, pid, 'documents_month', dval);
  end if;
  if users is not null then
    insert into public.plan_version_entitlements (version_id, plan_id, key, value_int) values (vid, pid, 'users_max', users);
  end if;
  perform public.write_audit(null, 'plan_version.plan_changed', 'plan_version', vid,
    jsonb_build_object('plan', pid, 'from', before - 'version_id', 'to', p));
exception
  when invalid_text_representation or numeric_value_out_of_range or check_violation then
    raise exception 'invalid_plan' using errcode = 'P0001';
end;
$$;

-- Disponibilidade de uma funcionalidade num plano (rascunho).
create function public.admin_plan_version_set_feature(vid text, pid text, code text, m text) returns void
language plpgsql security definer set search_path = '' as $$
declare previous text;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.plan_versions where id = vid and status = 'draft') then
    raise exception 'version_not_draft' using errcode = 'P0001';
  end if;
  if m not in ('available', 'preview', 'hidden', 'contract') or (m = 'contract' and pid <> 'mogno') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.features where features.code = admin_plan_version_set_feature.code and core) and m <> 'available' then
    raise exception 'feature_core' using errcode = 'P0001';
  end if;
  select mode into previous from public.plan_version_features
    where version_id = vid and plan_id = pid and feature_code = code;
  insert into public.plan_version_features (version_id, plan_id, feature_code, mode) values (vid, pid, code, m)
    on conflict (version_id, plan_id, feature_code) do update set mode = excluded.mode;
  perform public.write_audit(null, 'plan_version.feature_changed', 'plan_version', vid,
    jsonb_build_object('plan', pid, 'feature', code, 'from', previous, 'to', m));
end;
$$;

-- Catálogo: textos e estado de implementação (só depois de validar a operação no servidor).
create function public.admin_feature_save(code text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare before jsonb;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select to_jsonb(f) into before from public.features f where f.code = admin_feature_save.code;
  if before is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.features f set
    name = coalesce(nullif(left(p ->> 'name', 80), ''), f.name),
    description = coalesce(nullif(left(p ->> 'description', 400), ''), f.description),
    benefit = coalesce(nullif(left(p ->> 'benefit', 300), ''), f.benefit),
    implementation = coalesce(p ->> 'implementation', f.implementation),
    implementation_note = coalesce(left(p ->> 'implementation_note', 400), f.implementation_note),
    updated_at = now(), updated_by = auth.uid()
  where f.code = admin_feature_save.code;
  perform public.write_audit(null, 'feature.changed', 'feature', code,
    jsonb_build_object('from', before - 'updated_by' - 'updated_at', 'to', p));
exception when check_violation then raise exception 'invalid_request' using errcode = 'P0001';
end;
$$;

-- Publicação com validação: matriz completa e coerente antes de valer para novos contratos.
create or replace function public.admin_publish_plan_version(vid text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  previous text;
  missing integer;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.plan_versions where id = vid and status = 'draft') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  -- Todos os planos, com preço (exceto Mogno), franquia e usuários.
  if (select count(*) from public.plan_version_prices where version_id = vid) <> (select count(*) from public.plans)
     or exists (select 1 from public.plan_version_prices where version_id = vid and plan_id <> 'mogno' and price_cents is null)
     or not exists (select 1 from public.plan_version_entitlements where version_id = vid and plan_id = 'cedro' and key = 'documents_total')
     or exists (select 1 from public.plan_version_prices vp where vp.version_id = vid and vp.plan_id <> 'mogno'
                and not exists (select 1 from public.plan_version_entitlements e where e.version_id = vid
                                and e.plan_id = vp.plan_id and e.key = 'users_max')) then
    raise exception 'publish_invalid_plans' using errcode = 'P0001';
  end if;
  -- Toda funcionalidade definida para todo plano.
  select count(*) into missing from public.plans p cross join public.features f
    where not exists (select 1 from public.plan_version_features pf
      where pf.version_id = vid and pf.plan_id = p.id and pf.feature_code = f.code);
  if missing > 0 then raise exception 'publish_invalid_features' using errcode = 'P0001'; end if;
  select id into previous from public.plan_versions where status = 'published';
  update public.plan_versions set status = 'retired' where status = 'published';
  update public.plan_versions set status = 'published', published_at = now(), published_by = auth.uid()
    where id = vid;
  perform public.write_audit(null, 'plan_version.published', 'plan_version', vid,
    jsonb_build_object('previous', previous));
end;
$$;

-- 11. Indicadores, consumo e custo ---------------------------------------------------------------
create function public.admin_plans_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  month text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  cost integer := coalesce((select (config ->> 'cents_per_document')::int from public.policies where id = 'document_cost'), 3);
  excep integer := coalesce((select (config ->> 'exceptional_month_docs')::int from public.policies where id = 'document_cost'), 500);
  out jsonb;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  with orgs as (
    select o.id, s.plan_id, s.billing_status, s.value_cents, s.provider,
      coalesce((select u.value from public.usage_counters u where u.organization_id = o.id and u.period = month and u.metric = 'documents'), 0) as docs_month,
      (select count(*) from public.memberships m where m.organization_id = o.id and m.status = 'active') as users
    from public.organizations o join public.subscriptions s on s.organization_id = o.id
    where o.closed_at is null
  )
  select jsonb_build_object(
    'month', month,
    'cost_cents_per_document', cost,
    'by_plan', coalesce((select jsonb_agg(jsonb_build_object('plan_id', p.id, 'name', p.name,
        'orgs', (select count(*) from orgs where orgs.plan_id = p.id),
        'users', (select coalesce(sum(users), 0) from orgs where orgs.plan_id = p.id),
        'docs_month', (select coalesce(sum(docs_month), 0) from orgs where orgs.plan_id = p.id)) order by p.sort)
      from public.plans p), '[]'::jsonb),
    'free_orgs', (select count(*) from orgs where plan_id = 'cedro'),
    'paid_orgs', (select count(*) from orgs where billing_status = 'paid'),
    'exempt_orgs', (select count(*) from orgs where billing_status = 'exempt'),
    'mrr_cents', (select sum(value_cents) from orgs where billing_status = 'paid' and value_cents is not null),
    'mrr_environment', (select string_agg(distinct c.environment, ',') from public.billing_checkouts c where c.status = 'paid'),
    'docs_month', (select coalesce(sum(docs_month), 0) from orgs),
    'cost_month_cents', (select coalesce(sum(docs_month), 0) * cost from orgs),
    'exceptional', (select count(*) from orgs where docs_month >= excep),
    'conversions', (select count(distinct organization_id) from public.growth_events
      where event in ('paid_plan_activated', 'plan_upgraded')),
    'free_people', (select count(*) from public.free_allowances),
    'free_exhausted', (select count(*) from public.free_allowances where used >= limit_total)
  ) into out;
  return out;
end;
$$;

-- Consumo e custo por organização no mês (receita só confirmada; saldo não é lucro).
create function public.admin_consumption(month text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  m text := coalesce(nullif(month, ''), to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM'));
  cost integer := coalesce((select (config ->> 'cents_per_document')::int from public.policies where id = 'document_cost'), 3);
  excep integer := coalesce((select (config ->> 'exceptional_month_docs')::int from public.policies where id = 'document_cost'), 500);
  out jsonb;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if m !~ '^\d{4}-\d{2}$' then raise exception 'invalid_request' using errcode = 'P0001'; end if;
  with rows as (
    select o.id, o.name, s.plan_id, s.plan_version_id, s.billing_status,
      coalesce((select u.value from public.usage_counters u where u.organization_id = o.id and u.period = m and u.metric = 'documents'), 0) as docs,
      coalesce((select u.value from public.usage_counters u where u.organization_id = o.id and u.period = 'total' and u.metric = 'documents'), 0) as docs_total,
      case when s.billing_status = 'paid' then coalesce(s.value_cents, 0) else 0 end as revenue
    from public.organizations o join public.subscriptions s on s.organization_id = o.id
    where o.closed_at is null
  )
  select jsonb_build_object(
    'month', m, 'cost_cents_per_document', cost, 'exceptional_month_docs', excep,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'plan_id', plan_id,
        'version', plan_version_id, 'billing_status', billing_status, 'docs', docs, 'docs_total', docs_total,
        'cost_cents', docs * cost, 'revenue_cents', revenue, 'balance_cents', revenue - docs * cost,
        'exceptional', docs >= excep) order by docs desc) from rows), '[]'::jsonb),
    'by_plan', coalesce((select jsonb_agg(jsonb_build_object('plan_id', plan_id, 'orgs', n, 'docs', d,
        'avg_docs', round(d::numeric / nullif(n, 0), 1), 'cost_cents', d * cost, 'revenue_cents', r,
        'balance_cents', r - d * cost)) from (select plan_id, count(*) n, sum(docs) d, sum(revenue) r from rows group by plan_id) x), '[]'::jsonb),
    'totals', (select jsonb_build_object('docs', coalesce(sum(docs), 0), 'cost_cents', coalesce(sum(docs), 0) * cost,
        'revenue_cents', coalesce(sum(revenue), 0), 'balance_cents', coalesce(sum(revenue), 0) - coalesce(sum(docs), 0) * cost,
        'avg_docs', round(avg(docs), 1)) from rows),
    'revenue_environment', (select string_agg(distinct c.environment, ',') from public.billing_checkouts c where c.status = 'paid')
  ) into out;
  return out;
end;
$$;

-- 12. Contratos Mogno: funcionalidades e limites individuais ---------------------------------------
create function public.admin_mogno_contracts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name,
      'features', coalesce((select jsonb_object_agg(fo.feature_code, fo.mode) from public.org_feature_overrides fo where fo.organization_id = o.id), '{}'::jsonb),
      'limits', coalesce((select jsonb_object_agg(eo.key, eo.value_int) from public.org_entitlement_overrides eo where eo.organization_id = o.id), '{}'::jsonb))
      order by o.name), '[]'::jsonb) into out
  from public.organizations o join public.subscriptions s on s.organization_id = o.id and s.plan_id = 'mogno';
  return out;
end;
$$;

create function public.admin_mogno_contract_save(org uuid, features jsonb, limits jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare k text; v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.subscriptions where organization_id = org and plan_id = 'mogno') then
    raise exception 'not_mogno' using errcode = 'P0001';
  end if;
  delete from public.org_feature_overrides where organization_id = org;
  for k, v in select * from jsonb_each(coalesce(features, '{}')) loop
    insert into public.org_feature_overrides (organization_id, feature_code, mode, updated_by)
      values (org, k, v #>> '{}', auth.uid());
  end loop;
  delete from public.org_entitlement_overrides where organization_id = org;
  for k, v in select * from jsonb_each(coalesce(limits, '{}')) loop
    insert into public.org_entitlement_overrides (organization_id, key, value_int, updated_by)
      values (org, k, nullif(v #>> '{}', '')::int, auth.uid());
  end loop;
  perform public.write_audit(org, 'mogno_contract.changed', 'organization', org::text,
    jsonb_build_object('features', features, 'limits', limits));
exception when check_violation or foreign_key_violation or invalid_text_representation then
  raise exception 'invalid_request' using errcode = 'P0001';
end;
$$;

-- 13. Auditoria comercial ------------------------------------------------------------------------
create function public.admin_commercial_audit() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('at', a.created_at, 'action', a.action, 'entity', a.entity,
      'entity_id', a.entity_id, 'data', a.data, 'actor', coalesce(p.full_name, 'Sistema')) order by a.created_at desc), '[]'::jsonb)
    into out
  from (select * from public.audit_log a
        where a.action like 'plan_version.%' or a.action like 'feature.%' or a.action like 'mogno_contract.%'
           or a.action = 'plan.changed'
           or (a.action = 'policy.changed' and a.entity_id in ('document_cost', 'growth_stages'))
        order by a.created_at desc limit 300) a
  left join public.profiles p on p.id = a.actor_id;
  return out;
end;
$$;

do $$
declare fn regprocedure;
begin
  for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('admin_plans_catalog', 'admin_plan_version_clone',
      'admin_plan_version_save_plan', 'admin_plan_version_set_feature', 'admin_feature_save',
      'admin_publish_plan_version', 'admin_plans_overview', 'admin_consumption', 'admin_mogno_contracts',
      'admin_mogno_contract_save', 'admin_commercial_audit')
  loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

-- 14. Eventos do app: prévia vista e recurso bloqueado clicado (sem duplicar por dia) ---------------
create or replace function public.growth_app_event(org uuid, ev text, payload jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if ev not in ('upgrade_cta_clicked', 'paid_feature_attempted', 'upgrade_offer_viewed',
                'feature_preview_viewed', 'locked_feature_clicked')
     or not public.is_org_member(org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(payload, '{}'::jsonb)) <> 'object' or pg_column_size(payload) > 1000 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if ev in ('upgrade_offer_viewed', 'feature_preview_viewed') and exists (select 1 from public.growth_events g
       where g.organization_id = org and g.event = ev and g.created_at > now() - interval '1 day'
         and coalesce(g.data ->> 'feature', '') = coalesce(payload ->> 'feature', '')) then
    return;
  end if;
  perform public.growth_mark(org, auth.uid(), ev, coalesce(payload, '{}'::jsonb), false);
end;
$$;

-- 15. Eventos do funil com os nomes oficiais (gravação) e leitura compatível com os antigos ------
create or replace function public.reserve_document(org uuid, idem text, origin text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  month text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  sub_status text;
  sub_plan text;
  ex_id uuid;
  ex_org uuid;
  ex_status text;
  ex_doc uuid;
  person uuid;
  a_used integer;
  a_limit integer;
  month_limit integer;
  used_month integer;
  src text;
  rid uuid;
  n integer;
  alert_pct numeric := (select (config->>'percent')::numeric / 100 from public.policies
                         where id = 'usage_alert' and active);
begin
  if idem is null or idem !~ '^[A-Za-z0-9:_.-]{8,200}$' then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  -- Mesma requisição de novo: não consome outra vez.
  select id, organization_id, status, document_id into ex_id, ex_org, ex_status, ex_doc
    from public.document_charges where idempotency_key = idem for update;
  if ex_id is not null and ex_org <> org then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if ex_id is not null and ex_status <> 'released' then
    return jsonb_build_object('ok', true, 'duplicate', true, 'reservation', ex_id,
      'status', ex_status, 'document_id', ex_doc);
  end if;

  select s.status, s.plan_id into sub_status, sub_plan from public.subscriptions s where s.organization_id = org;
  if sub_status in ('suspended', 'canceled') or public.org_closed(org) then
    return jsonb_build_object('ok', false, 'reason', 'subscription_inactive');
  end if;

  if sub_plan = 'cedro' then
    src := 'free';
    person := public.free_person(org);
    if person is null then return jsonb_build_object('ok', false, 'reason', 'plan_limit_reached'); end if;
    -- Controle proporcional contra contas descartáveis: franquia só com e-mail confirmado.
    if not exists (select 1 from auth.users u where u.id = person and u.email_confirmed_at is not null) then
      return jsonb_build_object('ok', false, 'reason', 'email_not_confirmed');
    end if;
    insert into public.free_allowances (user_id, limit_total, version_id)
      values (person, coalesce(public.entitlement_int(org, 'documents_total'), 5), public.current_plan_version())
      on conflict (user_id) do nothing;
    -- Trava a franquia da pessoa: requisições simultâneas (inclusive de outras organizações
    -- dela) esperam esta terminar.
    select used, limit_total into a_used, a_limit from public.free_allowances where user_id = person for update;
    if a_used >= a_limit then
      insert into public.policy_events (organization_id, policy_id, data)
        values (org, 'usage_block', jsonb_build_object('metric', 'documents', 'origin', origin, 'scope', 'person'));
      -- Tentativa de exceder: no máximo 1 registro por pessoa por dia.
      if not exists (select 1 from public.growth_events g where g.user_id = person
           and g.event = 'free_document_limit_reached' and g.created_at > now() - interval '1 day') then
        perform public.growth_mark(org, person, 'free_document_limit_reached',
          jsonb_build_object('used', a_used, 'limit', a_limit), false);
        perform public.growth_mark(org, null, 'paid_feature_attempted',
          jsonb_build_object('feature', 'documents_limit', 'plan', 'cedro'), false);
      end if;
      return jsonb_build_object('ok', false, 'reason', 'plan_limit_reached', 'used', a_used, 'limit', a_limit);
    end if;
    update public.free_allowances set used = used + 1, updated_at = now()
      where user_id = person returning used into n;
  else
    src := 'plan';
    insert into public.usage_counters (organization_id, period, metric) values (org, month, 'documents')
      on conflict do nothing;
    select value into used_month from public.usage_counters
      where organization_id = org and period = month and metric = 'documents' for update;
    month_limit := public.entitlement_int(org, 'documents_month');
    if public.entitlement_exists(org, 'documents_month') and used_month >= month_limit then
      insert into public.policy_events (organization_id, policy_id, data)
        values (org, 'usage_block', jsonb_build_object('metric', 'documents', 'origin', origin));
      perform public.growth_mark(org, null, 'paid_feature_attempted',
        jsonb_build_object('feature', 'documents_limit', 'plan', sub_plan), false);
      return jsonb_build_object('ok', false, 'reason', 'plan_limit_reached',
        'used', used_month, 'limit', month_limit);
    end if;
    n := used_month + 1;
    a_limit := month_limit;
  end if;

  -- Contadores da organização (relatórios e o mês), como antes.
  insert into public.usage_counters (organization_id, period, metric) values (org, 'total', 'documents')
    on conflict do nothing;
  insert into public.usage_counters (organization_id, period, metric) values (org, month, 'documents')
    on conflict do nothing;
  update public.usage_counters set value = value + 1
    where organization_id = org and metric = 'documents' and period in ('total', month);

  if ex_id is not null then
    update public.document_charges set status = 'reserved', person_id = person, source = src,
      period = month, attempts = attempts + 1, error = null, updated_at = now()
      where id = ex_id returning id into rid;
  else
    insert into public.document_charges (idempotency_key, organization_id, person_id, source, period, origin, status)
      values (idem, org, person, src, month, left(origin, 40), 'reserved') returning id into rid;
  end if;

  -- Marcos do funil (uma vez por organização) e alerta de uso do mês.
  if alert_pct is not null and a_limit is not null and n = ceil(a_limit * alert_pct) then
    insert into public.policy_events (organization_id, policy_id, data)
      values (org, 'usage_alert', jsonb_build_object('metric', 'documents', 'period', month, 'scope', src));
  end if;
  if src = 'free' then
    if n = 3 then perform public.growth_mark(org, null, 'free_document_3_used', '{}'::jsonb); end if;
    if n = a_limit - 1 then perform public.growth_mark(org, null, 'free_document_4_used', '{}'::jsonb); end if;
    if n >= a_limit then perform public.growth_mark(org, null, 'free_document_5_used', '{}'::jsonb); end if;
  end if;
  return jsonb_build_object('ok', true, 'duplicate', false, 'reservation', rid, 'status', 'reserved',
    'used', n, 'limit', a_limit);
end;
$function$;
create or replace function public.growth_on_checkout()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    perform public.growth_mark(new.organization_id, new.created_by, 'upgrade_checkout_started',
      jsonb_build_object('plan', new.plan_id, 'checkout', new.id, 'environment', new.environment), false);
  -- "paid" só é gravado pelo processamento do pagamento confirmado (onPaid), nunca pelo clique.
  elsif new.status = 'paid' and old.status is distinct from 'paid' then
    perform public.growth_mark(new.organization_id, new.created_by, 'checkout_completed',
      jsonb_build_object('plan', new.plan_id, 'checkout', new.id, 'environment', new.environment), false);
    perform public.growth_mark(new.organization_id, new.created_by, 'plan_upgraded',
      jsonb_build_object('plan', new.plan_id, 'environment', new.environment));
  end if;
  return new;
end;
$function$;
create or replace function public.org_growth_stage(org uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg jsonb := coalesce((select config from public.policies where id = 'growth_stages' and active), '{}');
  sub record;
  q record;
  concluded integer;
  free_used integer;
  has_event boolean;
begin
  select plan_id, billing_status, status into sub from public.subscriptions where organization_id = org;
  if sub.plan_id is distinct from 'cedro' and (sub.billing_status = 'paid'
     or exists (select 1 from public.growth_events where organization_id = org and event in ('paid_plan_activated', 'plan_upgraded'))) then
    return 'paid';
  end if;
  select * into q from public.org_qualification where organization_id = org;
  if q.use_case in ('company', 'high_volume') and (
       coalesce(q.monthly_volume, 0) >= coalesce((cfg->>'opportunity_volume')::int, 20)
       or coalesce(q.users_count, 0) >= 2 or q.bulk_interest or q.integration_interest) then
    return 'opportunity';
  end if;
  select count(*) into concluded from public.documents where organization_id = org and status = 'concluded';
  free_used := case when sub.plan_id = 'cedro' then public.cedro_free_used(org) else 0 end;
  select exists (select 1 from public.growth_events where organization_id = org
    and event = 'paid_feature_attempted') into has_event;
  if free_used >= coalesce((cfg->>'hot_docs')::int, 4) or has_event then return 'pql_hot'; end if;
  if concluded >= coalesce((cfg->>'pql_docs')::int, 3) or exists (select 1 from public.growth_events
       where organization_id = org and event in ('upgrade_cta_clicked', 'checkout_started', 'upgrade_checkout_started')) then
    return 'pql';
  end if;
  if concluded >= 2 then return 'recurring'; end if;
  if concluded >= 1 then return 'activated'; end if;
  return 'signed_up';
end;
$function$;
create or replace function public.admin_growth_overview(f jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p jsonb := public.growth_filters(f);
  d_from timestamptz := (p ->> 'from')::timestamptz;
  d_to timestamptz := (p ->> 'to')::timestamptz;
  inc boolean := (p ->> 'internal')::boolean;
  last_model boolean := p ->> 'model' = 'last';
  out jsonb;
begin
  perform public.growth_require_admin();
  with
  web as (
    select g.*, coalesce(g.data ->> 'utm_campaign', g.data ->> 'campaign') as camp,
      public.growth_origin(g.data ->> 'utm_source', null) as src
    from public.growth_events g
    where g.created_at >= d_from and g.created_at < d_to
      and g.event in ('acquisition_page_viewed', 'acquisition_cta_clicked', 'signup_started')
      and (inc or coalesce(g.data ->> 'internal', '') <> '1')
      and (p ->> 'source' is null or g.data ->> 'utm_source' = p ->> 'source')
      and (p ->> 'campaign' is null or coalesce(g.data ->> 'utm_campaign', g.data ->> 'campaign') = p ->> 'campaign')
      and (p ->> 'landing' is null or g.data ->> 'page' = p ->> 'landing')
  ),
  ppl as (
    select x.*,
      case when last_model then x.last_source else x.first_source end as src,
      case when last_model then x.last_campaign else x.first_campaign end as camp,
      case when last_model then x.last_landing else x.first_landing end as landing
    from public.growth_people(inc) x
  ),
  people as (
    select * from ppl
    where (p ->> 'source' is null or ppl.src = p ->> 'source')
      and (p ->> 'campaign' is null or ppl.camp = p ->> 'campaign')
      and (p ->> 'landing' is null or ppl.landing = p ->> 'landing')
      and (p ->> 'plan' is null or ppl.plan_id = p ->> 'plan')
      and (p ->> 'stage' is null or ppl.stage = p ->> 'stage')
  ),
  signups as (select * from people where people.created_at >= d_from and people.created_at < d_to),
  ev as (
    select g.event, g.organization_id, g.user_id, g.created_at, g.data from public.growth_events g
    where g.created_at >= d_from and g.created_at < d_to
      and g.event in ('first_document_created', 'first_document_completed', 'second_document_completed',
        'cedro_usage_4_of_5', 'free_document_4_used', 'cedro_limit_reached', 'free_document_5_used', 'upgrade_cta_clicked', 'checkout_started', 'upgrade_checkout_started',
        'paid_feature_attempted', 'paid_plan_activated', 'plan_upgraded')
      and exists (select 1 from people pp where pp.org_id = g.organization_id)
  ),
  days as (select generate_series(date_trunc('day', d_from), date_trunc('day', d_to - interval '1 second'), interval '1 day')::date as d)
  select jsonb_build_object(
    'period', jsonb_build_object('from', d_from, 'to', d_to, 'model', p ->> 'model', 'internal', inc),
    'kpis', jsonb_build_object(
      'visits', (select count(distinct session_id) from web where event = 'acquisition_page_viewed'),
      'page_views', (select count(*) from web where event = 'acquisition_page_viewed'),
      'cta_clicks', (select count(*) from web where event = 'acquisition_cta_clicked'),
      'signup_started', (select count(distinct session_id) from web where event = 'signup_started'),
      'signups', (select count(*) from signups),
      'orgs_created', (select count(*) from signups where org_id is not null),
      'first_document', (select count(distinct organization_id) from ev where event = 'first_document_created'),
      'three_documents', (select count(*) from people where docs_used >= 3),
      'cedro_4_of_5', (select count(distinct organization_id) from ev where event in ('cedro_usage_4_of_5', 'free_document_4_used')),
      'cedro_limit', (select count(distinct organization_id) from ev where event in ('cedro_limit_reached', 'free_document_5_used')),
      'upgrade_clicks', (select count(*) from ev where event in ('upgrade_cta_clicked', 'checkout_started', 'upgrade_checkout_started')),
      'paid', (select count(distinct organization_id) from ev where event in ('paid_plan_activated', 'plan_upgraded')),
      'paid_environment', (select string_agg(distinct coalesce(data ->> 'environment', 'sandbox'), ',')
        from ev where event in ('paid_plan_activated', 'plan_upgraded')),
      'mrr_cents', (select sum(s.value_cents) from public.subscriptions s
        join people pp on pp.org_id = s.organization_id
        where s.plan_id <> 'cedro' and s.billing_status = 'paid' and pp.src <> 'nao_identificada'),
      'mrr_environment', (select string_agg(distinct c.environment, ',') from public.billing_checkouts c
        join people pp on pp.org_id = c.organization_id where c.status = 'paid')),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', days.d,
        'visits', (select count(distinct session_id) from web where event = 'acquisition_page_viewed' and created_at::date = days.d),
        'signups', (select count(*) from signups where created_at::date = days.d),
        'paid', (select count(distinct organization_id) from ev where event in ('paid_plan_activated', 'plan_upgraded') and created_at::date = days.d))
        order by days.d), '[]'::jsonb) from days),
    'by_campaign', (select coalesce(jsonb_agg(r order by r.signups desc, r.visits desc), '[]'::jsonb) from (
        select k.camp as key,
          (select c.name from public.growth_campaigns c where c.slug = k.camp) as name,
          (select count(distinct w.session_id) from web w where w.event = 'acquisition_page_viewed' and w.camp is not distinct from k.camp) as visits,
          (select count(*) from signups s where s.camp is not distinct from k.camp) as signups,
          (select count(*) from signups s where s.camp is not distinct from k.camp and s.stage not in ('no_org', 'signed_up')) as activated,
          (select count(*) from signups s where s.camp is not distinct from k.camp and s.stage = 'paid') as paid
        from (select camp from web union select camp from signups) k limit 100) r),
    'by_channel', (select coalesce(jsonb_agg(r order by r.signups desc, r.visits desc), '[]'::jsonb) from (
        select k.src as key,
          (select count(distinct w.session_id) from web w where w.event = 'acquisition_page_viewed' and w.src = k.src) as visits,
          (select count(*) from signups s where s.src = k.src) as signups,
          (select count(*) from signups s where s.src = k.src and s.stage not in ('no_org', 'signed_up')) as activated,
          (select count(*) from signups s where s.src = k.src and s.stage = 'paid') as paid
        from (select src from web union select src from signups) k limit 100) r),
    'by_landing', (select coalesce(jsonb_agg(r order by r.signups desc, r.visits desc), '[]'::jsonb) from (
        select k.landing as key,
          (select count(distinct w.session_id) from web w where w.event = 'acquisition_page_viewed' and w.data ->> 'page' is not distinct from k.landing) as visits,
          (select count(*) from signups s where s.landing is not distinct from k.landing) as signups
        from (select data ->> 'page' as landing from web where event = 'acquisition_page_viewed'
              union select landing from signups) k limit 100) r),
    'stages', (select coalesce(jsonb_object_agg(stage, n), '{}'::jsonb) from (
        select stage, count(*) n from people group by stage) s),
    'filters', jsonb_build_object(
      'sources', (select coalesce(jsonb_agg(distinct v), '[]'::jsonb) from (
          select src v from ppl union select data ->> 'utm_source' from public.growth_events
          where data ? 'utm_source') x where v is not null),
      'campaigns', (select coalesce(jsonb_agg(distinct v), '[]'::jsonb) from (
          select camp v from ppl union select slug from public.growth_campaigns
          union select coalesce(data ->> 'utm_campaign', data ->> 'campaign') from public.growth_events) x where v is not null),
      'landings', (select coalesce(jsonb_agg(distinct v), '[]'::jsonb) from (
          select landing v from ppl union select data ->> 'page' from public.growth_events
          where event = 'acquisition_page_viewed') x where v is not null),
      'plans', (select coalesce(jsonb_agg(distinct plan_id), '[]'::jsonb) from public.subscriptions))
  ) into out;
  return out;
end;
$function$;
create or replace function public.admin_growth_funnel_v2(f jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p jsonb := public.growth_filters(f);
  d_from timestamptz := (p ->> 'from')::timestamptz;
  d_to timestamptz := (p ->> 'to')::timestamptz;
  inc boolean := (p ->> 'internal')::boolean;
  last_model boolean := p ->> 'model' = 'last';
  out jsonb;
begin
  perform public.growth_require_admin();
  with
  sess as (
    select g.session_id, g.event, coalesce(g.data ->> 'utm_campaign', g.data ->> 'campaign') as camp,
      public.growth_origin(g.data ->> 'utm_source', null) as src
    from public.growth_events g
    where g.created_at >= d_from and g.created_at < d_to and g.session_id is not null
      and g.event in ('acquisition_page_viewed', 'acquisition_cta_clicked', 'signup_started')
      and (inc or coalesce(g.data ->> 'internal', '') <> '1')
      and (p ->> 'source' is null or g.data ->> 'utm_source' = p ->> 'source')
      and (p ->> 'campaign' is null or coalesce(g.data ->> 'utm_campaign', g.data ->> 'campaign') = p ->> 'campaign')
  ),
  viewed as (select distinct session_id from sess where event = 'acquisition_page_viewed'),
  web as (
    select v.session_id,
      exists (select 1 from sess s where s.session_id = v.session_id and s.event = 'acquisition_cta_clicked') as clicked,
      exists (select 1 from sess s where s.session_id = v.session_id and s.event = 'signup_started') as started,
      exists (select 1 from public.user_acquisition a where a.session_id = v.session_id) as completed
    from viewed v
  ),
  cohort as (
    select x.*,
      case when last_model then x.last_source else x.first_source end as src,
      case when last_model then x.last_campaign else x.first_campaign end as camp,
      exists (select 1 from public.growth_events g where g.organization_id = x.org_id and g.event = 'first_document_created') as first_doc,
      exists (select 1 from public.growth_events g where g.organization_id = x.org_id and g.event = 'second_document_completed') as recurring,
      exists (select 1 from public.growth_events g where g.organization_id = x.org_id
        and g.event in ('upgrade_cta_clicked', 'checkout_started', 'upgrade_checkout_started', 'paid_feature_attempted',
                        'cedro_usage_4_of_5', 'free_document_4_used', 'cedro_limit_reached', 'free_document_5_used')) as upgrade_interest,
      exists (select 1 from public.growth_events g where g.organization_id = x.org_id and g.event in ('paid_plan_activated', 'plan_upgraded')) as paid
    from public.growth_people(inc) x
    where x.created_at >= d_from and x.created_at < d_to
      and (p ->> 'plan' is null or x.plan_id = p ->> 'plan')
  ),
  c as (
    select * from cohort
    where (p ->> 'source' is null or cohort.src = p ->> 'source')
      and (p ->> 'campaign' is null or cohort.camp = p ->> 'campaign')
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', d_from, 'to', d_to, 'model', p ->> 'model', 'internal', inc),
    'web', jsonb_build_object(
      'visitors', (select count(*) from web),
      'cta', (select count(*) from web where clicked),
      'signup_started', (select count(*) from web where started),
      'signup_completed', (select count(*) from web where completed)),
    'people', jsonb_build_object(
      'signup_completed', (select count(*) from c),
      'organization', (select count(*) from c where org_id is not null),
      'first_document', (select count(*) from c where first_doc),
      'recurring', (select count(*) from c where recurring),
      'upgrade_interest', (select count(*) from c where upgrade_interest),
      'paid', (select count(*) from c where paid),
      'checkout_clicks', (select count(*) from public.growth_events g join c on c.org_id = g.organization_id
        where g.event in ('upgrade_cta_clicked', 'checkout_started', 'upgrade_checkout_started'))),
    'weekly', (select coalesce(jsonb_agg(r order by r.week), '[]'::jsonb) from (
      select date_trunc('week', c.created_at)::date as week, count(*) as signups,
        count(*) filter (where first_doc) as first_document, count(*) filter (where paid) as paid
      from c group by 1) r),
    'by_campaign', (select coalesce(jsonb_agg(r order by r.signup_completed desc), '[]'::jsonb) from (
      select camp as key, count(*) as signup_completed, count(*) filter (where first_doc) as first_document,
        count(*) filter (where recurring) as recurring, count(*) filter (where upgrade_interest) as upgrade_interest,
        count(*) filter (where paid) as paid
      from c group by camp limit 100) r),
    'by_channel', (select coalesce(jsonb_agg(r order by r.signup_completed desc), '[]'::jsonb) from (
      select src as key, count(*) as signup_completed, count(*) filter (where first_doc) as first_document,
        count(*) filter (where recurring) as recurring, count(*) filter (where upgrade_interest) as upgrade_interest,
        count(*) filter (where paid) as paid
      from c group by src limit 100) r)
  ) into out;
  return out;
end;
$function$;
create or replace function public.admin_growth_opportunities(f jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  stage_f text := nullif(f ->> 'stage', '');
  owner_f uuid := nullif(f ->> 'owner', '')::uuid;
  inc boolean := coalesce((f ->> 'internal')::boolean, false);
  page int := greatest(coalesce((f ->> 'page')::int, 1), 1);
  size int := least(greatest(coalesce((f ->> 'size')::int, 25), 1), 100);
  out jsonb;
begin
  perform public.growth_require_admin();
  with base as (
    select o.id, o.name, o.created_at, x.user_id, x.stage, x.plan_id, x.docs_used,
      x.first_source, x.first_campaign, x.last_source, x.last_campaign,
      (select count(*) from public.documents d where d.organization_id = o.id and d.status = 'concluded') as concluded,
      public.cedro_free_used(o.id) as free_used,
      (select coalesce(jsonb_agg(distinct g.event), '[]'::jsonb) from public.growth_events g
        where g.organization_id = o.id and g.event in ('upgrade_cta_clicked', 'checkout_started', 'upgrade_checkout_started',
          'checkout_abandoned', 'paid_feature_attempted', 'cedro_usage_4_of_5', 'free_document_4_used', 'cedro_limit_reached', 'free_document_5_used',
          'user_inactive')) as signals,
      (select to_jsonb(q) - 'answered_by' - 'organization_id' from public.org_qualification q
        where q.organization_id = o.id) as qualification,
      (select max(g.created_at) from public.growth_events g where g.organization_id = o.id) as last_activity,
      go.owner_id, (select pr.full_name from public.profiles pr where pr.id = go.owner_id) as owner_name,
      (select count(*) from public.growth_notes n where n.organization_id = o.id) as notes
    from public.growth_people(inc) x
    join public.organizations o on o.id = x.org_id
    left join public.growth_owners go on go.organization_id = o.id
    where o.closed_at is null
  ),
  filtered as (
    select * from base
    where (stage_f is null or base.stage = stage_f)
      and (owner_f is null or base.owner_id = owner_f)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'counts', (select coalesce(jsonb_object_agg(stage, n), '{}'::jsonb) from (
        select stage, count(*) n from base group by stage) s),
    'rows', coalesce((select jsonb_agg(to_jsonb(r)) from (
      select * from filtered
      order by case stage when 'pql_hot' then 1 when 'opportunity' then 2 when 'pql' then 3
        when 'recurring' then 4 when 'activated' then 5 when 'signed_up' then 6 else 7 end,
        last_activity desc nulls last
      offset (page - 1) * size limit size) r), '[]'::jsonb)
  ) into out;
  return out;
end;
$function$;
create or replace function public.admin_growth_funnel(date_from timestamp with time zone, date_to timestamp with time zone, campaign text DEFAULT NULL::text, source text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare out jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  with
  ua as (
    select u.id as user_id,
      coalesce(a.utm_source, case when a.referrer is not null
        then split_part(regexp_replace(a.referrer, '^https?://', ''), '/', 1) end) as src,
      coalesce(a.utm_campaign, a.campaign) as camp,
      a.user_id is not null as tracked
    from auth.users u left join public.user_acquisition a on a.user_id = u.id
  ),
  orgs as (
    select o.id, o.name, o.created_at, ua.src, ua.camp, ua.tracked
    from public.organizations o left join ua on ua.user_id = o.created_by
    where (campaign is null or ua.camp = campaign) and (source is null or ua.src = source)
  ),
  ev as (
    select g.* from public.growth_events g
    where g.created_at >= date_from and g.created_at < date_to
  ),
  web as (
    select * from ev where ev.event in ('acquisition_page_viewed', 'acquisition_cta_clicked', 'signup_started')
      and (campaign is null or coalesce(ev.data->>'utm_campaign', ev.data->>'campaign') = campaign)
      and (source is null or ev.data->>'utm_source' = source)
  ),
  signups as (
    select ev.user_id from ev join ua on ua.user_id = ev.user_id
    where ev.event = 'signup_completed'
      and (campaign is null or ua.camp = campaign) and (source is null or ua.src = source)
  ),
  oev as (select ev.* from ev join orgs on orgs.id = ev.organization_id),
  cnt as (
    select event, count(distinct organization_id) as n from oev group by event
  )
  select jsonb_build_object(
    'visits', (select count(distinct session_id) from web where event = 'acquisition_page_viewed'),
    'page_views', (select count(*) from web where event = 'acquisition_page_viewed'),
    'cta_clicks', (select count(*) from web where event = 'acquisition_cta_clicked'),
    'signup_started', (select count(distinct session_id) from web where event = 'signup_started'),
    'signups', (select count(*) from signups),
    'milestones', coalesce((select jsonb_object_agg(event, n) from cnt), '{}'::jsonb),
    'by_source', coalesce((
      select jsonb_agg(r order by r.signups desc) from (
        select coalesce(ua.src, case when ua.tracked then 'direto' else 'sem origem registrada' end) as source,
          coalesce(ua.camp, '—') as campaign,
          count(*) as signups,
          count(*) filter (where exists (select 1 from public.growth_events g
            join public.organizations o on o.id = g.organization_id
            where o.created_by = s.user_id and g.event = 'first_document_completed')) as activated,
          count(*) filter (where exists (select 1 from public.growth_events g
            join public.organizations o on o.id = g.organization_id
            where o.created_by = s.user_id and g.event in ('paid_plan_activated', 'plan_upgraded'))) as paid
        from signups s join ua on ua.user_id = s.user_id
        group by 1, 2) r), '[]'::jsonb),
    'orgs', coalesce((
      select jsonb_agg(r order by r.rank, r.created_at desc) from (
        select o.id, o.name, o.created_at, o.src as source, o.camp as campaign,
          public.org_growth_stage(o.id) as stage,
          case public.org_growth_stage(o.id) when 'pql_hot' then 1 when 'opportunity' then 2
            when 'pql' then 3 when 'recurring' then 4 when 'activated' then 5
            when 'signed_up' then 6 else 7 end as rank,
          (select greatest(coalesce((select value from public.usage_counters u where u.organization_id = o.id
              and u.period = 'total' and u.metric = 'documents'), 0), 0)) as documents_used,
          (select s.plan_id from public.subscriptions s where s.organization_id = o.id) as plan_id
        from orgs o
        order by o.created_at desc
        limit 200) r), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(distinct camp) from ua where camp is not null), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(distinct src) from ua where src is not null), '[]'::jsonb)
  ) into out;
  return out;
end;
$function$;

-- 16. Relatórios avançados conferem o plano ---------------------------------------------------
create or replace function public.org_report(org uuid, date_from timestamp with time zone, date_to timestamp with time zone, f jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  result jsonb;
begin
  if not public.is_org_member(org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Relatórios avançados dependem do plano (navegação progressiva no banco, não só no menu).
  if not public.feature_enabled(org, 'reports') then
    raise exception 'feature_not_in_plan' using errcode = '42501';
  end if;

  with docs as (
    select d.* from public.documents d
    where d.organization_id = org and d.deleted_at is null
      and d.created_at >= date_from and d.created_at < date_to
      and (f->>'user' is null or d.created_by = (f->>'user')::uuid)
      and (f->>'status' is null or d.status::text = f->>'status')
      and (f->>'origin' is null or d.origin = f->>'origin')
      and (f->>'template' is null or d.template_id = (f->>'template')::uuid)
      and (f->>'unit' is null or exists (select 1 from public.memberships m
             where m.organization_id = org and m.user_id = d.created_by
               and m.unit_id = (f->>'unit')::uuid))
      and (f->>'group' is null or exists (select 1 from public.org_group_members g
             where g.group_id = (f->>'group')::uuid and g.user_id = d.created_by))
  ),
  parts as (
    select p.*, d.created_at as doc_created, d.status as doc_status, d.name as doc_name
    from public.document_participants p join docs d on d.id = p.document_id
  ),
  -- "Desde quando é a vez": conclusão da etapa anterior ou o envio do documento.
  pending as (
    select p.*, coalesce((select max(x.completed_at) from parts x
                          where x.document_id = p.document_id and x.step < p.step), p.doc_created) as since
    from parts p where p.status = 'pending' and p.doc_status = 'pending'
  ),
  bulk as (
    select b.* from public.bulk_jobs b
    where b.organization_id = org and b.created_at >= date_from and b.created_at < date_to
      and (f->>'user' is null or b.created_by = (f->>'user')::uuid)
      and (f->>'template' is null or b.template_id = (f->>'template')::uuid)
  ),
  bitems as (
    select i.status, d.status as doc_status from public.bulk_items i
    join bulk b on b.id = i.job_id
    left join public.documents d on d.id = i.document_id
  )
  select jsonb_build_object(
    'documents', jsonb_build_object(
      'created', (select count(*) from docs),
      'sent', (select count(*) from docs where kind = 'send'),
      'waiting_signature', (select count(distinct document_id) from pending where role <> 'approver'),
      'waiting_approval', (select count(distinct document_id) from pending where role = 'approver'),
      'concluded', (select count(*) from docs where status = 'concluded'),
      'refused', (select count(*) from docs where status = 'refused'),
      'canceled', (select count(*) from docs where status = 'canceled'),
      'expired', (select count(*) from docs where status = 'expired'),
      'errors', (select count(*) from bitems where status = 'failed'),
      'by_origin', coalesce((select jsonb_object_agg(origin, n) from
        (select coalesce(origin, 'send') origin, count(*) n from docs group by 1) o), '{}'::jsonb)
    ),
    'signatures', jsonb_build_object(
      'signed', (select count(*) from parts where role <> 'approver' and status = 'completed'),
      'approved', (select count(*) from parts where role = 'approver' and status = 'completed'),
      'pending', (select count(*) from pending),
      'avg_hours', (select round(extract(epoch from avg(completed_at - doc_created)) / 3600, 1)
                    from parts where status = 'completed' and completed_at is not null),
      'completion_rate', (select case when count(*) filter (where kind = 'send') = 0 then null
        else round(100.0 * count(*) filter (where kind = 'send' and status = 'concluded')
                   / count(*) filter (where kind = 'send'), 1) end from docs)
    ),
    'pending', jsonb_build_object(
      'count', (select count(*) from pending),
      'oldest', coalesce((select jsonb_agg(row_to_json(x)) from (
        select p.name, p.email, p.role, p.document_id, p.doc_name, p.since,
               round(extract(epoch from now() - p.since) / 86400, 1) as days, p.reminder_count
        from pending p order by p.since limit 50) x), '[]'::jsonb),
      'by_unit', coalesce((select jsonb_agg(row_to_json(x)) from (
        select coalesce(u.name, '—') as name, count(*) as n
        from pending p
        left join public.memberships m on m.organization_id = org and m.user_id = p.user_id
        left join public.organization_units u on u.id = m.unit_id
        group by 1 order by 2 desc) x), '[]'::jsonb),
      'by_group', coalesce((select jsonb_agg(row_to_json(x)) from (
        select g.name, count(*) as n from pending p
        join public.org_group_members gm on gm.user_id = p.user_id
        join public.org_groups g on g.id = gm.group_id and g.organization_id = org
        group by 1 order by 2 desc) x), '[]'::jsonb)
    ),
    'bulk', jsonb_build_object(
      'jobs', (select count(*) from bulk),
      'items', (select count(*) from bitems),
      'sent', (select count(*) from bitems where status = 'sent'),
      'signed', (select count(*) from bitems where doc_status = 'concluded'),
      'pending', (select count(*) from bitems where status = 'sent' and doc_status = 'pending'),
      'errors', (select count(*) from bitems where status = 'failed'),
      'success_rate', (select case when count(*) filter (where status in ('sent', 'failed')) = 0
        then null else round(100.0 * count(*) filter (where status = 'sent')
             / count(*) filter (where status in ('sent', 'failed')), 1) end from bitems)
    ),
    'usage', jsonb_build_object(
      'consumed', coalesce((select jsonb_object_agg(period, value) from public.usage_counters
        where organization_id = org and metric = 'documents' and period <> 'total'
          and period >= to_char(date_from at time zone 'America/Sao_Paulo', 'YYYY-MM')
          and period <= to_char((date_to - interval '1 second') at time zone 'America/Sao_Paulo', 'YYYY-MM')),
        '{}'::jsonb),
      'active_users', (select count(distinct created_by) from docs),
      'members', (select count(*) from public.memberships where organization_id = org and status = 'active'),
      'by_day', coalesce((select jsonb_object_agg(day, n) from (
        select to_char(created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as day, count(*) as n
        from docs group by 1) x), '{}'::jsonb)
    )
  ) into result;
  return result;
end;
$function$;
