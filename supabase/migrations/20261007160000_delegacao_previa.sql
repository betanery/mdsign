-- Prévia da delegação no envio: para cada e-mail de aprovador, o nome do delegado ativo agora
-- (só membros da organização consultam; devolve só o nome, nada do período ou observação).
create function public.delegation_preview(org uuid, emails text[])
returns table (email text, delegate_name text)
language sql stable security definer set search_path = '' as $$
  select lower(u.email)::text, coalesce(nullif(btrim(p.full_name), ''), du.email)::text
  from unnest(emails) e(addr)
  join auth.users u on lower(u.email) = lower(e.addr)
  join public.delegations d on d.organization_id = org and d.delegator_id = u.id
    and d.scope = 'approvals' and d.active and d.revoked_at is null
    and now() >= d.starts_at and now() < d.ends_at
  join auth.users du on du.id = d.delegate_id
  left join public.profiles p on p.id = d.delegate_id
  where public.is_org_member(org);
$$;
revoke execute on function public.delegation_preview(uuid, text[]) from public, anon;
grant execute on function public.delegation_preview(uuid, text[]) to authenticated;
