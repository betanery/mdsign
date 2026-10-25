// Sincroniza um documento do MDSign com o motor e registra a timeline (só eventos confirmados).

import { admin } from "./auth.ts";
import { AppError } from "./http.ts";
import { mapDocumentStatus, signdoc, type EngineDocument } from "./signdoc.ts";
import { enqueueChannels } from "./notifications.ts";
import { deliverDue } from "./webhooks.ts";

type DocRow = { id: string; organization_id: string; status: string; engine_document_id: string };
type ParticipantRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  engine_flow_action_id: string | null;
};

const participantStatus = (s: string) =>
  s === "Completed"
    ? "completed"
    : s === "Refused"
      ? "refused"
      : s === "Created"
        ? "created"
        : "pending";

/** O motor responde 422 "DocumentIsDeleted" quando o documento foi excluído no painel dele. */
export function isDeletedInEngine(e: unknown) {
  if (!(e instanceof AppError)) return false;
  const details = e.details as { code?: string | null } | undefined;
  return details?.code === "DocumentIsDeleted";
}

/**
 * Documento excluído direto no painel do motor: um pendente vira "cancelado" no MDSign (com
 * registro na timeline) e para de ser consultado. Concluídos não mudam (o PDF assinado vale).
 */
async function markDeletedInEngine(doc: DocRow) {
  if (doc.status !== "pending") return doc.status;
  const { data: changed } = await admin
    .from("documents")
    .update({ status: "canceled" })
    .eq("id", doc.id)
    .eq("status", "pending")
    .select("id");
  if (changed?.length) {
    await admin.from("document_events").insert({
      document_id: doc.id,
      organization_id: doc.organization_id,
      source: "engine",
      type: "document.canceled",
      data: { reason: "deleted_in_engine" },
    });
    await deliverDue(20, doc.organization_id).catch(() => undefined);
  }
  return "canceled";
}

/** Busca o estado atual no motor (fonte da verdade) e aplica as mudanças. */
export async function syncDocument(doc: DocRow, engine?: EngineDocument) {
  let current: EngineDocument;
  try {
    current = engine ?? (await signdoc.getDocument(doc.engine_document_id));
  } catch (e) {
    if (!isDeletedInEngine(e)) throw e;
    return { status: await markDeletedInEngine(doc), engine: null };
  }
  const { data: participants } = await admin
    .from("document_participants")
    .select("id, name, email, status, engine_flow_action_id")
    .eq("document_id", doc.id);

  const events: {
    type: string;
    actor_name?: string;
    data?: Record<string, unknown>;
    occurred_at?: string;
  }[] = [];

  const nowPending: string[] = [];
  for (const action of current.flowActions ?? []) {
    const rows = ((participants as ParticipantRow[] | null) ?? []).filter(
      (p) => p.engine_flow_action_id === action.id,
    );
    if (!rows.length) continue;
    const isRule = action.type === "SignRule" || action.type === "ApproverRule";
    const approve = action.type === "Approver" || action.type === "ApproverRule";
    const members = action.ruleUsers ?? action.signRuleUsers ?? [];

    for (const row of rows) {
      let next: string;
      let when: string | undefined;
      let reason: string | null = null;
      if (isRule) {
        // Quórum: a situação de cada pessoa vem da lista da regra; quem não precisou agir
        // quando a regra se cumpriu fica "não precisou assinar".
        const m = members.find((u) => (u.email ?? "").toLowerCase() === row.email);
        const done = m?.completeActionDate ?? m?.signatureDate ?? null;
        if (done) {
          next = "completed";
          when = done;
        } else if (m?.hasRefused) {
          next = "refused";
          when = m.refusalDate ?? undefined;
          reason = m.refusalReason ?? null;
        } else if (action.status === "Completed") next = "skipped";
        else next = participantStatus(action.status === "Refused" ? "Pending" : action.status);
      } else {
        // O SignDoc identifica a pessoa pelo CPF e pode usar o e-mail do cadastro que já existe
        // nele: o MDSign mostra sempre o endereço que o motor está usando de fato.
        const engineEmail = (action.user?.email ?? "").toLowerCase();
        if (engineEmail && engineEmail !== row.email) {
          const { data: userId } = await admin.rpc("user_id_by_email", { target: engineEmail });
          await admin
            .from("document_participants")
            .update({ email: engineEmail, user_id: (userId as string | null) ?? null })
            .eq("id", row.id);
        }
        next = participantStatus(action.status);
        when = action.updateDate ?? undefined;
        reason = action.refusalReason ?? null;
      }
      if (next === row.status) continue;
      // Recusa feita pelo MDSign (devolver/rejeitar): o motor recusa o documento, mas a ação da
      // pessoa continua "Created" nele. Enquanto o documento estiver recusado, vale o MDSign.
      if (row.status === "refused" && mapDocumentStatus(current.status) === "refused") continue;
      // Atualiza só se ainda não estiver nesse status: com o aviso do SignDoc e uma ação do
      // MDSign chegando juntos, o evento (e o webhook do cliente) é registrado uma única vez.
      const { data: changed } = await admin
        .from("document_participants")
        .update({
          status: next,
          completed_at: next === "completed" ? (when ?? new Date().toISOString()) : null,
        })
        .eq("id", row.id)
        .neq("status", next)
        .select("id");
      if (!changed?.length) continue;
      if (next === "pending") nowPending.push(row.id);
      if (next === "completed")
        events.push({
          type: approve ? "participant.approved" : "participant.signed",
          actor_name: row.name,
          occurred_at: when,
        });
      if (next === "refused")
        events.push({
          type: "participant.refused",
          actor_name: row.name,
          data: { reason },
          occurred_at: when,
        });
    }
  }

  // Código de validação: guardado uma vez (mostrado em "Como validar este documento").
  if (current.key)
    await admin
      .from("documents")
      .update({ verification_key: current.key.slice(0, 80) })
      .eq("id", doc.id)
      .is("verification_key", null);

  const status = mapDocumentStatus(current.status);
  if (status !== doc.status) {
    const { data: changed } = await admin
      .from("documents")
      .update({
        status,
        concluded_at: status === "concluded" ? current.updateDate : null,
        expires_at: current.expirationDate ?? null,
      })
      .eq("id", doc.id)
      .neq("status", status)
      .select("id");
    if (changed?.length && status !== "pending")
      events.push({ type: `document.${status}`, occurred_at: current.updateDate });
  }

  if (events.length)
    await admin.from("document_events").insert(
      events.map((e) => ({
        document_id: doc.id,
        organization_id: doc.organization_id,
        source: "engine",
        type: e.type,
        actor_name: e.actor_name ?? null,
        data: e.data ?? {},
        ...(e.occurred_at ? { occurred_at: e.occurred_at } : {}),
      })),
    );
  if (events.length) await deliverDue(20, doc.organization_id).catch(() => undefined);
  // Chegou a vez de alguém (fluxo em ordem): convite pelos canais do MDSign (e-mail próprio,
  // WhatsApp), se o documento/organização usar.
  if (nowPending.length && status === "pending")
    await enqueueChannels(doc.id, nowPending, "signature_requested");
  return { status, engine: current };
}
