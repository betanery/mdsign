// Faturamento MDSign sobre o Asaas: traduz eventos financeiros em estado interno.
//
//   Asaas (eventos) → billing (subscriptions/billing_*) → políticas → entitlements
//
// Regras:
// - Plano muda SÓ com pagamento confirmado pelo Asaas (PAYMENT_CONFIRMED/RECEIVED) — nunca
//   pelo retorno do checkout no navegador.
// - Idempotência em duas camadas: o id do evento é único (billing_events) e cada efeito confere
//   o estado atual antes de agir (ativar a mesma assinatura duas vezes não muda nada).
// - Inadimplência nunca apaga documentos, histórico ou usuários: só muda o status, e o motor de
//   políticas (consume_document) bloqueia novas operações quando suspenso.

import { asaas, asaasEnv, type AsaasPayment, type AsaasSubscription } from "./asaas.ts";
import { admin } from "./auth.ts";

const PAID = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const cents = (v: number | null | undefined) => (v == null ? null : Math.round(Number(v) * 100));

type Sub = {
  organization_id: string;
  plan_id: string;
  status: string;
  billing_status: string;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  past_due_since: string | null;
  cancel_at: string | null;
};

async function subByCustomer(customer: string | null | undefined): Promise<Sub | null> {
  if (!customer) return null;
  const { data } = await admin
    .from("subscriptions")
    .select(
      "organization_id, plan_id, status, billing_status, asaas_customer_id, asaas_subscription_id, past_due_since, cancel_at",
    )
    .eq("asaas_customer_id", customer)
    .maybeSingle();
  return (data as Sub | null) ?? null;
}

async function audit(org: string, action: string, data: Record<string, unknown>) {
  await admin.rpc("write_audit_as", {
    org,
    actor: null,
    act: action,
    ent: "subscription",
    ent_id: org,
    payload: { ...data, source: "asaas" },
  });
}

// Eventos podem chegar fora de ordem: um pagamento já recebido não volta a "confirmado"
// ou "pendente" por um aviso atrasado (só estorno/remoção mudam um pagamento recebido).
const SETTLED = new Set(["RECEIVED", "RECEIVED_IN_CASH"]);
const AFTER_SETTLED = new Set(["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "DELETED"]);

async function savePayment(org: string, p: AsaasPayment) {
  const { data: prev } = await admin
    .from("billing_payments")
    .select("status")
    .eq("asaas_payment_id", p.id)
    .maybeSingle();
  if (prev && SETTLED.has(prev.status) && !SETTLED.has(p.status) && !AFTER_SETTLED.has(p.status))
    return;
  await admin.from("billing_payments").upsert({
    asaas_payment_id: p.id,
    organization_id: org,
    asaas_subscription_id: p.subscription ?? null,
    environment: asaasEnv(),
    billing_type: p.billingType ?? null,
    value_cents: cents(p.value),
    status: p.status,
    due_date: p.dueDate ?? null,
    paid_at: p.confirmedDate ?? p.paymentDate ?? null,
    invoice_url: p.invoiceUrl ?? null,
    updated_at: new Date().toISOString(),
  });
}

/** Pagamento confirmado: ativa um plano novo (checkout pago) ou renova o atual. */
async function onPaid(sub: Sub, p: AsaasPayment) {
  const now = new Date().toISOString();
  if (!p.subscription) return;
  const remote: AsaasSubscription = await asaas.getSubscription(p.subscription);
  const base = {
    status: "active",
    billing_status: "paid",
    past_due_since: null,
    last_payment_at: p.confirmedDate ?? p.paymentDate ?? now,
    next_due_date: remote.nextDueDate ?? null,
    current_period_end: remote.nextDueDate ?? null,
    last_sync_at: now,
    updated_at: now,
  };

  // Renovação ou regularização da assinatura atual.
  if (sub.asaas_subscription_id === p.subscription) {
    const wasBlocked = sub.status === "past_due" || sub.status === "suspended";
    await admin.from("subscriptions").update(base).eq("organization_id", sub.organization_id);
    if (wasBlocked) await audit(sub.organization_id, "billing.regularized", { payment: p.id });
    return;
  }

  // Assinatura nova: descobre o plano pelo checkout que a originou.
  // Cartão: pelo checkout de origem. Pix: pela assinatura criada no pedido.
  const { data: checkout } = await admin
    .from("billing_checkouts")
    .select("id, plan_id, status")
    .eq("organization_id", sub.organization_id)
    .or(
      remote.checkoutSession
        ? `asaas_checkout_id.eq.${remote.checkoutSession},asaas_subscription_id.eq.${p.subscription}`
        : `asaas_subscription_id.eq.${p.subscription}`,
    )
    .maybeSingle();
  if (!checkout) throw new Error(`checkout não encontrado para a assinatura ${p.subscription}`);
  // Checkout já usado (ex.: pagamento atrasado de uma assinatura antiga, depois de trocar de
  // plano): só registra a cobrança, não reativa o plano antigo.
  if (checkout.status !== "pending") return;

  const previousSubscription = sub.asaas_subscription_id;
  await admin
    .from("subscriptions")
    .update({
      ...base,
      plan_id: checkout.plan_id,
      provider: "asaas",
      asaas_subscription_id: p.subscription,
      asaas_checkout_id: remote.checkoutSession ?? null,
      billing_cycle: "MONTHLY",
      value_cents: cents(remote.value),
      cancel_at: null,
    })
    .eq("organization_id", sub.organization_id);
  await admin
    .from("billing_checkouts")
    .update({ status: "paid", paid_at: now })
    .eq("id", checkout.id)
    .eq("status", "pending");
  await audit(sub.organization_id, "plan.changed", {
    from: sub.plan_id,
    to: checkout.plan_id,
    subscription: p.subscription,
  });
  // Troca de plano: a assinatura anterior deixa de cobrar (o Asaas não faz proporcionalidade).
  if (previousSubscription && previousSubscription !== p.subscription) {
    try {
      await asaas.deleteSubscription(previousSubscription);
    } catch (e) {
      console.error("asaas delete previous subscription", previousSubscription, e);
    }
  }
}

/** Processa um evento já gravado em billing_events. Lança erro para nova tentativa. */
export async function processBillingEvent(event: {
  id: string;
  event: string;
  payload: Record<string, unknown>;
}) {
  const payment = event.payload["payment"] as AsaasPayment | undefined;
  const subscription = event.payload["subscription"] as AsaasSubscription | undefined;
  const checkout = event.payload["checkout"] as { id?: string } | undefined;

  if (event.event.startsWith("CHECKOUT_") && checkout?.id) {
    const status =
      event.event === "CHECKOUT_CANCELED"
        ? "canceled"
        : event.event === "CHECKOUT_EXPIRED"
          ? "expired"
          : null;
    // CHECKOUT_PAID não ativa o plano: quem ativa é a confirmação do pagamento (acima).
    if (status)
      await admin
        .from("billing_checkouts")
        .update({ status })
        .eq("asaas_checkout_id", checkout.id)
        .eq("status", "pending");
    return null;
  }

  const customer = payment?.customer ?? subscription?.customer;
  const sub = await subByCustomer(customer);
  if (!sub) return null; // cliente que não é do MDSign: ignora (registrado no evento)

  if (payment) {
    await savePayment(sub.organization_id, payment);
    if (PAID.has(event.event)) await onPaid(sub, payment);
    else if (
      event.event === "PAYMENT_OVERDUE" &&
      payment.subscription &&
      payment.subscription !== sub.asaas_subscription_id
    ) {
      // 1ª fatura de um pedido Pix venceu sem pagamento: desfaz o pedido (o plano não mudou).
      const { data: order } = await admin
        .from("billing_checkouts")
        .select("id")
        .eq("asaas_subscription_id", payment.subscription)
        .eq("status", "pending")
        .maybeSingle();
      if (order) {
        await asaas.deleteSubscription(payment.subscription).catch(() => undefined);
        await admin.from("billing_checkouts").update({ status: "expired" }).eq("id", order.id);
      }
    } else if (
      event.event === "PAYMENT_OVERDUE" &&
      payment.subscription &&
      payment.subscription === sub.asaas_subscription_id &&
      sub.status === "active"
    ) {
      await admin
        .from("subscriptions")
        .update({
          status: "past_due",
          billing_status: "overdue",
          past_due_since: new Date().toISOString(),
          last_sync_at: new Date().toISOString(),
        })
        .eq("organization_id", sub.organization_id);
      await audit(sub.organization_id, "billing.past_due", { payment: payment.id });
    }
  }

  if (
    subscription &&
    (event.event === "SUBSCRIPTION_DELETED" || event.event === "SUBSCRIPTION_INACTIVATED") &&
    subscription.id === sub.asaas_subscription_id &&
    !sub.cancel_at
  ) {
    const { data: row } = await admin
      .from("subscriptions")
      .select("next_due_date")
      .eq("organization_id", sub.organization_id)
      .single();
    await admin
      .from("subscriptions")
      .update({ cancel_at: row?.next_due_date ?? new Date().toISOString() })
      .eq("organization_id", sub.organization_id);
    await audit(sub.organization_id, "billing.canceled", { subscription: subscription.id });
  }
  return sub.organization_id;
}

/** Rotina de hora em hora: reprocessa eventos, suspende após a tolerância, encerra cancelados. */
export async function runBilling() {
  const out = { retried: 0, suspended: 0, ended: 0 };
  try {
    asaasEnv();
  } catch {
    return out; // Asaas não configurado: nada a fazer
  }

  const { data: pending } = await admin
    .from("billing_events")
    .select("id, event, data, attempts")
    .is("processed_at", null)
    .lt("attempts", 10)
    .order("received_at")
    .limit(50);
  for (const e of pending ?? []) {
    try {
      const org = await processBillingEvent({
        id: e.id,
        event: e.event,
        payload: (e.data as { payload?: Record<string, unknown> }).payload ?? {},
      });
      await admin
        .from("billing_events")
        .update({ processed_at: new Date().toISOString(), organization_id: org, error: null })
        .eq("id", e.id);
      out.retried++;
    } catch (err) {
      await admin
        .from("billing_events")
        .update({ attempts: e.attempts + 1, error: String(err).slice(0, 300) })
        .eq("id", e.id);
    }
  }

  // Tolerância vencida: suspende (dados e documentos ficam preservados).
  const { data: grace } = await admin
    .from("policies")
    .select("config, active")
    .eq("id", "billing_grace")
    .maybeSingle();
  const days = grace?.active ? Number((grace.config as { days?: number }).days ?? 7) : 7;
  const { data: late } = await admin
    .from("subscriptions")
    .select("organization_id")
    .eq("status", "past_due")
    .lt("past_due_since", new Date(Date.now() - days * 86400000).toISOString());
  for (const s of late ?? []) {
    await admin
      .from("subscriptions")
      .update({ status: "suspended" })
      .eq("organization_id", s.organization_id)
      .eq("status", "past_due");
    await admin.from("policy_events").insert({
      organization_id: s.organization_id,
      policy_id: "billing_grace",
      data: { action: "suspended", days },
    });
    await audit(s.organization_id, "billing.suspended", { days });
    out.suspended++;
  }

  // Cancelamento: fim do período pago → volta ao Cedro (nada é apagado).
  const { data: ending } = await admin
    .from("subscriptions")
    .select("organization_id, plan_id")
    .not("cancel_at", "is", null)
    .lt("cancel_at", new Date().toISOString());
  for (const s of ending ?? []) {
    await admin
      .from("subscriptions")
      .update({
        plan_id: "cedro",
        provider: "internal",
        status: "active",
        billing_status: "free",
        asaas_subscription_id: null,
        asaas_checkout_id: null,
        value_cents: null,
        billing_cycle: null,
        next_due_date: null,
        current_period_end: null,
        past_due_since: null,
        cancel_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", s.organization_id);
    await audit(s.organization_id, "plan.changed", {
      from: s.plan_id,
      to: "cedro",
      reason: "canceled",
    });
    out.ended++;
  }
  return out;
}
