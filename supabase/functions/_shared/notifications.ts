// Serviço de notificações do MDSign: um único motor para os canais.
//
//   Evento MDSign (convite, lembrete, reenvio) → notifications (fila) → canal
//     e-mail   → o motor (SignDoc) envia; ou o MDSign, pelo Resend, quando a organização ligou o
//                e-mail próprio (documents.own_email: aí o motor não manda o convite)
//     WhatsApp → o MDSign envia, pelo provedor configurado (BotConversa)
//
// Regras (Bloco E):
// - WhatsApp é só CANAL: a mensagem leva um link do MDSign que abre a cerimônia do motor com a
//   autenticação exigida. Nunca leva chave, token permanente nem conteúdo do documento.
// - Status honesto: "sent" quando o provedor aceitou; "delivered" só com confirmação dele.
// - Ritmo: limite por execução e por dia (política whatsapp_rate), para não bloquear o número.
// - Descadastro por organização ("SAIR"), respeitado antes de cada envio.

import { admin } from "./auth.ts";
import { emailConfigured, emailTestMode, sendEmail, signatureEmail } from "./email.ts";
import { fetchWithTimeout } from "./net.ts";
import { brPhoneVariants, normalizePhone } from "./participants.ts";

const BOTCONVERSA = "https://backend.botconversa.com.br/api/v1/webhook";
const LINK_DAYS = 7;
const RETRY_MIN = [5, 30, 120];

type Kind = "signature_requested" | "reminder" | "resend";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
export const siteUrl = () =>
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

/** Janela em que uma nova mensagem de WhatsApp para a mesma pessoa seria repetida. */
export const WHATSAPP_REPEAT_MINUTES = 5;

/** Participantes que já têm WhatsApp na fila ou enviado há pouco (evita mensagem em dobro). */
export async function recentWhatsApp(
  participantIds: string[],
  now = new Date(),
  db: Pick<typeof admin, "from"> = admin,
) {
  if (!participantIds.length) return new Set<string>();
  const since = new Date(now.getTime() - WHATSAPP_REPEAT_MINUTES * 60_000).toISOString();
  const { data } = await db
    .from("notifications")
    .select("participant_id")
    .eq("channel", "whatsapp")
    .in("participant_id", participantIds)
    .in("status", ["pending", "sent", "delivered"])
    .gte("created_at", since);
  return new Set((data ?? []).map((r) => r.participant_id as string));
}

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
  // WhatsApp é funcionalidade do plano: fora do plano (ou ainda não liberada), não enfileira.
  const { data: allowed } = await admin.rpc("feature_enabled", {
    org: doc.organization_id,
    code: "whatsapp",
  });
  if (!allowed) return 0;
  if (kind === "signature_requested" && !settings.whatsapp_on_invite) return 0;
  if (kind === "reminder" && !settings.whatsapp_on_reminder) return 0;

  const { data: people } = await admin
    .from("document_participants")
    .select("id, phone, status")
    .eq("document_id", documentId)
    .in("id", participantIds);
  const recent = await recentWhatsApp((people ?? []).map((p) => p.id as string));
  const rows = (people ?? [])
    .filter((p) => p.status === "pending" && normalizePhone(p.phone) && !recent.has(p.id))
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

/**
 * E-mail próprio vale para este documento? Organização ligou e o Resend está configurado. Em
 * modo de teste (remetente @resend.dev) só para documentos de Super Admin.
 */
export async function ownEmailFor(organizationId: string, createdBy: string | null) {
  if (!emailConfigured()) return false;
  const { data: settings } = await admin
    .from("notification_settings")
    .select("email_enabled")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!settings?.email_enabled) return false;
  if (!emailTestMode()) return true;
  if (!createdBy) return false;
  const { data: pa } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", createdBy)
    .maybeSingle();
  return Boolean(pa);
}

/** Enfileira e-mails do MDSign (só em documentos criados com o e-mail próprio). */
export async function enqueueEmail(
  documentId: string,
  participantIds: string[],
  kind: Kind,
  createdBy: string | null = null,
) {
  if (!participantIds.length) return 0;
  const { data: doc } = await admin
    .from("documents")
    .select("id, organization_id, kind, status, own_email")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc?.own_email || doc.kind !== "send" || doc.status !== "pending") return 0;
  const { data: people } = await admin
    .from("document_participants")
    .select("id, email, status")
    .eq("document_id", documentId)
    .in("id", participantIds);
  const rows = (people ?? [])
    .filter((p) => p.status === "pending" && p.email)
    .map((p) => ({
      organization_id: doc.organization_id,
      document_id: documentId,
      participant_id: p.id,
      channel: "email",
      kind,
      created_by: createdBy,
    }));
  if (rows.length) await admin.from("notifications").insert(rows);
  return rows.length;
}

/** Convite/lembrete nos canais do MDSign: e-mail próprio (se o documento usa) e WhatsApp. */
export async function enqueueChannels(
  documentId: string,
  participantIds: string[],
  kind: Kind,
  createdBy: string | null = null,
) {
  const [email, whatsapp] = await Promise.all([
    enqueueEmail(documentId, participantIds, kind, createdBy).catch((e) => {
      console.error("enqueue email", e);
      return 0;
    }),
    enqueueWhatsApp(documentId, participantIds, kind, createdBy).catch((e) => {
      console.error("enqueue whatsapp", e);
      return 0;
    }),
  ]);
  return { email, whatsapp };
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

export async function sendBotConversa(phone: string, name: string, text: string) {
  const key = Deno.env.get("BOTCONVERSA_API_KEY")!;
  const digits = phone.replace(/\D/g, "");
  const headers = { "API-KEY": key, "Content-Type": "application/json" };
  const find = async () => {
    const r = await fetchWithTimeout(`${BOTCONVERSA}/subscriber/get_by_phone/${digits}/`, {
      headers,
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`lookup_${r.status}`);
    return ((await r.json()) as { id?: number })?.id ?? null;
  };
  let id = await find();
  if (!id) {
    const [first, ...rest] = name.trim().split(/\s+/);
    const created = await fetchWithTimeout(`${BOTCONVERSA}/subscriber/`, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone: digits, first_name: first || name, last_name: rest.join(" ") }),
    });
    if (!created.ok) throw new Error(`create_${created.status}`);
    id = await find();
    if (!id) throw new Error("subscriber_missing");
  }
  const sent = await fetchWithTimeout(`${BOTCONVERSA}/subscriber/${id}/send_message/`, {
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
      "id, organization_id, document_id, participant_id, channel, kind, attempts, document_participants (id, name, email, phone, role, status), documents (name, status, origin, created_by, message, email_locale, organizations (name))",
    )
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at")
    .limit(limit);
  if (!queue?.length) return out;

  const { data: rates } = await admin
    .from("policies")
    .select("id, config, active")
    .in("id", ["whatsapp_rate", "email_rate"]);
  const rateOf = (id: string) =>
    ((rates ?? []).find((r) => r.id === id && r.active)?.config ?? {}) as {
      per_run?: number;
      per_day?: number;
    };
  const cfg = rateOf("whatsapp_rate");
  const perRun = cfg.per_run ?? 15;
  const perDay = cfg.per_day ?? 150;
  const emailCfg = rateOf("email_rate");
  const emailPerRun = emailCfg.per_run ?? 30;
  const emailPerDay = emailCfg.per_day ?? 90;
  const today = new Date(new Date().toISOString().slice(0, 10)).toISOString();
  const sentToday = new Map<string, number>();
  let thisRun = 0;
  let emailThisRun = 0;
  let emailToday: number | null = null;
  const senderNames = new Map<string, string>();

  for (const n of queue as unknown as {
    id: string;
    organization_id: string;
    document_id: string;
    participant_id: string;
    channel: "whatsapp" | "email";
    kind: Kind;
    attempts: number;
    document_participants: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      role: string;
      status: string;
    } | null;
    documents: {
      name: string;
      status: string;
      origin: string | null;
      created_by: string | null;
      message: string | null;
      email_locale: string;
      organizations: { name: string } | null;
    } | null;
  }[]) {
    const provider = n.channel === "email" ? "resend" : "botconversa";
    const finish = async (
      status: string,
      error: string | null = null,
      messageId?: string | null,
    ) => {
      await admin
        .from("notifications")
        .update({
          status,
          error,
          provider: status === "sent" || status === "failed" ? provider : null,
          ...(messageId ? { provider_message_id: messageId } : {}),
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
    if (n.channel === "email") {
      if (!emailConfigured()) {
        await finish("skipped", "provider_not_configured");
        continue;
      }
      if (emailToday === null) {
        const { count } = await admin
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("channel", "email")
          .eq("status", "sent")
          .gte("sent_at", today);
        emailToday = count ?? 0;
      }
      // Ritmo: deixa para a próxima rodada (sem gastar tentativa).
      if (emailThisRun >= emailPerRun || emailToday >= emailPerDay) continue;
      const d = n.documents!;
      try {
        // Link público e API não têm uma pessoa remetente: o e-mail cita só a organização.
        let sender = "";
        if (d.created_by && !["form", "api"].includes(d.origin ?? "")) {
          if (!senderNames.has(d.created_by)) {
            const { data: prof } = await admin
              .from("profiles")
              .select("full_name")
              .eq("id", d.created_by)
              .maybeSingle();
            senderNames.set(d.created_by, (prof?.full_name as string | null) ?? "");
          }
          sender = senderNames.get(d.created_by) ?? "";
        }
        const link = await createSignLink({
          organizationId: n.organization_id,
          documentId: n.document_id,
          participantId: p.id,
        });
        const mail = signatureEmail({
          kind: n.kind,
          locale: d.email_locale,
          role: p.role,
          name: p.name,
          senderName: sender,
          orgName: d.organizations?.name ?? "MDSign",
          docName: d.name,
          message: n.kind === "reminder" ? null : d.message,
          link,
        });
        const id = await sendEmail({ to: p.email, ...mail, idempotencyKey: n.id });
        await finish("sent", null, id);
        emailThisRun++;
        emailToday++;
        await admin.from("document_events").insert({
          document_id: n.document_id,
          organization_id: n.organization_id,
          type: "notification.sent",
          actor_name: p.name,
          source: "mdsign",
          data: { channel: "email", kind: n.kind, notification: n.id },
        });
      } catch (e) {
        // Recusa definitiva do provedor (403/422: remetente de teste, endereço inválido): tentar
        // de novo não adianta; registra o motivo na hora para aparecer na lista de participantes.
        const permanent = /resend_(403|422)/.test(String(e));
        if (permanent) {
          await finish("failed", emailTestMode() ? "test_sender" : "provider_rejected");
          continue;
        }
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
  const variants = brPhoneVariants(normalizePhone(phoneRaw));
  if (!variants.length) return 0;
  const { data: parts } = await admin
    .from("document_participants")
    .select("organization_id, phone")
    .in("phone", variants)
    .limit(500);
  // Descadastro no formato guardado em cada organização (é o que o envio confere).
  const rows = [
    ...new Map(
      (parts ?? []).map((p) => [
        `${p.organization_id}|${p.phone}`,
        { organization_id: p.organization_id as string, phone: p.phone as string },
      ]),
    ).values(),
  ].map((r) => ({ ...r, reason: reason.slice(0, 200) }));
  if (rows.length)
    await admin.from("whatsapp_opt_outs").upsert(rows, {
      onConflict: "organization_id,phone",
      ignoreDuplicates: true,
    });
  return new Set(rows.map((r) => r.organization_id)).size;
}
