-- MDSign — Funil: eventos do app enviados pela pessoa logada (clique em upgrade, recurso pago).
-- Só nomes da lista, só na organização da qual a pessoa é membro, sem dados pessoais.
create function public.growth_app_event(org uuid, ev text, payload jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if ev not in ('upgrade_cta_clicked', 'paid_feature_attempted') or not public.is_org_member(org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(payload, '{}'::jsonb)) <> 'object' or pg_column_size(payload) > 1000 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  perform public.growth_mark(org, auth.uid(), ev, coalesce(payload, '{}'::jsonb), false);
end;
$$;
revoke execute on function public.growth_app_event(uuid, text, jsonb) from public, anon;
grant execute on function public.growth_app_event(uuid, text, jsonb) to authenticated;
