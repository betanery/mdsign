// Webhook financeiro do Asaas (infraestrutura interna, vale para todos os planos pagos — não
// depende do recurso comercial "Integrações"). Fluxo recomendado pelo Asaas: autenticar,
// gravar, responder 200 e processar. Entrega "pelo menos uma vez": o id do evento é a chave
// única, então o mesmo evento recebido de novo não tem efeito.

import { asaasEnv, webhookToken } from "../_shared/asaas.ts";
import { admin } from "../_shared/auth.ts";
import { processBillingEvent } from "../_shared/billing.ts";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length || !a) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const pick = (o: unknown, keys: string[]) =>
  o && typeof o === "object"
    ? Object.fromEntries(
        keys
          .filter((k) => (o as Record<string, unknown>)[k] !== undefined)
          .map((k) => [k, (o as Record<string, unknown>)[k]]),
      )
    : undefined;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const token = webhookToken();
  if (!token || !safeEqual(req.headers.get("asaas-access-token") ?? "", token))
    return new Response(null, { status: 401 });
  let env: string;
  try {
    env = asaasEnv();
  } catch {
    return new Response(null, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const id = typeof body["id"] === "string" ? body["id"] : "";
  const event = typeof body["event"] === "string" ? body["event"] : "";
  if (!id || !event) return new Response(null, { status: 400 });

  // Só identificadores, valores e datas — nada de dados pessoais ou de cartão.
  const payload = {
    payment: pick(body["payment"], [
      "id",
      "customer",
      "subscription",
      "value",
      "status",
      "billingType",
      "dueDate",
      "paymentDate",
      "confirmedDate",
      "invoiceUrl",
      "externalReference",
      "checkoutSession",
    ]),
    subscription: pick(body["subscription"], [
      "id",
      "customer",
      "status",
      "nextDueDate",
      "value",
      "deleted",
    ]),
    checkout: pick(body["checkout"], ["id", "status", "customer"]),
  };
  const { data: inserted } = await admin
    .from("billing_events")
    .upsert(
      { id, event, environment: env, data: { payload } },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id");
  // Já recebido antes: confirma sem reprocessar (idempotência).
  if (!inserted?.length) return Response.json({ ok: true, duplicate: true });

  try {
    const org = await processBillingEvent({ id, event, payload });
    await admin
      .from("billing_events")
      .update({ processed_at: new Date().toISOString(), organization_id: org, attempts: 1 })
      .eq("id", id);
  } catch (e) {
    // Fica para a rotina de hora em hora tentar de novo; o Asaas não precisa reenviar.
    console.error("asaas event", id, event, e);
    await admin
      .from("billing_events")
      .update({ attempts: 1, error: String(e).slice(0, 300) })
      .eq("id", id);
  }
  return Response.json({ ok: true });
});
