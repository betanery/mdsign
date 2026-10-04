-- MDSign Fase 2 — Blocos 4 e 5: reservas atômicas para formulários públicos e envio em massa.

-- Valores dos campos preenchidos por quem criou o link (ex.: empresa, finalidade).
alter table public.forms add column fixed_values jsonb not null default '{}'::jsonb;

-- Reserva uma resposta do formulário respeitando ativo, validade e máximo (sem corrida).
create or replace function public.claim_form_slot(target uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.forms
     set responses_count = responses_count + 1
   where id = target
     and active
     and (expires_at is null or expires_at > now())
     and (max_responses is null or responses_count < max_responses);
  return found;
end;
$$;

-- Devolve a reserva quando a criação do documento falha.
create or replace function public.release_form_slot(target uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.forms set responses_count = greatest(responses_count - 1, 0) where id = target;
$$;

-- Pega até n itens pendentes do lote para processar (vários processadores não pegam o mesmo).
create or replace function public.claim_bulk_items(job uuid, n integer)
returns setof public.bulk_items
language sql
security definer
set search_path = public
as $$
  update public.bulk_items b
     set status = 'processing', updated_at = now()
   where b.id in (
     select id from public.bulk_items
      where job_id = job and status = 'pending'
      order by row_number
      limit greatest(least(n, 50), 1)
      for update skip locked)
  returning b.*;
$$;

-- Recalcula os totais do lote e encerra quando não há mais pendentes.
create or replace function public.refresh_bulk_job(job uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.bulk_jobs j
     set sent = (select count(*) from public.bulk_items where job_id = job and status = 'sent'),
         failed = (select count(*) from public.bulk_items where job_id = job and status = 'failed'),
         status = case
           when j.status = 'sending' and not exists (
             select 1 from public.bulk_items where job_id = job and status in ('pending', 'processing'))
           then 'done' else j.status end
   where j.id = job;
$$;

revoke all on function public.claim_form_slot(uuid), public.release_form_slot(uuid),
  public.claim_bulk_items(uuid, integer), public.refresh_bulk_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_form_slot(uuid), public.release_form_slot(uuid),
  public.claim_bulk_items(uuid, integer), public.refresh_bulk_job(uuid) to service_role;
