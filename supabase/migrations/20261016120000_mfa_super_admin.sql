-- MDSign — MFA obrigatório para o Super Admin (auditoria 16/10/2026, Fase 1 item 4).
-- O acesso de Super Admin só vale com a sessão confirmada pelo código (aal2). Como todas as
-- funções e políticas de administração passam por is_platform_admin(), a trava fica no banco.

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- Para a tela explicar por que o acesso foi negado (sem liberar nada).
create function public.platform_admin_status() returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from public.platform_admins where user_id = auth.uid()) then 'no'
    when coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then 'needs_mfa'
    else 'ok'
  end;
$$;
revoke execute on function public.platform_admin_status() from public, anon;
grant execute on function public.platform_admin_status() to authenticated;
