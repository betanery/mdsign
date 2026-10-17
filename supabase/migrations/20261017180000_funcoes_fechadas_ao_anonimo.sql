-- MDSign — Homologação de 17/10/2026 (SEC-13): funções privilegiadas deixam de ser executáveis
-- por quem não está logado. Elas vinham com EXECUTE para PUBLIC (padrão do Postgres), o que
-- deixava o visitante chamar, por exemplo, entitlement_exists e descobrir recursos do plano de
-- uma organização pelo UUID. Quem está logado continua podendo (as regras de RLS usam várias
-- delas) e gatilhos não dependem de EXECUTE. Nada é apagado.

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname in (
        'audit_groups_delegations', 'can_view_document', 'check_delegation', 'check_group_member',
        'entitlement_exists', 'entitlement_int', 'growth_on_checkout', 'growth_on_document',
        'handle_new_organization', 'has_org_permission', 'is_org_member', 'is_platform_admin',
        'org_role_of'
      )
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;
