// Webhooks do motor (SignDoc): processamento e reprocessamento com espera crescente.
// O payload é só um aviso; o estado verdadeiro vem da API (syncDocument).

import { admin } from "./auth.ts";
import { syncDocument } from "./documents.ts";

const BACKOFF_MIN = [1, 5, 30, 120, 720];
export const MAX_ATTEMPTS = BACKOFF_MIN.length;

type EventRow = { id: number; type: string; payload: Record<string, unknown>; attempts: number };

function eventIds(payload: Record<string, unknown>) {
  const data = (payload["data"] ?? {}) as { id?: string; documents?: { id?: string }[] };
  return data.id
    ? [String(data.id)]
    : (data.documents ?? []).map((d) => String(d.id ?? "")).filter(Boolean);
}

/** Processa um evento; em erro, agenda a próxima tentativa (até 5). */
export async function processEngineEvent(row: EventRow) {
  try {
    if (row.type !== "DocumentsDeleted" && row.type !== "DocumentDeleted") {
      for (const engineId of eventIds(row.payload)) {
        const { data: doc } = await admin
          .from("documents")
          .select("id, organization_id, status, engine_document_id")
          .eq("engine_document_id", engineId)
          .maybeSingle();
        // Documento de fora do MDSign (ex.: criado no painel): só registra.
        if (doc) await syncDocument(doc);
      }
    }
    await admin
      .from("engine_webhook_events")
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq("id", row.id);
    return true;
  } catch (e) {
    const attempts = row.attempts + 1;
    const wait = BACKOFF_MIN[Math.min(attempts, BACKOFF_MIN.length) - 1]!;
    console.error("engine event", row.type, attempts, String(e).slice(0, 200));
    await admin
      .from("engine_webhook_events")
      .update({
        attempts,
        error: String(e).slice(0, 500),
        next_attempt_at: new Date(Date.now() + wait * 60_000).toISOString(),
      })
      .eq("id", row.id);
    return false;
  }
}

/** Reprocessa eventos pendentes (chamado pela rotina de minuto). */
export async function processPendingEngineEvents(limit = 20) {
  const now = new Date();
  const { data } = await admin
    .from("engine_webhook_events")
    .select("id, type, payload, attempts, next_attempt_at, received_at")
    .is("processed_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .order("received_at")
    .limit(limit * 3);
  let ok = 0;
  let failed = 0;
  // Evento recém-chegado ainda está sendo processado pelo próprio webhook: espera 1 minuto.
  const due = (data ?? [])
    .filter((r) =>
      r.next_attempt_at
        ? new Date(r.next_attempt_at) <= now
        : new Date(r.received_at).getTime() < now.getTime() - 60_000,
    )
    .slice(0, limit);
  for (const row of due) {
    if (await processEngineEvent(row as EventRow)) ok++;
    else failed++;
  }
  return { reprocessed: ok, failed };
}
