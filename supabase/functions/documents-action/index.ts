// Ações sobre um documento do MDSign (PRD §26): assinar (embedUrl), atualizar status, baixar,
// cancelar e lembrar. Cada ação confere a permissão de quem chama.

import { admin, requireUser, type Caller } from "../_shared/auth.ts";
import { syncDocument } from "../_shared/documents.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import {
  enqueueChannels,
  enqueueWhatsApp,
  recentWhatsApp,
  processNotifications,
  whatsappConfigured,
} from "../_shared/notifications.ts";
import { signdoc } from "../_shared/signdoc.ts";

type Body = {
  documentId?: string;
  action?:
    | "sign-url"
    | "sync"
    | "download"
    | "attachment"
    | "cancel"
    | "remind"
    | "refuse"
    | "delete"
    | "whatsapp";
  participantId?: string;
  attachmentId?: string;
  reason?: string;
  /** Recusa: devolver para correção (padrão) ou rejeitar definitivamente. */
  kind?: "return" | "reject";
  version?: "signed" | "original" | "printable";
};

type Doc = {
  id: string;
  organization_id: string;
  created_by: string | null;
  status: string;
  engine_document_id: string;
  /** E-mail próprio: o MDSign manda convites e lembretes (o motor não). */
  own_email: boolean;
};

async function loadVisible(caller: Caller, documentId: string): Promise<Doc> {
  // Leitura com a identidade do usuário: se o RLS não deixa ver, não existe para ele.
  const { data } = await caller.asUser
    .from("documents")
    .select("id, organization_id, created_by, status, engine_document_id, own_email")
    .eq("id", documentId)
    .maybeSingle();
  if (!data) throw new AppError("document_not_found", 404);
  return data as Doc;
}

async function canManage(caller: Caller, doc: Doc) {
  if (doc.created_by === caller.user.id) return true;
  const { data } = await caller.asUser.rpc("has_org_permission", {
    org: doc.organization_id,
    perm: "documents.manage",
  });
  return Boolean(data);
}

/**
 * "Abriu o documento para assinar/aprovar" na linha do tempo: uma vez por pessoa em cada versão
 * (a pessoa reabrir não repete o registro). Falha aqui nunca impede a assinatura.
 */
async function recordViewed(doc: Doc, participantId: string, caller: Caller) {
  try {
    const { data: version } = await admin
      .from("document_versions")
      .select("number, created_at")
      .eq("document_id", doc.id)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { count } = await admin
      .from("document_events")
      .select("id", { count: "exact", head: true })
      .eq("document_id", doc.id)
      .eq("type", "participant.viewed")
      .eq("data->>participant", participantId)
      .gte("occurred_at", version?.created_at ?? "1970-01-01");
    if (count) return;
    const { data: p } = await admin
      .from("document_participants")
      .select("name")
      .eq("id", participantId)
      .maybeSingle();
    await admin.from("document_events").insert({
      document_id: doc.id,
      organization_id: doc.organization_id,
      type: "participant.viewed",
      actor_name: p?.name ?? caller.profile.full_name ?? null,
      source: "mdsign",
      data: { participant: participantId, version: version?.number ?? 1 },
    });
  } catch (e) {
    console.error("viewed", e);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    const caller = await requireUser(req);
    const body = (await req.json()) as Body;
    if (!body.documentId || !body.action) throw new AppError("invalid_request");
    const doc = await loadVisible(caller, body.documentId);

    switch (body.action) {
      case "sign-url": {
        if (doc.status !== "pending") throw new AppError("document_not_pending", 409);
        const { data: rows } = await admin
          .from("document_participants")
          .select("id, user_id, email, cpf, status, step, engine_flow_action_id")
          .eq("document_id", doc.id)
          .in("status", ["pending", "created"])
          .order("step");
        const email = caller.user.email?.toLowerCase();
        const me = (rows ?? []).find(
          (p) => p.user_id === caller.user.id || (email && p.email.toLowerCase() === email),
        );
        if (!me) throw new AppError("nothing_to_sign", 409);
        const action = await signdoc.actionUrl(doc.engine_document_id, {
          emailAddress: me.email,
          ...(me.cpf ? { identifier: me.cpf } : {}),
          ...(me.engine_flow_action_id ? { flowActionId: me.engine_flow_action_id } : {}),
        });
        await recordViewed(doc, me.id, caller);
        return json({ embedUrl: action.embedUrl }, 200, origin);
      }

      case "sync": {
        const { status } = await syncDocument(doc);
        return json({ status }, 200, origin);
      }

      case "download": {
        // Cedro: cada documento fica disponível por 6 meses a partir da criação (nada é apagado).
        const { data: until } = await admin.rpc("document_available_until", { doc: doc.id });
        if (until && new Date(until as string).getTime() < Date.now())
          throw new AppError("cedro_document_expired", 403, { until });
        const type =
          body.version === "original"
            ? "Original"
            : body.version === "printable"
              ? "PrinterFriendlyVersion"
              : doc.status === "concluded"
                ? "Signatures"
                : "Original";
        const ticket = await signdoc.ticket(doc.engine_document_id, type);
        const url = ticket.location.startsWith("http")
          ? ticket.location
          : `${signdoc.baseUrl}${ticket.location}`;
        return json({ url }, 200, origin);
      }

      // Anexo: link de download curto, só para quem vê o documento (RLS do anexo).
      case "attachment": {
        const { data: a } = await caller.asUser
          .from("document_attachments")
          .select("name, storage_path")
          .eq("id", body.attachmentId ?? "")
          .eq("document_id", doc.id)
          .maybeSingle();
        if (!a) throw new AppError("attachment_not_found", 404);
        const { data: signed, error } = await admin.storage
          .from("attachments")
          .createSignedUrl(a.storage_path as string, 60, { download: a.name as string });
        if (error || !signed) throw new AppError("internal_error", 500);
        return json({ url: signed.signedUrl }, 200, origin);
      }

      case "cancel": {
        if (!(await canManage(caller, doc))) throw new AppError("forbidden", 403);
        if (doc.status !== "pending") throw new AppError("document_not_pending", 409);
        const reason =
          (body.reason ?? "").trim().slice(0, 500) || "Cancelado pelo remetente no MDSign.";
        await signdoc.cancel(doc.engine_document_id, reason);
        await syncDocument(doc);
        await admin.rpc("write_audit_as", {
          org: doc.organization_id,
          actor: caller.user.id,
          act: "document.canceled",
          ent: "document",
          ent_id: doc.id,
          payload: { reason },
        });
        return json({ status: "canceled" }, 200, origin);
      }

      // Recusa por quem está com a vez (página do documento ou ações em lote). Dois tipos:
      // "return" = devolver para correção (quem enviou sobe uma nova versão e o fluxo recomeça);
      // "reject" = rejeitar definitivamente (o processo termina e não aceita nova versão).
      // O motor registra a recusa pelo aplicativo do MDSign; por isso o motivo leva o nome de
      // quem recusou, e a linha do tempo/auditoria do MDSign registram a pessoa e a versão.
      case "refuse": {
        if (doc.status !== "pending") throw new AppError("document_not_pending", 409);
        const kind = body.kind === "reject" ? "reject" : "return";
        const reason = (body.reason ?? "").trim();
        if (reason.length < 3 || reason.length > 400)
          throw new AppError("refusal_reason_required", 422);
        const { data: rows } = await admin
          .from("document_participants")
          .select("id, user_id, name, email, status, role, step")
          .eq("document_id", doc.id)
          .eq("status", "pending");
        const email = caller.user.email?.toLowerCase();
        const me = (rows ?? []).find(
          (p) => p.user_id === caller.user.id || (email && p.email.toLowerCase() === email),
        );
        if (!me) throw new AppError("nothing_to_refuse", 409);
        // Trava contra decisões simultâneas: só a primeira recusa marca o documento.
        const { data: locked } = await admin
          .from("documents")
          .update({ refusal_kind: kind })
          .eq("id", doc.id)
          .eq("status", "pending")
          .is("refusal_kind", null)
          .select("id");
        if (!locked?.length) throw new AppError("document_not_pending", 409);
        const { data: version } = await admin
          .from("document_versions")
          .select("number")
          .eq("document_id", doc.id)
          .order("number", { ascending: false })
          .limit(1)
          .maybeSingle();
        const label = kind === "reject" ? "Rejeitado definitivamente" : "Devolvido para correção";
        try {
          await signdoc.refuse(
            doc.engine_document_id,
            `${label} por ${me.name} pelo MDSign: ${reason}`.slice(0, 500),
          );
        } catch (e) {
          await admin.from("documents").update({ refusal_kind: null }).eq("id", doc.id);
          throw e;
        }
        await admin.from("document_participants").update({ status: "refused" }).eq("id", me.id);
        await admin.from("document_events").insert({
          document_id: doc.id,
          organization_id: doc.organization_id,
          type: kind === "reject" ? "participant.rejected" : "participant.returned",
          actor_name: me.name,
          source: "mdsign",
          data: { reason, version: version?.number ?? 1, step: me.step, role: me.role },
        });
        await syncDocument(doc).catch(() => undefined);
        await admin.rpc("write_audit_as", {
          org: doc.organization_id,
          actor: caller.user.id,
          act: kind === "reject" ? "document.rejected" : "document.returned",
          ent: "document",
          ent_id: doc.id,
          payload: { reason, version: version?.number ?? 1 },
        });
        return json({ status: "refused", kind }, 200, origin);
      }

      // Exclusão lógica: some das listas, mas fica guardado (prova no motor, auditoria aqui).
      // Concluídos não são excluídos; pendentes precisam ser cancelados antes.
      case "delete": {
        if (!(await canManage(caller, doc))) throw new AppError("forbidden", 403);
        if (doc.status === "concluded") throw new AppError("document_delete_concluded", 409);
        if (doc.status === "pending") throw new AppError("document_delete_pending", 409);
        await admin
          .from("documents")
          .update({ deleted_at: new Date().toISOString(), deleted_by: caller.user.id })
          .eq("id", doc.id)
          .is("deleted_at", null);
        await admin.rpc("write_audit_as", {
          org: doc.organization_id,
          actor: caller.user.id,
          act: "document.deleted",
          ent: "document",
          ent_id: doc.id,
          payload: { status: doc.status },
        });
        return json({ ok: true }, 200, origin);
      }

      // Reenvio só por WhatsApp (link seguro), para quem gerencia o documento.
      case "whatsapp": {
        if (!(await canManage(caller, doc))) throw new AppError("forbidden", 403);
        if (!whatsappConfigured()) throw new AppError("whatsapp_not_configured", 503);
        // Mensagem na fila ou enviada há instantes: não manda outra igual.
        if ((await recentWhatsApp([body.participantId ?? ""])).size)
          throw new AppError("whatsapp_recent", 409);
        const n = await enqueueWhatsApp(
          doc.id,
          [body.participantId ?? ""],
          "resend",
          caller.user.id,
        );
        if (!n) throw new AppError("whatsapp_unavailable", 409);
        await processNotifications(5).catch(() => undefined);
        return json({ ok: true }, 200, origin);
      }

      case "remind": {
        if (!(await canManage(caller, doc))) throw new AppError("forbidden", 403);
        const { data: p } = await admin
          .from("document_participants")
          .select("id, name, status, engine_flow_action_id, reminder_count")
          .eq("document_id", doc.id)
          .eq("id", body.participantId ?? "")
          .maybeSingle();
        if (!p?.engine_flow_action_id || p.status !== "pending")
          throw new AppError("nothing_to_remind", 409);
        // E-mail próprio: o lembrete sai do MDSign (o motor não é acionado, para não dobrar).
        if (!doc.own_email) await signdoc.remind(doc.engine_document_id, p.engine_flow_action_id);
        await enqueueChannels(doc.id, [p.id], "reminder", caller.user.id);
        await processNotifications(5).catch(() => undefined);
        // Lembrete manual também conta (o resumo mostra quantos e quando foi o último).
        await admin
          .from("document_participants")
          .update({
            reminder_count: (p.reminder_count ?? 0) + 1,
            last_reminded_at: new Date().toISOString(),
          })
          .eq("id", p.id);
        await admin.from("document_events").insert({
          document_id: doc.id,
          organization_id: doc.organization_id,
          type: "participant.reminded",
          actor_name: p.name,
          source: "mdsign",
        });
        return json({ ok: true }, 200, origin);
      }
    }
    throw new AppError("invalid_action");
  } catch (error) {
    return handleError(error, origin);
  }
});
