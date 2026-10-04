-- MDSign Fase 2 — Blocos 4 e 5: modelos, formulários/links públicos e envio em massa
-- (PRD §13, §14, §17, §18, §19).

-- Modelos: biblioteca MDSign (organization_id nulo), da organização ou pessoais.
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete set null,
  scope text not null check (scope in ('mdsign', 'organization', 'personal')),
  category text not null default 'other'
    check (category in ('hr', 'commercial', 'legal', 'health', 'finance', 'other')),
  locale text not null default 'pt' check (locale in ('pt', 'en', 'es')),
  name text not null check (char_length(name) between 2 and 160),
  description text check (char_length(description) <= 500),
  -- Texto com marcação simples (# título, **negrito**, - lista) e campos {{chave}}.
  body text not null check (char_length(body) <= 60000),
  -- [{ key, label, type, required, source }] — type: text|cpf|cnpj|email|phone|date|currency|number|select|checkbox
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'mdsign') = (organization_id is null))
);

create index templates_org_idx on public.templates (organization_id, name);

-- Formulários / links públicos (PRD §14).
create table public.forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_id uuid not null references public.templates (id) on delete restrict,
  created_by uuid references auth.users (id) on delete set null,
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  name text not null check (char_length(name) between 2 and 160),
  active boolean not null default true,
  expires_at timestamptz,
  max_responses integer check (max_responses is null or max_responses > 0),
  responses_count integer not null default 0,
  redirect_url text check (redirect_url is null or redirect_url ~ '^https://'),
  auth_level text not null default 'basic',
  created_at timestamptz not null default now()
);

create table public.form_submissions (
  id bigint generated always as identity primary key,
  form_id uuid not null references public.forms (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index form_submissions_rate_idx on public.form_submissions (form_id, ip_hash, created_at desc);

-- Envio em massa (PRD §17–§19).
create table public.bulk_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  template_id uuid references public.templates (id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  status text not null default 'draft' check (status in ('draft', 'sending', 'done', 'canceled')),
  -- { participantName, participantEmail, participantCpf, fields: { chave: coluna } }
  mapping jsonb not null default '{}'::jsonb,
  options jsonb not null default '{}'::jsonb,
  total integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bulk_items (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.bulk_jobs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  row_number integer not null,
  data jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  error text,
  document_id uuid references public.documents (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index bulk_items_job_idx on public.bulk_items (job_id, status, row_number);

alter table public.templates enable row level security;
alter table public.forms enable row level security;
alter table public.form_submissions enable row level security;
alter table public.bulk_jobs enable row level security;
alter table public.bulk_items enable row level security;

-- Modelos: biblioteca MDSign visível a todos os autenticados; da organização para membros;
-- pessoais só para o dono. Edição: organização com templates.manage; pessoal pelo dono.
create policy templates_select on public.templates for select to authenticated
  using (scope = 'mdsign'
         or (scope = 'organization' and public.is_org_member(organization_id))
         or (scope = 'personal' and owner_id = auth.uid() and public.is_org_member(organization_id)));
create policy templates_insert on public.templates for insert to authenticated
  with check ((scope = 'organization' and public.has_org_permission(organization_id, 'templates.manage'))
              or (scope = 'personal' and owner_id = auth.uid()
                  and public.has_org_permission(organization_id, 'documents.create')));
create policy templates_update on public.templates for update to authenticated
  using ((scope = 'organization' and public.has_org_permission(organization_id, 'templates.manage'))
         or (scope = 'personal' and owner_id = auth.uid()))
  with check ((scope = 'organization' and public.has_org_permission(organization_id, 'templates.manage'))
              or (scope = 'personal' and owner_id = auth.uid()));
create policy templates_delete on public.templates for delete to authenticated
  using ((scope = 'organization' and public.has_org_permission(organization_id, 'templates.manage'))
         or (scope = 'personal' and owner_id = auth.uid()));

-- Formulários: membros com templates.manage gerenciam; o público acessa só pela função.
create policy forms_select on public.forms for select to authenticated
  using (public.has_org_permission(organization_id, 'templates.manage'));
create policy forms_insert on public.forms for insert to authenticated
  with check (public.has_org_permission(organization_id, 'templates.manage'));
create policy forms_update on public.forms for update to authenticated
  using (public.has_org_permission(organization_id, 'templates.manage'))
  with check (public.has_org_permission(organization_id, 'templates.manage'));
create policy forms_delete on public.forms for delete to authenticated
  using (public.has_org_permission(organization_id, 'templates.manage'));

-- Massa: quem tem bulk.send vê os lotes da organização. Escrita pelas funções.
create policy bulk_jobs_select on public.bulk_jobs for select to authenticated
  using (public.has_org_permission(organization_id, 'bulk.send'));
create policy bulk_items_select on public.bulk_items for select to authenticated
  using (public.has_org_permission(organization_id, 'bulk.send'));

revoke all on public.templates, public.forms, public.form_submissions, public.bulk_jobs,
  public.bulk_items from anon, authenticated;
grant select, insert, update, delete on public.templates, public.forms to authenticated;
grant select on public.bulk_jobs, public.bulk_items to authenticated;

create trigger templates_touch before update on public.templates
  for each row execute function public.touch_updated_at();
create trigger bulk_jobs_touch before update on public.bulk_jobs
  for each row execute function public.touch_updated_at();

-- Biblioteca inicial MDSign (modelos genéricos para adaptar; revisar com o jurídico antes de usar).
insert into public.templates (scope, category, locale, name, description, body, fields) values
('mdsign', 'legal', 'pt', 'Termo de confidencialidade (NDA)', 'Acordo simples de confidencialidade entre duas partes.',
$t$# Termo de Confidencialidade

Pelo presente termo, **{{nome}}**, inscrito(a) no CPF {{cpf}}, doravante RECEPTOR, compromete-se perante **{{empresa}}** a manter em sigilo todas as informações confidenciais a que tiver acesso em razão de {{finalidade}}.

## 1. Informações confidenciais

São confidenciais todas as informações técnicas, comerciais, financeiras e estratégicas, em qualquer formato, que não sejam de conhecimento público.

## 2. Obrigações

- Utilizar as informações exclusivamente para a finalidade descrita.
- Não divulgar as informações a terceiros sem autorização por escrito.
- Devolver ou destruir as informações quando solicitado.

## 3. Vigência

Este termo vigora a partir de {{data_inicio}} e permanece válido por {{prazo_meses}} meses após o término da relação entre as partes.

{{cidade}}, {{data_assinatura}}.$t$,
'[{"key":"nome","label":"Nome do receptor","type":"text","required":true,"source":"signer"},{"key":"cpf","label":"CPF do receptor","type":"cpf","required":true,"source":"signer"},{"key":"empresa","label":"Empresa","type":"text","required":true,"source":"sender"},{"key":"finalidade","label":"Finalidade","type":"text","required":true,"source":"sender"},{"key":"data_inicio","label":"Início","type":"date","required":true,"source":"sender"},{"key":"prazo_meses","label":"Prazo após o término (meses)","type":"number","required":true,"source":"sender"},{"key":"cidade","label":"Cidade","type":"text","required":true,"source":"sender"},{"key":"data_assinatura","label":"Data","type":"date","required":true,"source":"sender"}]'),
('mdsign', 'hr', 'pt', 'Termo de responsabilidade por equipamento', 'Entrega de equipamento ao colaborador.',
$t$# Termo de Responsabilidade por Equipamento

Eu, **{{nome}}**, CPF {{cpf}}, ocupante do cargo de {{cargo}}, declaro ter recebido de **{{empresa}}** o equipamento abaixo, em perfeito estado de funcionamento:

- Equipamento: {{equipamento}}
- Número de série / patrimônio: {{patrimonio}}

## Compromissos

- Utilizar o equipamento exclusivamente para atividades profissionais.
- Zelar pela guarda e conservação do equipamento.
- Comunicar imediatamente qualquer dano, perda ou furto.
- Devolver o equipamento ao término do vínculo ou quando solicitado.

{{cidade}}, {{data_assinatura}}.$t$,
'[{"key":"nome","label":"Nome do colaborador","type":"text","required":true,"source":"signer"},{"key":"cpf","label":"CPF","type":"cpf","required":true,"source":"signer"},{"key":"cargo","label":"Cargo","type":"text","required":true,"source":"sender"},{"key":"empresa","label":"Empresa","type":"text","required":true,"source":"sender"},{"key":"equipamento","label":"Equipamento","type":"text","required":true,"source":"sender"},{"key":"patrimonio","label":"Série / patrimônio","type":"text","required":true,"source":"sender"},{"key":"cidade","label":"Cidade","type":"text","required":true,"source":"sender"},{"key":"data_assinatura","label":"Data","type":"date","required":true,"source":"sender"}]'),
('mdsign', 'commercial', 'pt', 'Proposta comercial — aceite', 'Aceite formal de proposta comercial.',
$t$# Aceite de Proposta Comercial

**{{cliente}}**, representado(a) por {{nome}}, CPF {{cpf}}, declara aceitar a proposta comercial nº {{numero_proposta}} apresentada por **{{empresa}}**, referente a {{objeto}}.

## Condições

- Valor total: {{valor}}
- Forma de pagamento: {{pagamento}}
- Prazo de execução: {{prazo}}

As demais condições seguem o descrito na proposta.

{{cidade}}, {{data_assinatura}}.$t$,
'[{"key":"cliente","label":"Cliente (empresa)","type":"text","required":true,"source":"sender"},{"key":"nome","label":"Representante","type":"text","required":true,"source":"signer"},{"key":"cpf","label":"CPF do representante","type":"cpf","required":true,"source":"signer"},{"key":"numero_proposta","label":"Nº da proposta","type":"text","required":true,"source":"sender"},{"key":"empresa","label":"Sua empresa","type":"text","required":true,"source":"sender"},{"key":"objeto","label":"Objeto","type":"text","required":true,"source":"sender"},{"key":"valor","label":"Valor","type":"currency","required":true,"source":"sender"},{"key":"pagamento","label":"Forma de pagamento","type":"text","required":true,"source":"sender"},{"key":"prazo","label":"Prazo","type":"text","required":true,"source":"sender"},{"key":"cidade","label":"Cidade","type":"text","required":true,"source":"sender"},{"key":"data_assinatura","label":"Data","type":"date","required":true,"source":"sender"}]'),
('mdsign', 'legal', 'pt', 'Consentimento para tratamento de dados (LGPD)', 'Consentimento do titular para finalidade específica.',
$t$# Termo de Consentimento para Tratamento de Dados Pessoais

Eu, **{{nome}}**, CPF {{cpf}}, autorizo **{{empresa}}** a tratar meus dados pessoais para a seguinte finalidade: {{finalidade}}.

## Dados tratados

{{dados_tratados}}

## Direitos do titular

Posso, a qualquer momento, solicitar confirmação, acesso, correção, anonimização, portabilidade ou eliminação dos dados, e revogar este consentimento pelo contato {{contato_encarregado}}, nos termos da Lei nº 13.709/2018 (LGPD).

{{cidade}}, {{data_assinatura}}.$t$,
'[{"key":"nome","label":"Nome do titular","type":"text","required":true,"source":"signer"},{"key":"cpf","label":"CPF","type":"cpf","required":true,"source":"signer"},{"key":"empresa","label":"Empresa (controladora)","type":"text","required":true,"source":"sender"},{"key":"finalidade","label":"Finalidade","type":"text","required":true,"source":"sender"},{"key":"dados_tratados","label":"Dados tratados","type":"text","required":true,"source":"sender"},{"key":"contato_encarregado","label":"Contato do encarregado (DPO)","type":"email","required":true,"source":"sender"},{"key":"cidade","label":"Cidade","type":"text","required":true,"source":"sender"},{"key":"data_assinatura","label":"Data","type":"date","required":true,"source":"sender"}]');
