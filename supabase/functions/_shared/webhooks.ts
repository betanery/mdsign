// Webhooks de saída (PRD §31): o MDSign avisa o sistema do cliente sobre os eventos dos
// documentos. Cada aviso vai assinado (HMAC-SHA256 com o segredo do destino) e é reenviado
// com espera crescente até 8 tentativas.

import { admin } from "./auth.ts";

const BACKOFF_MIN = [1, 5, 15, 60, 180, 360, 720, 1440];
const TIMEOUT_MS = 10_000;

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function signPayload(secret: string, timestamp: number, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`)),
  );
}

export function newSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `whsec_${hex(bytes.buffer)}`;
}

type Due = {
  id: string;
  event_type: string;
  payload: unknown;
  attempts: number;
  webhook_endpoints: { url: string; secret: string; active: boolean } | null;
};

/** Envia uma entrega e registra o resultado (entregue, nova tentativa ou falha). */
export async function deliver(d: Due) {
  const ep = d.webhook_endpoints;
  const attempts = d.attempts + 1;
  let status = 0;
  let error: string | null = null;
  if (!ep?.active) error = "endpoint_inactive";
  else {
    const body = JSON.stringify(d.payload);
    const ts = Math.floor(Date.now() / 1000);
    try {
      const res = await fetch(ep.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "MDSign-Webhooks/1.0",
          "X-MDSign-Event": d.event_type,
          "X-MDSign-Delivery": d.id,
          "X-MDSign-Signature": `t=${ts},v1=${await signPayload(ep.secret, ts, body)}`,
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      await res.body?.cancel();
      if (status < 200 || status >= 300) error = `http_${status}`;
    } catch (e) {
      error = e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network_error";
    }
  }
  const delivered = !error;
  const giveUp = !delivered && (attempts >= BACKOFF_MIN.length || error === "endpoint_inactive");
  await admin
    .from("webhook_deliveries")
    .update({
      attempts,
      response_status: status || null,
      last_error: error,
      status: delivered ? "delivered" : giveUp ? "failed" : "pending",
      delivered_at: delivered ? new Date().toISOString() : null,
      next_attempt_at: new Date(
        Date.now() + (BACKOFF_MIN[attempts - 1] ?? 1440) * 60_000,
      ).toISOString(),
    })
    .eq("id", d.id);
  return delivered;
}

/** Entrega o que estiver pendente e vencido (agendador ou logo após um evento). */
export async function deliverDue(limit = 50, organizationId?: string) {
  let q = admin
    .from("webhook_deliveries")
    .select(
      "id, organization_id, event_type, payload, attempts, webhook_endpoints (url, secret, active)",
    )
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(limit);
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data } = await q;
  let sent = 0;
  // Sem Integrações no plano (exclusivo do Mogno): a entrega falha sem novas tentativas.
  const allowed = new Map<string, boolean>();
  for (const d of (data ?? []) as unknown as (Due & { organization_id: string })[]) {
    if (!allowed.has(d.organization_id)) {
      const { data: ok } = await admin.rpc("entitlement_bool", {
        org: d.organization_id,
        ent: "integrations_access",
      });
      allowed.set(d.organization_id, Boolean(ok));
    }
    if (!allowed.get(d.organization_id)) {
      await admin
        .from("webhook_deliveries")
        .update({ status: "failed", last_error: "plan_feature_unavailable" })
        .eq("id", d.id);
      continue;
    }
    if (await deliver(d)) sent++;
  }
  return { processed: data?.length ?? 0, delivered: sent };
}
