// Serviço de notificações do MDSign: um único motor para os canais.
//
//   Evento MDSign (convite, lembrete, reenvio) → notifications (fila) → canal
//     e-mail   → o motor de assinatura (SignDoc) envia o convite/lembrete
//     WhatsApp → o MDSign envia, pelo provedor configurado (BotConversa)
//
// Regras (Bloco E):
// - WhatsApp é só CANAL: a mensagem leva um link do MDSign que abre a cerimônia do motor com a
//   autenticação exigida. Nunca leva chave, token permanente nem conteúdo do documento.
// - Status honesto: "sent" quando o provedor aceitou; "delivered" só com confirmação dele.
// - Ritmo: limite por execução e por dia (política whatsapp_rate), para não bloquear o número.
// - Descadastro por organização ("SAIR"), respeitado antes de cada envio.

import { admin } from "./auth.ts";
import { normalizePhone } from "./participants.ts";

const BOTCONVERSA = "https://backend.botconversa.com.br/api/v1/webhook";
const LINK_DAYS = 7;
const RETRY_MIN = [5, 30, 120];

type Kind = "signature_requested" | "reminder" | "resend";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const siteUrl = () =>
  (Deno.env.get("SITE_URL") ?? allowedOrigins.find((o) => o.startsWith("https://")) ?? "").replace(
    /\/$/,
    "",
  );

export const whatsappConfigured = () => Boolean(Deno.env.get("BOTCONVERSA_API_KEY"));

async function sha256(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Link seguro de assinatura: o código só existe na mensagem; o banco guarda o hash. */
export async function createSignLink(p: {
  organizationId: string;
  documentId: string;
  participantId: string;
}) {
  const raw = crypto.getRandomValues(new Uint8Array(24));
  const token = btoa(String.fromCharCode(...raw))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await admin.from("sign_links").insert({
    organization_id: p.organizationId,
    document_id: p.documentId,
    participant_id: p.participantId,
    token_hash: await sha256(token),
    expires_at: new Date(Date.now() + LINK_DAYS * 86400000).toISOString(),
  });
  return `${siteUrl()}/s/${token}`;
}

export const hashToken = sha256;

/** Enfileira notificações de WhatsApp para os participantes (se o canal estiver ligado). */
export async function enqueueWhatsApp(
  documentId: string,
  participantIds: string[],
  kind: Kind,
  createdBy: string | null = null,
) {
  if (!participantIds.length) return 0;
  const { data: doc } = await admin
    .from("documents")
    .select("id, organization_id, kind, status")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || doc.kind !== "send" || doc.status !== "pending") return 0;
  const { data: settings } = await admin
    .from("notification_settings")
    .select("whatsapp_enabled, whatsapp_on_invite, whatsapp_on_reminder")
    .eq("organization_id", doc.organization_id)
    .maybeSingle();
  if (!settings?.whatsapp_enabled) return 0;
  if (kind === "signature_requested" && !settings.whatsapp_on_invite) return 0;
  if (kind === "reminder" && !settings.whatsapp_on_reminder) return 0;

  const { data: people } = await admin
    .from("document_participants")
    .select("id, phone, status")
    .eq("document_id", documentId)
    .in("id", participantIds);
  const rows = (people ?? [])
    .filter((p) => p.status === "pending" && normalizePhone(p.phone))
    .map((p) => ({
      organization_id: doc.organization_id,
      document_id: documentId,
      participant_id: p.id,
      channel: "whatsapp",
      kind,
      created_by: createdBy,
    }));
  if (rows.length) await admin.from("notifications").insert(rows);
  return rows.length;
}

/** Texto curto e sem conteúdo do documento (LGPD): quem enviou, o que fazer e o link. */
function message(kind: Kind, role: string, firstName: string, org: string, link: string) {
  const action = role === "approver" ? "aprovar" : "assinar";
  const head =
    kind === "signature_requested"
      ? `Olá, ${firstName}! ${org} enviou um documento para você ${action} pelo MDSign.`
      : `Olá, ${firstName}! Lembrete: há um documento de ${org} aguardando você ${action} no MDSign.`;
  return `${head}\n\nAcesse com segurança: ${link}\n\nSe você não reconhece este envio, ignore esta mensagem. Para não receber mais mensagens por aqui, responda SAIR.`;
}

async function sendBotConversa(phone: string, name: string, text: string) {
  const key = Deno.env.get("BOTCONVERSA_API_KEY")!;
  const digits = phone.replace(/\D/g, "");
  const headers = { "API-KEY": key, "Content-Type": "application/json" };
  const find = async () => {
    const r = await fetch(`${BOTCONVERSA}/subscriber/get_by_phone/${digits}/`, { headers });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`lookup_${r.status}`);
    return ((await r.json()) as { id?: number })?.id ?? null;
  };
  let id = await find();
  if (!id) {
    const [first, ...rest] = name.trim().split(/\s+/);
    const created = await fetch(`${BOTCONVERSA}/subscriber/`, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone: digits, first_name: first || name, last_name: rest.join(" ") }),
    });
    if (!created.ok) throw new Error(`create_${created.status}`);
    id = await find();
    if (!id) throw new Error("subscriber_missing");
  }
  const sent = await fetch(`${BOTCONVERSA}/subscriber/${id}/send_message/`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "text", value: text }),
  });
  if (!sent.ok) throw new Error(`send_${sent.status}`);
}

/** Processa a fila (chamado a cada minuto pelo agendador). */
export async function processNotifications(limit = 30) {
  const out = { sent: 0, failed: 0, skipped: 0, blocked: 0 };
  const { data: queue } = await admin
    .from("notifications")
    .select(
      "id, organization_id, document_id, participant_id, channel, kind, attempts, document_participants (id, name, phone, role, status), documents (status, organizations (name))",
    )
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at")
    .limit(limit);
  if (!queue?.length) return out;

  const { data: rate } = await admin
    .from("policies")
    .select("config, active")
    .eq("id", "whatsapp_rate")
    .maybeSingle();
  const cfg = (rate?.active ? rate.config : {}) as { per_run?: number; per_day?: number };
  const perRun = cfg.per_run ?? 15;
  const perDay = cfg.per_day ?? 150;
  const today = new Date(new Date().toISOString().slice(0, 10)).toISOString();
  const sentToday = new Map<string, number>();
  let thisRun = 0;

  for (const n of queue as unknown as {
    id: string;
    organization_id: string;
    document_id: string;
    participant_id: string;
    kind: Kind;
    attempts: number;
    document_participants: {
      id: string;
      name: string;
      phone: string | null;
      role: string;
      status: string;
    } | null;
    documents: { status: string; organizations: { name: string } | null } | null;
  }[]) {
    const finish = async (status: string, error: string | null = null) => {
      await admin
        .from("notifications")
        .update({
          status,
          error,
          provider: status === "sent" || status === "failed" ? "botconversa" : null,
          ...(status === "sent" ? { sent_at: new Date().toISOString() } : {}),
        })
        .eq("id", n.id);
      if (status === "sent") out.sent++;
      else if (status === "failed") out.failed++;
      else if (status === "blocked") out.blocked++;
      else out.skipped++;
    };
    const p = n.document_participants;
    const phone = normalizePhone(p?.phone);
    // Já assinou, documento encerrado ou sem telefone válido: não envia.
    if (!p || p.status !== "pending" || n.documents?.status !== "pending") {
      await finish("skipped", "not_pending");
      continue;
    }
    if (!phone) {
      await finish("skipped", "invalid_phone");
      continue;
    }
    if (!whatsappConfigured()) {
      await finish("skipped", "provider_not_configured");
      continue;
    }
    const { data: optOut } = await admin
      .from("whatsapp_opt_outs")
      .select("phone")
      .eq("organization_id", n.organization_id)
      .eq("phone", phone)
      .maybeSingle();
    if (optOut) {
      await finish("blocked", "opted_out");
      continue;
    }
    if (!sentToday.has(n.organization_id)) {
      const { count } = await admin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", n.organization_id)
        .eq("channel", "whatsapp")
        .eq("status", "sent")
        .gte("sent_at", today);
      sentToday.set(n.organization_id, count ?? 0);
    }
    // Ritmo: deixa para a próxima rodada (sem gastar tentativa).
    if (thisRun >= perRun || (sentToday.get(n.organization_id) ?? 0) >= perDay) continue;

    try {
      const link = await createSignLink({
        organizationId: n.organization_id,
        documentId: n.document_id,
        participantId: p.id,
      });
      const first = p.name.trim().split(/\s+/)[0] ?? p.name;
      await sendBotConversa(
        phone,
        p.name,
        message(n.kind, p.role, first, n.documents?.organizations?.name ?? "Uma empresa", link),
      );
      await finish("sent");
      thisRun++;
      sentToday.set(n.organization_id, (sentToday.get(n.organization_id) ?? 0) + 1);
      await admin.from("document_events").insert({
        document_id: n.document_id,
        organization_id: n.organization_id,
        type: "notification.sent",
        actor_name: p.name,
        source: "mdsign",
        data: { channel: "whatsapp", kind: n.kind, notification: n.id },
      });
    } catch (e) {
      const attempts = n.attempts + 1;
      const retry = RETRY_MIN[attempts - 1];
      if (retry)
        await admin
          .from("notifications")
          .update({
            attempts,
            error: String(e).slice(0, 200),
            scheduled_at: new Date(Date.now() + retry * 60000).toISOString(),
          })
          .eq("id", n.id);
      else await finish("failed", String(e).slice(0, 200));
    }
  }
  return out;
}

/** Descadastro ("SAIR"): vale para as organizações que já notificaram este número. */
export async function optOut(phoneRaw: string, reason: string) {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return 0;
  const { data: parts } = await admin
    .from("document_participants")
    .select("organization_id")
    .eq("phone", phone)
    .limit(500);
  const orgs = [...new Set((parts ?? []).map((p) => p.organization_id as string))];
  if (orgs.length)
    await admin.from("whatsapp_opt_outs").upsert(
      orgs.map((o) => ({ organization_id: o, phone, reason: reason.slice(0, 200) })),
      {
        onConflict: "organization_id,phone",
        ignoreDuplicates: true,
      },
    );
  return orgs.length;
}
