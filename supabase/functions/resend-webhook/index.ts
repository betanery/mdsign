// Avisos do Resend sobre os e-mails do MDSign (convites e lembretes): entregue, aberto e
// devolvido. Autenticado pela assinatura Svix do Resend (segredo RESEND_WEBHOOK_SECRET).
// Grava a situação na notificação e um evento na linha do tempo (1ª entrega/abertura só).

import { admin } from "../_shared/auth.ts";

const SECRET = (Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "").trim();
const TOLERANCE_S = 5 * 60;

function fromBase64(b64: string) {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Svix: base64(HMAC-SHA256(chave, "id.timestamp.corpo")), cabeçalho "v1,assinatura ...". */
export async function validSignature(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
  header: string,
  now = Date.now(),
) {
  if (!secret || !id || !timestamp || !header) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    fromBase64(secret.replace(/^whsec_/, "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)),
  );
  const expected = btoa(String.fromCharCode(...mac));
  return header
    .split(" ")
    .map((part) => part.split(",")[1] ?? "")
    .some((sig) => sig.length === expected.length && sig === expected);
}

type ResendEvent = { type?: string; created_at?: string; data?: { email_id?: string } };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const body = await req.text();
  const ok = await validSignature(
    SECRET,
    req.headers.get("svix-id") ?? "",
    req.headers.get("svix-timestamp") ?? "",
    body,
    req.headers.get("svix-signature") ?? "",
  );
  if (!ok) return new Response(null, { status: 401 });

  let ev: ResendEvent;
  try {
    ev = JSON.parse(body) as ResendEvent;
  } catch {
    return new Response(null, { status: 400 });
  }
  const emailId = ev.data?.email_id;
  if (!emailId) return Response.json({ ok: true, ignored: true });
  const { data: n } = await admin
    .from("notifications")
    .select("id, document_id, organization_id, participant_id, kind, delivered_at, opened_at")
    .eq("provider_message_id", emailId)
    .eq("channel", "email")
    .maybeSingle();
  // E-mail que não é convite/lembrete de documento (ex.: outro envio): só confirma o recebimento.
  if (!n) return Response.json({ ok: true, ignored: true });
  const when = ev.created_at ?? new Date().toISOString();
  const { data: p } = await admin
    .from("document_participants")
    .select("name")
    .eq("id", n.participant_id)
    .maybeSingle();
  const event = (type: string) =>
    admin.from("document_events").insert({
      document_id: n.document_id,
      organization_id: n.organization_id,
      type,
      actor_name: p?.name ?? null,
      source: "mdsign",
      data: { channel: "email", kind: n.kind, notification: n.id },
      occurred_at: when,
    });

  if (ev.type === "email.delivered" && !n.delivered_at) {
    const { data: changed } = await admin
      .from("notifications")
      .update({ status: "delivered", delivered_at: when })
      .eq("id", n.id)
      .is("delivered_at", null)
      .select("id");
    if (changed?.length) await event("notification.delivered");
  } else if ((ev.type === "email.opened" || ev.type === "email.clicked") && !n.opened_at) {
    const { data: changed } = await admin
      .from("notifications")
      .update({ opened_at: when })
      .eq("id", n.id)
      .is("opened_at", null)
      .select("id");
    if (changed?.length) await event("participant.email_opened");
  } else if (ev.type === "email.bounced" || ev.type === "email.complained") {
    await admin
      .from("notifications")
      .update({ status: "failed", error: ev.type === "email.bounced" ? "bounced" : "complained" })
      .eq("id", n.id);
    await event("notification.failed");
  }
  return Response.json({ ok: true });
});
