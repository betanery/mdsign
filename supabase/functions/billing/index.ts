// Plano e cobrança (app logado). Só o servidor fala com o Asaas (SANDBOX nesta fase).
//   checkout       → cria (ou reaproveita) o cliente no Asaas e um Checkout recorrente do plano
//   cancel         → cancela a assinatura no Asaas; o plano vale até o fim do período pago
//   sync           → atualiza vencimento e histórico de cobranças (não muda o plano)
//   status         → (Super Admin) ambiente e configuração, sem expor chaves
//   setup-webhook  → (Super Admin) cadastra/atualiza o webhook do Sandbox no Asaas
// O retorno do Checkout no navegador NUNCA ativa plano: só o webhook financeiro.

import { asaas, asaasEnv, webhookToken } from "../_shared/asaas.ts";
import { MDSIGN_LOGO_BASE64 } from "../_shared/asaas-logo.ts";
import { admin, requirePermission, requireUser, type Caller } from "../_shared/auth.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const WEBHOOK_EVENTS = [
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
  "PAYMENT_REFUNDED",
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_UPDATED",
  "SUBSCRIPTION_INACTIVATED",
  "SUBSCRIPTION_DELETED",
  "CHECKOUT_CREATED",
  "CHECKOUT_CANCELED",
  "CHECKOUT_EXPIRED",
  "CHECKOUT_PAID",
];

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD

async function requirePlatformAdmin(asUser: Caller["asUser"]) {
  const { data } = await asUser.rpc("is_platform_admin");
  if (!data) throw new AppError("forbidden", 403);
}

/** Cliente do Asaas da organização: reaproveita o vínculo; nunca cria um por checkout. */
async function ensureCustomer(
  organizationId: string,
  fallback: { cpf: string | null; email: string | null },
) {
  const { data: sub } = await admin
    .from("subscriptions")
    .select("asaas_customer_id")
    .eq("organization_id", organizationId)
    .single();
  if (sub?.asaas_customer_id) return sub.asaas_customer_id as string;

  // Já existe no Asaas (ex.: vínculo perdido)? Procura pela referência da organização.
  const found = await asaas.findCustomer(organizationId);
  let id = found?.id;
  if (!id) {
    const { data: org } = await admin
      .from("organizations")
      .select("name, cnpj")
      .eq("id", organizationId)
      .single();
    const cpfCnpj = org?.cnpj || fallback.cpf;
    if (!org || !cpfCnpj) throw new AppError("billing_document_required", 422);
    id = (
      await asaas.createCustomer({
        name: org.name,
        cpfCnpj,
        email: fallback.email,
        externalReference: organizationId,
      })
    ).id;
  }
  // Grava só se ainda não houver vínculo (duas abas ao mesmo tempo não criam dois vínculos).
  await admin
    .from("subscriptions")
    .update({ asaas_customer_id: id })
    .eq("organization_id", organizationId)
    .is("asaas_customer_id", null);
  return id;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    const caller = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body["action"] ?? "");

    if (action === "status") {
      await requirePlatformAdmin(caller.asUser);
      let environment: string | null = null;
      let error: string | null = null;
      try {
        environment = asaasEnv();
      } catch (e) {
        error = e instanceof AppError ? e.code : "billing_not_configured";
      }
      return json(
        {
          environment,
          error,
          apiKeyConfigured: Boolean(Deno.env.get("ASAAS_API_KEY")),
          webhookTokenConfigured: Boolean(webhookToken()),
          productionEnabled: false,
        },
        200,
        origin,
      );
    }

    if (action === "setup-webhook") {
      await requirePlatformAdmin(caller.asUser);
      const token = webhookToken();
      if (token.length < 32) throw new AppError("billing_not_configured", 503);
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/asaas-webhook`;
      const config = {
        name: `MDSign (${asaasEnv()})`,
        url,
        email: caller.user.email,
        enabled: true,
        interrupted: false,
        apiVersion: 3,
        authToken: token,
        sendType: "SEQUENTIALLY",
        events: WEBHOOK_EVENTS,
      };
      const existing = (await asaas.listWebhooks()).data?.find((w) => w.url === url);
      const r = existing
        ? await asaas.updateWebhook(existing.id, config)
        : await asaas.createWebhook(config);
      return json({ ok: true, webhookId: r.id, url, environment: asaasEnv() }, 200, origin);
    }

    const organizationId = String(body["organizationId"] ?? "");
    if (!organizationId) throw new AppError("organization_required");

    // Dados de cobrança do cartão (o Asaas exige telefone e endereço do cliente no Checkout).
    // Ficam só no Asaas, no mesmo cliente da organização; o MDSign não os guarda.
    if (action === "customer-data") {
      await requirePermission(caller, organizationId, "billing.manage");
      const d = (body["data"] ?? {}) as Record<string, unknown>;
      const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
      const text = (v: unknown, max = 120) =>
        String(v ?? "")
          .trim()
          .slice(0, max);
      const data = {
        mobilePhone: digits(d["phone"]),
        postalCode: digits(d["postalCode"]),
        address: text(d["address"]),
        addressNumber: text(d["addressNumber"], 20),
        complement: text(d["complement"], 60),
        province: text(d["province"], 80),
        city: text(d["city"], 80),
      };
      const problems = [
        ...(data.mobilePhone.length < 10 || data.mobilePhone.length > 11 ? ["phone"] : []),
        ...(data.postalCode.length !== 8 ? ["postalCode"] : []),
        ...(data.address.length < 2 ? ["address"] : []),
        ...(!data.addressNumber ? ["addressNumber"] : []),
        ...(data.province.length < 2 ? ["province"] : []),
        ...(data.city.length < 2 ? ["city"] : []),
      ];
      if (problems.length) throw new AppError("invalid_fields", 422, problems);
      const customer = await ensureCustomer(organizationId, {
        cpf: caller.profile.cpf,
        email: caller.user.email ?? null,
      });
      await asaas.updateCustomer(customer, { ...data, phone: data.mobilePhone });
      await admin.rpc("write_audit_as", {
        org: organizationId,
        actor: caller.user.id,
        act: "billing.customer_updated",
        ent: "subscription",
        ent_id: organizationId,
        payload: {},
      });
      return json({ ok: true }, 200, origin);
    }

    if (action === "checkout") {
      await requirePermission(caller, organizationId, "billing.manage");
      const env = asaasEnv();
      const planId = String(body["planId"] ?? "");
      const method = body["method"] === "PIX" ? "PIX" : "CREDIT_CARD";
      // Preço da matriz publicada (versão vigente para novas contratações).
      const { data: offer } = await admin.rpc("plan_offer");
      const plan =
        (
          (
            offer as {
              plans: { id: string; name: string; price_cents: number | null; is_public: boolean }[];
            } | null
          )?.plans ?? []
        ).find((x) => x.id === planId) ?? null;
      // Cedro é interno (sem Asaas) e Mogno é contratação comercial: sem checkout automático.
      if (!plan || !plan.is_public || !plan.price_cents || plan.id === "mogno")
        throw new AppError("billing_plan_unavailable", 422);
      const { data: sub } = await admin
        .from("subscriptions")
        .select("plan_id, provider, asaas_subscription_id, cancel_at")
        .eq("organization_id", organizationId)
        .single();
      if (sub && sub.plan_id === plan.id && sub.asaas_subscription_id && !sub.cancel_at)
        throw new AppError("billing_same_plan", 409);

      // Checkout pendente recente do mesmo plano: devolve o mesmo link (sem duplicar).
      const { data: pending } = await admin
        .from("billing_checkouts")
        .select("id, link")
        .eq("organization_id", organizationId)
        .eq("plan_id", plan.id)
        .eq("method", method)
        .eq("status", "pending")
        .gt("created_at", new Date(Date.now() - 50 * 60 * 1000).toISOString())
        .not("link", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pending?.link) return json({ link: pending.link, reused: true }, 200, origin);

      const customer = await ensureCustomer(organizationId, {
        cpf: caller.profile.cpf,
        email: caller.user.email ?? null,
      });
      const { data: row, error } = await admin
        .from("billing_checkouts")
        .insert({
          organization_id: organizationId,
          plan_id: plan.id,
          previous_plan_id: sub?.plan_id ?? null,
          environment: env,
          method,
          value_cents: plan.price_cents,
          created_by: caller.user.id,
        })
        .select("id")
        .single();
      if (error || !row) throw new AppError("internal_error", 500);

      // O Asaas só aceita retorno público em HTTPS: pedidos feitos de um endereço local
      // (desenvolvimento) voltam para o primeiro endereço público permitido.
      const back =
        origin && origin.startsWith("https://") && allowedOrigins.includes(origin)
          ? origin
          : (allowedOrigins.find((o) => o.startsWith("https://")) ?? "");
      const ret = (state: string) => `${back}/app/plan?checkout=${state}`;
      try {
        if (method === "PIX") {
          // Pix recorrente: assinatura pela API; a pessoa paga a 1ª fatura (QR Code).
          const created = await asaas.createSubscription({
            customer,
            billingType: "PIX",
            value: plan.price_cents / 100,
            nextDueDate: today(),
            cycle: "MONTHLY",
            description: `MDSign ${plan.name} (mensal)`,
            externalReference: row.id,
          });
          const first = (await asaas.subscriptionPayments(created.id))[0];
          if (!first?.invoiceUrl) throw new AppError("billing_unavailable", 502);
          await admin
            .from("billing_checkouts")
            .update({ asaas_subscription_id: created.id, link: first.invoiceUrl })
            .eq("id", row.id);
          await admin.rpc("write_audit_as", {
            org: organizationId,
            actor: caller.user.id,
            act: "billing.checkout_created",
            ent: "billing_checkout",
            ent_id: row.id,
            payload: { plan: plan.id, from: sub?.plan_id ?? null, method, environment: env },
          });
          return json({ link: first.invoiceUrl }, 200, origin);
        }
        // Cartão: Checkout hospedado recorrente (o Asaas só aceita cartão em RECURRENT).
        const checkout = await asaas.createCheckout({
          billingTypes: ["CREDIT_CARD"],
          chargeTypes: ["RECURRENT"],
          minutesToExpire: 60,
          externalReference: row.id,
          customer,
          callback: {
            successUrl: ret("success"),
            cancelUrl: ret("canceled"),
            expiredUrl: ret("expired"),
          },
          items: [
            {
              name: `MDSign ${plan.name}`,
              description: `Assinatura mensal do plano ${plan.name}`,
              quantity: 1,
              value: plan.price_cents / 100,
              imageBase64: MDSIGN_LOGO_BASE64,
              externalReference: plan.id,
            },
          ],
          subscription: { cycle: "MONTHLY", nextDueDate: today() },
        });
        await admin
          .from("billing_checkouts")
          .update({ asaas_checkout_id: checkout.id, link: checkout.link })
          .eq("id", row.id);
        await admin.rpc("write_audit_as", {
          org: organizationId,
          actor: caller.user.id,
          act: "billing.checkout_created",
          ent: "billing_checkout",
          ent_id: row.id,
          payload: { plan: plan.id, from: sub?.plan_id ?? null, method, environment: env },
        });
        return json({ link: checkout.link }, 200, origin);
      } catch (e) {
        await admin.from("billing_checkouts").update({ status: "failed" }).eq("id", row.id);
        // Faltam telefone/endereço do cliente: a tela pede os dados de cobrança e tenta de novo.
        const missing = (
          (e as AppError).details as { errors?: { description?: string | null }[] }
        )?.errors?.some((x) => /phone|address|postalCode|province|city/.test(x.description ?? ""));
        if (missing) throw new AppError("billing_customer_data_required", 422);
        throw e;
      }
    }

    if (action === "cancel") {
      await requirePermission(caller, organizationId, "billing.manage");
      const { data: sub } = await admin
        .from("subscriptions")
        .select("asaas_subscription_id, next_due_date, cancel_at")
        .eq("organization_id", organizationId)
        .single();
      if (!sub?.asaas_subscription_id) throw new AppError("billing_no_subscription", 409);
      if (sub.cancel_at) return json({ ok: true, cancelAt: sub.cancel_at }, 200, origin);
      await asaas.deleteSubscription(sub.asaas_subscription_id);
      const cancelAt = sub.next_due_date ?? new Date().toISOString();
      await admin
        .from("subscriptions")
        .update({ cancel_at: cancelAt, last_sync_at: new Date().toISOString() })
        .eq("organization_id", organizationId);
      await admin.rpc("write_audit_as", {
        org: organizationId,
        actor: caller.user.id,
        act: "billing.cancel_requested",
        ent: "subscription",
        ent_id: organizationId,
        payload: { subscription: sub.asaas_subscription_id, cancelAt },
      });
      return json({ ok: true, cancelAt }, 200, origin);
    }

    if (action === "sync") {
      await requirePermission(caller, organizationId, "billing.view");
      const { data: sub } = await admin
        .from("subscriptions")
        .select("asaas_subscription_id")
        .eq("organization_id", organizationId)
        .single();
      if (!sub?.asaas_subscription_id) return json({ ok: true, synced: 0 }, 200, origin);
      const [remote, payments] = await Promise.all([
        asaas.getSubscription(sub.asaas_subscription_id),
        asaas.subscriptionPayments(sub.asaas_subscription_id),
      ]);
      for (const p of payments)
        await admin.from("billing_payments").upsert({
          asaas_payment_id: p.id,
          organization_id: organizationId,
          asaas_subscription_id: p.subscription ?? sub.asaas_subscription_id,
          environment: asaasEnv(),
          billing_type: p.billingType ?? null,
          value_cents: Math.round(Number(p.value) * 100),
          status: p.status,
          due_date: p.dueDate ?? null,
          paid_at: p.confirmedDate ?? p.paymentDate ?? null,
          invoice_url: p.invoiceUrl ?? null,
          updated_at: new Date().toISOString(),
        });
      await admin
        .from("subscriptions")
        .update({ next_due_date: remote.nextDueDate, last_sync_at: new Date().toISOString() })
        .eq("organization_id", organizationId);
      return json({ ok: true, synced: payments.length }, 200, origin);
    }

    throw new AppError("invalid_request");
  } catch (error) {
    return handleError(error, origin);
  }
});
