-- MDSign — Onboarding guiado: checklist "Primeiros passos" + tour na tela.
-- Os passos se marcam pelo uso real (calculados aqui). Só alguns passos de tela (ex.: abriu a
-- página de um documento) são marcados pelo app. Quem já usava o MDSign antes desta versão
-- começa com o onboarding dispensado e pode abrir pelo menu Ajuda.

create table public.onboarding_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  track text not null check (track in ('full', 'invited')),
  manual jsonb not null default '{}'::jsonb check (pg_column_size(manual) <= 2000),
  dismissed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, organization_id)
);
alter table public.onboarding_state enable row level security;
create policy onboarding_state_select on public.onboarding_state for select to authenticated
  using (user_id = auth.uid());
revoke all on public.onboarding_state from anon, authenticated;
grant select on public.onboarding_state to authenticated;

-- Data desta versão: quem entrou antes começa com o onboarding dispensado.
create function public.onboarding_since() returns timestamptz
language sql immutable as $$ select timestamptz '2026-10-14 18:30:00+00' $$;

-- Progresso: cria o estado na primeira chamada e devolve os passos detectados.
create function public.onboarding_progress(org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m record;
  st public.onboarding_state;
  users_max integer;
begin
  select role, created_at into m from public.memberships
    where organization_id = org and user_id = uid and status = 'active';
  if m is null or not public.is_org_member(org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.onboarding_state (user_id, organization_id, track, dismissed_at)
  values (uid, org,
    case when m.role = 'owner' then 'full' else 'invited' end,
    case when m.created_at < public.onboarding_since() then now() end)
  on conflict do nothing;
  select * into st from public.onboarding_state where user_id = uid and organization_id = org;
  users_max := public.entitlement_int(org, 'users_max');

  return jsonb_build_object(
    'track', st.track,
    'dismissed', st.dismissed_at is not null,
    'completed', st.completed_at is not null,
    'team', users_max is null or users_max > 1,
    'steps', jsonb_build_object(
      'profile', exists (select 1 from public.profiles p where p.id = uid
                           and p.full_name is not null and (p.cpf is not null or p.no_cpf)),
      'self_sign', exists (select 1 from public.documents d where d.organization_id = org
                             and d.created_by = uid and d.kind = 'self' and d.status = 'concluded')
                   or exists (select 1 from public.document_participants p
                                join public.documents d on d.id = p.document_id
                              where d.organization_id = org and p.user_id = uid and p.status = 'completed'),
      'send', exists (select 1 from public.documents d where d.organization_id = org
                        and d.created_by = uid and d.kind = 'send'),
      'track_status', coalesce((st.manual->>'viewed_document')::boolean, false),
      'remind', exists (select 1 from public.document_events e
                          join public.documents d on d.id = e.document_id
                        where d.organization_id = org and d.created_by = uid
                          and e.type = 'participant.reminded'),
      'contacts', exists (select 1 from public.contacts c where c.organization_id = org),
      'template', exists (select 1 from public.templates t where t.organization_id = org),
      'form', exists (select 1 from public.forms f where f.organization_id = org),
      'invite', exists (select 1 from public.invitations i where i.organization_id = org)
                or (select count(*) from public.memberships x where x.organization_id = org) > 1,
      'group', exists (select 1 from public.org_groups g where g.organization_id = org),
      'sign_pending', exists (select 1 from public.document_participants p
                                join public.documents d on d.id = p.document_id
                              where d.organization_id = org and p.user_id = uid and p.status = 'completed'),
      'has_pending', exists (select 1 from public.document_participants p
                               join public.documents d on d.id = p.document_id
                             where d.organization_id = org and p.user_id = uid
                               and p.status = 'pending' and d.status = 'pending'),
      'download', coalesce((st.manual->>'downloaded')::boolean, false),
      'billing', coalesce((st.manual->>'viewed_billing')::boolean, false),
      'reports', coalesce((st.manual->>'viewed_reports')::boolean, false)
    )
  );
end;
$$;

-- Passos de tela (lista fixa), dispensar, reabrir e concluir.
create function public.onboarding_update(org uuid, op text, step text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_org_member(org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if op = 'mark' then
    if step not in ('viewed_document', 'downloaded', 'viewed_billing', 'viewed_reports') then
      raise exception 'invalid_request' using errcode = 'P0001';
    end if;
    update public.onboarding_state
      set manual = manual || jsonb_build_object(step, true), updated_at = now()
      where user_id = auth.uid() and organization_id = org;
  elsif op = 'dismiss' then
    update public.onboarding_state set dismissed_at = now(), updated_at = now()
      where user_id = auth.uid() and organization_id = org;
  elsif op = 'reopen' then
    update public.onboarding_state set dismissed_at = null, updated_at = now()
      where user_id = auth.uid() and organization_id = org;
  elsif op = 'complete' then
    update public.onboarding_state set completed_at = coalesce(completed_at, now()), updated_at = now()
      where user_id = auth.uid() and organization_id = org;
  else
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.onboarding_progress(uuid), public.onboarding_update(uuid, text, text)
  from public, anon;
grant execute on function public.onboarding_progress(uuid), public.onboarding_update(uuid, text, text)
  to authenticated;

-- Funil: eventos do onboarding (taxa de conclusão no Super Admin → Funil).
create or replace function public.growth_app_event(org uuid, ev text, payload jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if ev not in ('upgrade_cta_clicked', 'paid_feature_attempted', 'onboarding_tour_started',
                'onboarding_step_completed', 'onboarding_completed')
     or not public.is_org_member(org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(payload, '{}'::jsonb)) <> 'object' or pg_column_size(payload) > 1000 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  perform public.growth_mark(org, auth.uid(), ev, coalesce(payload, '{}'::jsonb),
    ev = 'onboarding_completed');
end;
$$;
