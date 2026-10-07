-- MDSign — Bloco C: grupos organizacionais e delegação de aprovações.
-- Delegação não é falsificação de identidade: o delegado age em nome próprio, e o registro
-- diz "em delegação de". Assinatura pessoal não é delegável (no motor a identidade é o CPF; em
-- ICP-Brasil, o certificado da pessoa) — o escopo nesta versão é só "approvals".

-- 1. Grupos (Diretoria, Jurídico, RH, Financeiro…): pessoas da própria organização.
create table public.org_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text check (char_length(description) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);
create trigger org_groups_touch before update on public.org_groups
  for each row execute function public.touch_updated_at();

create table public.org_group_members (
  group_id uuid not null references public.org_groups (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Só membros ativos da mesma organização entram num grupo.
create function public.check_group_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.org_groups g where g.id = new.group_id
                 and g.organization_id = new.organization_id) then
    raise exception 'group_org_mismatch' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.memberships m where m.organization_id = new.organization_id
                 and m.user_id = new.user_id and m.status = 'active') then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger org_group_members_check before insert or update on public.org_group_members
  for each row execute function public.check_group_member();

-- 2. Delegações: quem delega, para quem, período, escopo e situação.
create table public.delegations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  delegator_id uuid not null references auth.users (id) on delete cascade,
  delegate_id uuid not null references auth.users (id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  scope text not null default 'approvals' check (scope in ('approvals')),
  active boolean not null default true,
  note text check (char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  check (delegator_id <> delegate_id),
  check (ends_at > starts_at)
);
create index delegations_active_idx on public.delegations (organization_id, delegator_id)
  where active;

create function public.check_delegation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.memberships m where m.organization_id = new.organization_id
                 and m.user_id = new.delegator_id and m.status = 'active')
     or not exists (select 1 from public.memberships m where m.organization_id = new.organization_id
                 and m.user_id = new.delegate_id and m.status = 'active') then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger delegations_check before insert or update on public.delegations
  for each row execute function public.check_delegation();

-- Delegação ativa agora (para o envio de documentos): devolve o delegado, se houver.
create function public.active_delegate(org uuid, delegator uuid, delegation_scope text)
returns uuid language sql stable security definer set search_path = '' as $$
  select d.delegate_id from public.delegations d
  where d.organization_id = org and d.delegator_id = delegator and d.scope = delegation_scope
    and d.active and d.revoked_at is null and now() >= d.starts_at and now() < d.ends_at
  order by d.created_at desc limit 1;
$$;
revoke execute on function public.active_delegate(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.active_delegate(uuid, uuid, text) to service_role;

-- 3. Participante que age em delegação: guarda de quem é a ação original.
alter table public.document_participants
  add column delegated_from_user uuid references auth.users (id) on delete set null,
  add column delegated_from_name text check (char_length(delegated_from_name) <= 160),
  add column delegation_id uuid references public.delegations (id) on delete set null;

-- 4. RLS: membros da organização veem; quem gerencia membros cria/altera; a própria pessoa
-- também cria e revoga as suas delegações.
alter table public.org_groups enable row level security;
alter table public.org_group_members enable row level security;
alter table public.delegations enable row level security;

create policy org_groups_select on public.org_groups for select to authenticated
  using (public.is_org_member(organization_id));
create policy org_groups_write on public.org_groups for all to authenticated
  using (public.has_org_permission(organization_id, 'members.manage'))
  with check (public.has_org_permission(organization_id, 'members.manage'));
create policy org_group_members_select on public.org_group_members for select to authenticated
  using (public.is_org_member(organization_id));
create policy org_group_members_write on public.org_group_members for all to authenticated
  using (public.has_org_permission(organization_id, 'members.manage'))
  with check (public.has_org_permission(organization_id, 'members.manage'));

create policy delegations_select on public.delegations for select to authenticated
  using (public.has_org_permission(organization_id, 'members.manage')
         or delegator_id = auth.uid() or delegate_id = auth.uid());
create policy delegations_insert on public.delegations for insert to authenticated
  with check ((public.has_org_permission(organization_id, 'members.manage')
               or delegator_id = auth.uid())
              and created_by = auth.uid() and revoked_at is null);
create policy delegations_update on public.delegations for update to authenticated
  using (public.has_org_permission(organization_id, 'members.manage') or delegator_id = auth.uid())
  with check (public.has_org_permission(organization_id, 'members.manage') or delegator_id = auth.uid());

revoke all on public.org_groups, public.org_group_members, public.delegations from anon;
grant select, insert, update, delete on public.org_groups, public.org_group_members to authenticated;
grant select, insert, update on public.delegations to authenticated;

-- 5. Auditoria de grupos e delegações.
create function public.audit_groups_delegations() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'org_groups' then
    insert into public.audit_log (organization_id, actor_id, action, entity, entity_id, data)
    values (coalesce(new.organization_id, old.organization_id), auth.uid(),
            'group.' || lower(tg_op), 'org_group', coalesce(new.id, old.id)::text,
            jsonb_build_object('name', coalesce(new.name, old.name)));
  elsif tg_table_name = 'org_group_members' then
    insert into public.audit_log (organization_id, actor_id, action, entity, entity_id, data)
    values (coalesce(new.organization_id, old.organization_id), auth.uid(),
            'group.member_' || lower(tg_op), 'org_group', coalesce(new.group_id, old.group_id)::text,
            jsonb_build_object('user', coalesce(new.user_id, old.user_id)));
  else
    insert into public.audit_log (organization_id, actor_id, action, entity, entity_id, data)
    values (new.organization_id, auth.uid(),
            case when tg_op = 'UPDATE' and new.revoked_at is not null and old.revoked_at is null
                 then 'delegation.revoked' else 'delegation.' || lower(tg_op) end,
            'delegation', new.id::text,
            jsonb_build_object('delegator', new.delegator_id, 'delegate', new.delegate_id,
              'starts_at', new.starts_at, 'ends_at', new.ends_at, 'scope', new.scope,
              'active', new.active));
  end if;
  return null;
end;
$$;
create trigger org_groups_audit after insert or update or delete on public.org_groups
  for each row execute function public.audit_groups_delegations();
create trigger org_group_members_audit after insert or delete on public.org_group_members
  for each row execute function public.audit_groups_delegations();
create trigger delegations_audit after insert or update on public.delegations
  for each row execute function public.audit_groups_delegations();
