-- Integrações (API MDSign e webhooks para sistemas do cliente) são exclusivas do Mogno:
-- sem o entitlement integrations_access, eventos não entram na fila de webhooks de saída.
-- (O webhook financeiro do Asaas é outro fluxo e não passa por aqui.)

create or replace function public.enqueue_webhooks() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  doc record;
  public_type text := case new.type
    when 'document.created' then 'document.created'
    when 'document.sent' then 'document.sent'
    when 'participant.signed' then 'participant.signed'
    when 'participant.approved' then 'participant.approved'
    when 'participant.refused' then 'participant.refused'
    when 'participant.added' then 'participant.added'
    when 'participant.removed' then 'participant.removed'
    when 'document.version_added' then 'document.version_added'
    when 'document.concluded' then 'document.concluded'
    when 'document.refused' then 'document.refused'
    when 'document.canceled' then 'document.canceled'
    when 'document.expired' then 'document.expired'
    else null end;
begin
  if public_type is null then return new; end if;
  if not public.entitlement_bool(new.organization_id, 'integrations_access') then return new; end if;
  if not exists (select 1 from public.webhook_endpoints
                 where organization_id = new.organization_id and active) then
    return new;
  end if;
  select id, name, status, kind, created_at into doc from public.documents where id = new.document_id;
  insert into public.webhook_deliveries (endpoint_id, organization_id, event_type, payload)
  select e.id, new.organization_id, public_type,
    jsonb_build_object(
      'id', gen_random_uuid(),
      'type', public_type,
      'occurredAt', new.occurred_at,
      'data', jsonb_build_object(
        'documentId', doc.id,
        'documentName', doc.name,
        'documentStatus', doc.status,
        'participantName', new.actor_name,
        'details', new.data - 'by'))
  from public.webhook_endpoints e
  where e.organization_id = new.organization_id and e.active
    and (e.events @> array['*'] or e.events @> array[public_type]);
  return new;
end;
$$;
