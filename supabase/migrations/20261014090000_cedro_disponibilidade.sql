-- MDSign — Condições do Cedro: cada documento criado no plano gratuito fica disponível para
-- consulta e download por 6 meses a partir da criação. Encerrar a disponibilidade NÃO apaga
-- nada (as evidências de assinatura continuam guardadas) e não devolve franquia. Se a
-- organização passar para um plano pago, o acesso volta. O prazo é ajustável na política.
insert into public.policies (id, description, config) values
  ('cedro_availability',
   'Meses de disponibilidade (consulta e download) de cada documento criado no plano Cedro',
   '{"months": 6}')
on conflict (id) do nothing;

-- Data até a qual o documento fica disponível ao usuário (nula = sem prazo, plano pago).
create function public.document_available_until(doc uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select case
    when s.plan_id = 'cedro' and p.active then
      d.created_at + make_interval(months => coalesce((p.config->>'months')::int, 6))
  end
  from public.documents d
  join public.subscriptions s on s.organization_id = d.organization_id
  left join public.policies p on p.id = 'cedro_availability'
  where d.id = doc and (public.can_view_document(doc) or auth.role() = 'service_role');
$$;

-- Meses de disponibilidade do Cedro (para a tela calcular a data de cada documento).
create function public.cedro_availability_months() returns integer
language sql stable security definer set search_path = '' as $$
  select case when active then coalesce((config->>'months')::int, 6) end
  from public.policies where id = 'cedro_availability';
$$;

revoke execute on function public.document_available_until(uuid), public.cedro_availability_months()
  from public, anon;
grant execute on function public.document_available_until(uuid), public.cedro_availability_months()
  to authenticated, service_role;
