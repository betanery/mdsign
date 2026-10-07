-- Asaas: o Checkout recorrente só aceita cartão. Pix recorrente usa a assinatura da API
-- (POST /subscriptions, billingType PIX), ligada ao pedido pela externalReference.
alter table public.billing_checkouts
  add column method text not null default 'CREDIT_CARD'
    check (method in ('CREDIT_CARD', 'PIX')),
  -- Pix: assinatura criada já no pedido (vira a assinatura da organização só após o pagamento).
  add column asaas_subscription_id text unique;
