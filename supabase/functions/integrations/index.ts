// Gestão das integrações da organização (PRD §31): chaves de API (mostradas uma única vez;
// o banco guarda só o hash) e destinos de webhook (segredo de assinatura, teste, reenvio).

import { admin, requirePermission, requireUser } from "../_shared/auth.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import { sha256Hex } from "../_shared/pdf.ts";
import { deliver, newSecret } from "../_shared/webhooks.ts";

export const WEBHOOK_EVENTS = [
  "document.created",
  "document.sent",
  "participant.signed",
  "participant.approved",
  "participant.refused",
  "participant.added",
  "participant.removed",
  "document.version_added",
  "document.concluded",
  "document.refused",
  "document.canceled",
  "document.expired",
];

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

function cleanUrl(raw: unknown) {
  const url = String(raw ?? "").trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError("invalid_webhook_url");
  }
  // Só HTTPS público: nada de endereços internos.
  const host = parsed.hostname;
  if (
    parsed.protocol !== "https:" ||
    url.length > 500 ||
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  )
    throw new AppError("invalid_webhook_url");
  return url;
}

const cleanEvents = (raw: unknown) => {
  const list = Array.isArray(raw) ? raw.map(String) : ["*"];
  if (list.includes("*") || !list.length) return ["*"];
  const ok = list.filter((e) => WEBHOOK_EVENTS.includes(e));
  if (!ok.length) throw new AppError("invalid_request");
  return ok;
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    const caller = await requireUser(req);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new AppError("invalid_request");
    }
    const organizationId = String(body["organizationId"] ?? "");
    if (!organizationId) throw new AppError("organization_required");
    await requirePermission(caller, organizationId, "integrations.manage");
    // Integrações (API e webhooks para sistemas do cliente) são exclusivas do Mogno.
    const { data: allowed } = await admin.rpc("entitlement_bool", {
      org: organizationId,
      ent: "integrations_access",
    });
    if (!allowed) {
      // Sinal de intenção de plano pago para o funil.
      await admin.rpc("growth_mark", {
        org: organizationId,
        usr: caller.user.id,
        ev: "paid_feature_attempted",
        payload: { feature: "integrations" },
        is_milestone: false,
      });
      throw new AppError("plan_feature_unavailable", 403);
    }
    const action = String(body["action"] ?? "");
    const audit = (act: string, ent: string, id: string, payload: Record<string, unknown> = {}) =>
      admin.rpc("write_audit_as", {
        org: organizationId,
        actor: caller.user.id,
        act,
        ent,
        ent_id: id,
        payload,
      });

    if (action === "create-key") {
      const name = String(body["name"] ?? "")
        .trim()
        .slice(0, 80);
      if (name.length < 2) throw new AppError("invalid_request");
      const prefix = `mds_${hex(crypto.getRandomValues(new Uint8Array(4)))}`;
      const key = `${prefix}_${hex(crypto.getRandomValues(new Uint8Array(24)))}`;
      const { data, error } = await admin
        .from("api_keys")
        .insert({
          organization_id: organizationId,
          name,
          prefix,
          key_hash: await sha256Hex(new TextEncoder().encode(key)),
          created_by: caller.user.id,
        })
        .select("id")
        .single();
      if (error || !data) throw new AppError("internal_error", 500);
      await audit("integration.key_created", "api_key", data.id, { name, prefix });
      // A chave completa só existe nesta resposta.
      return json({ id: data.id, key, prefix }, 200, origin);
    }

    if (action === "revoke-key") {
      const id = String(body["id"] ?? "");
      const { data } = await admin
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .eq("organization_id", organizationId)
        .is("revoked_at", null)
        .select("id, prefix")
        .maybeSingle();
      if (!data) throw new AppError("not_found", 404);
      await audit("integration.key_revoked", "api_key", id, { prefix: data.prefix });
      return json({ ok: true }, 200, origin);
    }

    if (action === "create-endpoint") {
      const secret = newSecret();
      const { data, error } = await admin
        .from("webhook_endpoints")
        .insert({
          organization_id: organizationId,
          url: cleanUrl(body["url"]),
          description:
            String(body["description"] ?? "")
              .trim()
              .slice(0, 160) || null,
          events: cleanEvents(body["events"]),
          secret,
          created_by: caller.user.id,
        })
        .select("id, url")
        .single();
      if (error || !data) throw new AppError("internal_error", 500);
      await audit("integration.webhook_created", "webhook_endpoint", data.id, { url: data.url });
      // O segredo de assinatura só é mostrado agora.
      return json({ id: data.id, secret }, 200, origin);
    }

    // Demais ações sobre um destino existente da organização.
    const endpointId = String(body["endpointId"] ?? "");
    const { data: ep } = endpointId
      ? await admin
          .from("webhook_endpoints")
          .select("id, url, secret, active")
          .eq("id", endpointId)
          .eq("organization_id", organizationId)
          .maybeSingle()
      : { data: null };

    if (action === "update-endpoint") {
      if (!ep) throw new AppError("not_found", 404);
      const patch: Record<string, unknown> = {};
      if (body["url"] !== undefined) patch["url"] = cleanUrl(body["url"]);
      if (body["events"] !== undefined) patch["events"] = cleanEvents(body["events"]);
      if (body["active"] !== undefined) patch["active"] = Boolean(body["active"]);
      if (body["description"] !== undefined)
        patch["description"] =
          String(body["description"] ?? "")
            .trim()
            .slice(0, 160) || null;
      await admin.from("webhook_endpoints").update(patch).eq("id", ep.id);
      await audit("integration.webhook_updated", "webhook_endpoint", ep.id, patch);
      return json({ ok: true }, 200, origin);
    }

    if (action === "rotate-secret") {
      if (!ep) throw new AppError("not_found", 404);
      const secret = newSecret();
      await admin.from("webhook_endpoints").update({ secret }).eq("id", ep.id);
      await audit("integration.webhook_secret_rotated", "webhook_endpoint", ep.id);
      return json({ secret }, 200, origin);
    }

    if (action === "delete-endpoint") {
      if (!ep) throw new AppError("not_found", 404);
      await admin.from("webhook_endpoints").delete().eq("id", ep.id);
      await audit("integration.webhook_deleted", "webhook_endpoint", ep.id, { url: ep.url });
      return json({ ok: true }, 200, origin);
    }

    if (action === "test-endpoint") {
      if (!ep) throw new AppError("not_found", 404);
      const { data: d } = await admin
        .from("webhook_deliveries")
        .insert({
          endpoint_id: ep.id,
          organization_id: organizationId,
          event_type: "webhook.test",
          payload: {
            id: crypto.randomUUID(),
            type: "webhook.test",
            occurredAt: new Date().toISOString(),
            data: { message: "Teste de webhook do MDSign" },
          },
        })
        .select("id, event_type, payload, attempts")
        .single();
      const ok = await deliver({ ...d!, webhook_endpoints: ep });
      const { data: after } = await admin
        .from("webhook_deliveries")
        .select("status, response_status, last_error")
        .eq("id", d!.id)
        .single();
      return json({ ok, ...after }, 200, origin);
    }

    if (action === "redeliver") {
      const { data } = await admin
        .from("webhook_deliveries")
        .update({
          status: "pending",
          next_attempt_at: new Date().toISOString(),
          attempts: 0,
          last_error: null,
        })
        .eq("id", String(body["deliveryId"] ?? ""))
        .eq("organization_id", organizationId)
        .select("id")
        .maybeSingle();
      if (!data) throw new AppError("not_found", 404);
      return json({ ok: true }, 200, origin);
    }

    throw new AppError("invalid_request");
  } catch (error) {
    return handleError(error, origin);
  }
});
