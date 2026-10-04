-- MDSign Fase 2 — Bloco 1: perfis, organizações (multi-tenant), unidades, papéis,
-- permissões, convites, auditoria e Super Admin (PRD §22, §36, §37, §43, §45).
--
-- Isolamento: toda tabela com organization_id tem RLS e só é visível para membros
-- ativos da organização. Escritas sensíveis passam por funções SECURITY DEFINER que
-- validam permissão no servidor.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type public.org_role as enum (
  'owner',     -- Proprietário
  'admin',     -- Administrador
  'manager',   -- Gestor
  'operator',  -- Operador
  'member',    -- Usuário
  'viewer',    -- Visualizador
  'finance'    -- Financeiro
);

create type public.member_status as enum ('active', 'suspended');

-- ---------------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 160),
  cpf text check (cpf ~ '^[0-9]{11}$'),
  phone text check (char_length(phone) <= 30),
  locale text not null default 'pt' check (locale in ('pt', 'en', 'es')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.cpf is 'Somente dígitos. Usado para preencher "Só eu assino" (PRD §8).';

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, locale)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.raw_user_meta_data ->> 'locale' in ('pt', 'en', 'es')
      then new.raw_user_meta_data ->> 'locale' else 'pt' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Super Admin MDTech
-- ---------------------------------------------------------------------------

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Organizações e estrutura
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  cnpj text check (cnpj ~ '^[0-9]{14}$'),
  locale text not null default 'pt' check (locale in ('pt', 'en', 'es')),
  -- Conexão com o motor (PRD Sprint 0, modelo A/B). 'shared' = organização-motor única.
  engine_mode text not null default 'shared' check (engine_mode in ('shared', 'dedicated')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  parent_id uuid references public.organization_units (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create index organization_units_org_idx on public.organization_units (organization_id);

create table public.memberships (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'member',
  unit_id uuid references public.organization_units (id) on delete set null,
  status public.member_status not null default 'active',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index memberships_user_idx on public.memberships (user_id);

-- ---------------------------------------------------------------------------
-- Permissões por papel (dados, não código — PRD §22 e §39)
-- ---------------------------------------------------------------------------

create table public.role_permissions (
  role public.org_role not null,
  permission text not null,
  primary key (role, permission)
);

insert into public.role_permissions (role, permission)
select r.role::public.org_role, p.permission
from (values
  ('owner'), ('admin')
) as r(role)
cross join (values
  ('documents.view'), ('documents.create'), ('documents.manage'), ('templates.manage'),
  ('bulk.send'), ('contacts.manage'), ('members.manage'), ('units.manage'),
  ('integrations.manage'), ('billing.view'), ('billing.manage'), ('reports.export'),
  ('settings.manage'), ('audit.view')
) as p(permission);

insert into public.role_permissions (role, permission) values
  ('manager', 'documents.view'), ('manager', 'documents.create'), ('manager', 'documents.manage'),
  ('manager', 'templates.manage'), ('manager', 'bulk.send'), ('manager', 'contacts.manage'),
  ('manager', 'members.manage'), ('manager', 'reports.export'), ('manager', 'audit.view'),
  ('operator', 'documents.view'), ('operator', 'documents.create'), ('operator', 'bulk.send'),
  ('operator', 'contacts.manage'),
  ('member', 'documents.view'), ('member', 'documents.create'), ('member', 'contacts.manage'),
  ('viewer', 'documents.view'),
  ('finance', 'billing.view'), ('finance', 'billing.manage'), ('finance', 'reports.export');

-- billing.manage fica só com o proprietário entre os papéis administrativos.
delete from public.role_permissions where role = 'admin' and permission = 'billing.manage';

-- ---------------------------------------------------------------------------
-- Funções de autorização (usadas pelas políticas RLS)
-- ---------------------------------------------------------------------------

create function public.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships
    where organization_id = org and user_id = auth.uid() and status = 'active'
  );
$$;

create function public.org_role_of(org uuid) returns public.org_role
language sql stable security definer set search_path = '' as $$
  select role from public.memberships
  where organization_id = org and user_id = auth.uid() and status = 'active';
$$;

create function public.has_org_permission(org uuid, perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role = m.role
    where m.organization_id = org and m.user_id = auth.uid()
      and m.status = 'active' and rp.permission = perm
  );
$$;

-- ---------------------------------------------------------------------------
-- Auditoria (somente inclusão — PRD §45)
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_org_created_idx on public.audit_log (organization_id, created_at desc);

create function public.write_audit(org uuid, act text, ent text, ent_id text, payload jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (organization_id, actor_id, action, entity, entity_id, data)
  values (org, auth.uid(), act, ent, ent_id, coalesce(payload, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- Convites
-- ---------------------------------------------------------------------------

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.org_role not null default 'member',
  unit_id uuid references public.organization_units (id) on delete set null,
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index invitations_org_idx on public.invitations (organization_id);

-- ---------------------------------------------------------------------------
-- Operações (RPC) com validação no servidor
-- ---------------------------------------------------------------------------

-- Onboarding: cria a organização e torna quem criou proprietário (PRD §50).
create function public.create_organization(org_name text, org_cnpj text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  insert into public.organizations (name, cnpj, created_by)
  values (trim(org_name), nullif(regexp_replace(coalesce(org_cnpj, ''), '\D', '', 'g'), ''), auth.uid())
  returning id into new_id;
  insert into public.memberships (organization_id, user_id, role) values (new_id, auth.uid(), 'owner');
  perform public.write_audit(new_id, 'organization.created', 'organization', new_id::text,
    jsonb_build_object('name', trim(org_name)));
  return new_id;
end;
$$;

-- Convidar membro. Só quem tem members.manage; só o proprietário convida outro proprietário.
create function public.invite_member(org uuid, invite_email text, invite_role public.org_role, invite_unit uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  inv_id uuid;
begin
  if not public.has_org_permission(org, 'members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if invite_role = 'owner' and public.org_role_of(org) <> 'owner' then
    raise exception 'forbidden_role' using errcode = '42501';
  end if;
  insert into public.invitations (organization_id, email, role, unit_id, invited_by)
  values (org, lower(trim(invite_email)), invite_role, invite_unit, auth.uid())
  returning id into inv_id;
  perform public.write_audit(org, 'member.invited', 'invitation', inv_id::text,
    jsonb_build_object('email', lower(trim(invite_email)), 'role', invite_role));
  return inv_id;
end;
$$;

-- Aceitar convite: o e-mail do usuário logado precisa ser o do convite.
create function public.accept_invitation(invite_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitations;
  user_email text;
begin
  select email into user_email from auth.users where id = auth.uid();
  select * into inv from public.invitations
  where token = invite_token and accepted_at is null and expires_at > now();
  if inv.id is null then
    raise exception 'invitation_invalid' using errcode = 'P0002';
  end if;
  if lower(user_email) <> inv.email then
    raise exception 'invitation_email_mismatch' using errcode = '42501';
  end if;
  insert into public.memberships (organization_id, user_id, role, unit_id)
  values (inv.organization_id, auth.uid(), inv.role, inv.unit_id)
  on conflict (organization_id, user_id) do update set role = excluded.role, status = 'active';
  update public.invitations set accepted_at = now() where id = inv.id;
  perform public.write_audit(inv.organization_id, 'member.joined', 'membership', auth.uid()::text,
    jsonb_build_object('role', inv.role));
  return inv.organization_id;
end;
$$;

-- Alterar papel/status/unidade de um membro.
create function public.update_member(org uuid, member uuid, new_role public.org_role default null,
  new_status public.member_status default null, new_unit uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.memberships;
begin
  if not public.has_org_permission(org, 'members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into target from public.memberships where organization_id = org and user_id = member;
  if target.user_id is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  -- Proprietário só é alterado por outro proprietário; o último proprietário não pode sair.
  if (target.role = 'owner' or new_role = 'owner') and public.org_role_of(org) <> 'owner' then
    raise exception 'forbidden_role' using errcode = '42501';
  end if;
  if target.role = 'owner' and (coalesce(new_role, 'owner') <> 'owner' or new_status = 'suspended')
     and (select count(*) from public.memberships
          where organization_id = org and role = 'owner' and status = 'active') <= 1 then
    raise exception 'last_owner' using errcode = '42501';
  end if;
  update public.memberships set
    role = coalesce(new_role, role),
    status = coalesce(new_status, status),
    unit_id = coalesce(new_unit, unit_id)
  where organization_id = org and user_id = member;
  perform public.write_audit(org, 'member.updated', 'membership', member::text,
    jsonb_build_object('role', new_role, 'status', new_status, 'unit', new_unit));
end;
$$;

-- Remover membro (mesmas regras do proprietário).
create function public.remove_member(org uuid, member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.memberships;
begin
  if not public.has_org_permission(org, 'members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into target from public.memberships where organization_id = org and user_id = member;
  if target.role = 'owner' and public.org_role_of(org) <> 'owner' then
    raise exception 'forbidden_role' using errcode = '42501';
  end if;
  if target.role = 'owner' and (select count(*) from public.memberships
       where organization_id = org and role = 'owner' and status = 'active') <= 1 then
    raise exception 'last_owner' using errcode = '42501';
  end if;
  delete from public.memberships where organization_id = org and user_id = member;
  perform public.write_audit(org, 'member.removed', 'membership', member::text, '{}');
end;
$$;

-- Lista de membros com nome e e-mail (auth.users não é exposto diretamente).
create function public.list_members(org uuid)
returns table (user_id uuid, full_name text, email text, role public.org_role,
  status public.member_status, unit_id uuid, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, p.full_name, u.email::text, m.role, m.status, m.unit_id, m.created_at
  from public.memberships m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.organization_id = org and public.is_org_member(org)
  order by m.created_at;
$$;

-- Permissões do usuário logado numa organização (para o front esconder ações).
create function public.my_permissions(org uuid)
returns setof text language sql stable security definer set search_path = '' as $$
  select rp.permission
  from public.memberships m
  join public.role_permissions rp on rp.role = m.role
  where m.organization_id = org and m.user_id = auth.uid() and m.status = 'active';
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_units enable row level security;
alter table public.memberships enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_log enable row level security;
alter table public.invitations enable row level security;

-- Perfis: cada um vê e edita o seu; colegas de organização veem o nome.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.memberships a join public.memberships b
        on a.organization_id = b.organization_id
      where a.user_id = auth.uid() and a.status = 'active' and b.user_id = profiles.id
    )
    or public.is_platform_admin()
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Super Admin: só ele mesmo se enxerga na tabela (gestão pelo banco).
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

-- Organizações: membros veem; quem tem settings.manage edita. Criação só pela RPC.
create policy organizations_select on public.organizations for select to authenticated
  using (public.is_org_member(id) or public.is_platform_admin());
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_org_permission(id, 'settings.manage'))
  with check (public.has_org_permission(id, 'settings.manage'));

-- Unidades: membros veem; units.manage cria/edita/exclui.
create policy units_select on public.organization_units for select to authenticated
  using (public.is_org_member(organization_id));
create policy units_insert on public.organization_units for insert to authenticated
  with check (public.has_org_permission(organization_id, 'units.manage'));
create policy units_update on public.organization_units for update to authenticated
  using (public.has_org_permission(organization_id, 'units.manage'))
  with check (public.has_org_permission(organization_id, 'units.manage'));
create policy units_delete on public.organization_units for delete to authenticated
  using (public.has_org_permission(organization_id, 'units.manage'));

-- Associações: membros veem as da organização. Escritas só pelas RPCs.
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organization_id));

-- Papéis/permissões: leitura para autenticados (catálogo).
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (true);

-- Auditoria: leitura com audit.view; inclusão só pelas funções; sem update/delete.
create policy audit_select on public.audit_log for select to authenticated
  using (public.has_org_permission(organization_id, 'audit.view') or public.is_platform_admin());

-- Convites: quem gerencia membros vê os da organização.
create policy invitations_select on public.invitations for select to authenticated
  using (public.has_org_permission(organization_id, 'members.manage'));
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.has_org_permission(organization_id, 'members.manage'));

-- Menor privilégio: nada para anônimo; autenticado só o que as políticas cobrem.
revoke all on all tables in schema public from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.platform_admins, public.organizations, public.organization_units,
  public.memberships, public.role_permissions, public.audit_log, public.invitations to authenticated;
grant update on public.organizations to authenticated;
grant insert, update, delete on public.organization_units to authenticated;
grant delete on public.invitations to authenticated;

revoke execute on function public.write_audit(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.create_organization(text, text), public.invite_member(uuid, text, public.org_role, uuid),
  public.accept_invitation(uuid), public.update_member(uuid, uuid, public.org_role, public.member_status, uuid),
  public.remove_member(uuid, uuid), public.list_members(uuid), public.my_permissions(uuid),
  public.is_org_member(uuid), public.has_org_permission(uuid, text), public.org_role_of(uuid),
  public.is_platform_admin() to authenticated;
revoke execute on function public.create_organization(text, text), public.invite_member(uuid, text, public.org_role, uuid),
  public.accept_invitation(uuid), public.update_member(uuid, uuid, public.org_role, public.member_status, uuid),
  public.remove_member(uuid, uuid), public.list_members(uuid), public.my_permissions(uuid) from anon, public;

-- updated_at automático
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();

-- A tabela leads (Fase 1) continua sem acesso público.
revoke all on public.leads from anon, authenticated;
