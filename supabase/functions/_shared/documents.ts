// Sincroniza um documento do MDSign com o motor e registra a timeline (só eventos confirmados).

import { admin } from "./auth.ts";
import { mapDocumentStatus, signdoc, type EngineDocument } from "./signdoc.ts";

type DocRow = { id: string; organization_id: string; status: string; engine_document_id: string };
type ParticipantRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  engine_flow_action_id: string | null;
};

const participantStatus = (s: string) =>
  s === "Completed" ? "completed" : s === "Refused" ? "refused" : s === "Created" ? "created" : "pending";

/** Busca o estado atual no motor (fonte da verdade) e aplica as mudanças. */
export async function syncDocument(doc: DocRow, engine?: EngineDocument) {
  const current = engine ?? (await signdoc.getDocument(doc.engine_document_id));
  const { data: participants } = await admin
    .from("document_participants")
    .select("id, name, email, status, engine_flow_action_id")
    .eq("document_id", doc.id);

  const events: { type: string; actor_name?: string; data?: Record<string, unknown>; occurred_at?: string }[] = [];

  for (const action of current.flowActions ?? []) {
    const row = (participants as ParticipantRow[] | null)?.find((p) => p.engine_flow_action_id === action.id);
    if (!row) continue;
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
    const next = participantStatus(action.status);
    if (next === row.status) continue;
    await admin
      .from("document_participants")
      .update({ status: next, completed_at: next === "completed" ? action.updateDate ?? new Date().toISOString() : null })
      .eq("id", row.id);
    if (next === "completed")
      events.push({
        type: action.type === "Approver" ? "participant.approved" : "participant.signed",
        actor_name: row.name,
        occurred_at: action.updateDate ?? undefined,
      });
    if (next === "refused")
      events.push({
        type: "participant.refused",
        actor_name: row.name,
        data: { reason: action.refusalReason ?? null },
        occurred_at: action.updateDate ?? undefined,
      });
  }

  const status = mapDocumentStatus(current.status);
  if (status !== doc.status) {
    await admin
      .from("documents")
      .update({
        status,
        concluded_at: status === "concluded" ? current.updateDate : null,
        expires_at: current.expirationDate ?? null,
      })
      .eq("id", doc.id);
    if (status !== "pending") events.push({ type: `document.${status}`, occurred_at: current.updateDate });
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
  return { status, engine: current };
}
