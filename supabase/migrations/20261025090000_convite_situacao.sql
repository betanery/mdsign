-- MDSign — página do convite: mostra a organização e por que um convite não vale (já usado,
-- expirado, para outro e-mail). Só acréscimos.
--
-- Quem tem o link (token aleatório) vê: nome da organização, papel, situação e o e-mail
-- convidado mascarado (an***@gmail.com). Nunca o e-mail completo nem quem convidou.

create or replace function public.invitation_preview(invite_token uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  inv public.invitations;
  org_name text;
  me text := (select lower(email) from auth.users where id = auth.uid());
  local text;
begin
  select * into inv from public.invitations where token = invite_token;
  if inv.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  select name into org_name from public.organizations where id = inv.organization_id;
  local := split_part(inv.email, '@', 1);
  return jsonb_build_object(
    'status', case when inv.accepted_at is not null then 'used'
                   when inv.expires_at <= now() then 'expired'
                   else 'valid' end,
    'organization', org_name,
    'role', inv.role,
    'expires_at', inv.expires_at,
    'email_hint', left(local, 2) || '***@' || split_part(inv.email, '@', 2),
    'email_match', me is not null and me = lower(inv.email),
    'already_member', auth.uid() is not null and exists (
      select 1 from public.memberships m
      where m.organization_id = inv.organization_id and m.user_id = auth.uid() and m.status = 'active')
  );
end;
$$;
revoke execute on function public.invitation_preview(uuid) from public;
grant execute on function public.invitation_preview(uuid) to anon, authenticated;
