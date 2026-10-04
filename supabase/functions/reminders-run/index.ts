// Lembretes automáticos (PRD §28): roda de hora em hora (pg_cron). Para cada documento pendente
// com lembretes ligados, lembra quem está com a ação pendente, respeitando primeiro lembrete,
// recorrência e máximo. Para quando a pessoa assina (o status vem do motor).

import { admin } from "../_shared/auth.ts";
import { processBulk } from "../_shared/bulk.ts";
import { syncDocument } from "../_shared/documents.ts";
import { signdoc } from "../_shared/signdoc.ts";

const SECRET = Deno.env.get("CRON_SECRET") ?? "";
const DAY = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method !== "POST" || !SECRET || req.headers.get("x-cron-secret") !== SECRET)
    return new Response(null, { status: 401 });

  const { data: docs } = await admin
    .from("documents")
    .select(
      "id, organization_id, status, engine_document_id, created_at, reminder_first_days, reminder_every_days, reminder_max, document_participants (id, name, status, engine_flow_action_id, last_reminded_at, reminder_count)",
    )
    .eq("status", "pending")
    .eq("reminders_enabled", true)
    .limit(200);

  let sent = 0;
  const now = Date.now();
  for (const doc of docs ?? []) {
    // Confirma o estado atual antes de lembrar (alguém pode ter acabado de assinar).
    try {
      const { status } = await syncDocument(doc);
      if (status !== "pending") continue;
    } catch {
      continue;
    }
    const { data: fresh } = await admin
      .from("document_participants")
      .select("id, name, status, engine_flow_action_id, last_reminded_at, reminder_count")
      .eq("document_id", doc.id)
      .eq("status", "pending");
    for (const p of fresh ?? []) {
      if (!p.engine_flow_action_id || p.reminder_count >= doc.reminder_max) continue;
      const due = p.last_reminded_at
        ? new Date(p.last_reminded_at).getTime() + doc.reminder_every_days * DAY
        : new Date(doc.created_at).getTime() + doc.reminder_first_days * DAY;
      if (now < due) continue;
      try {
        await signdoc.remind(doc.engine_document_id, p.engine_flow_action_id);
        await admin
          .from("document_participants")
          .update({
            last_reminded_at: new Date().toISOString(),
            reminder_count: p.reminder_count + 1,
          })
          .eq("id", p.id);
        await admin.from("document_events").insert({
          document_id: doc.id,
          organization_id: doc.organization_id,
          type: "participant.reminded",
          actor_name: p.name,
          source: "mdsign",
          data: { automatic: true },
        });
        sent++;
      } catch (e) {
        console.error("reminder", doc.id, p.id, e);
      }
    }
  }
  // Lotes de envio em massa que ficaram em andamento (tela fechada): continua de onde parou.
  const { data: jobs } = await admin
    .from("bulk_jobs")
    .select("id")
    .eq("status", "sending")
    .limit(20);
  let bulk = 0;
  for (const job of jobs ?? []) {
    try {
      await processBulk(job.id, 20);
      bulk++;
    } catch (e) {
      console.error("bulk", job.id, e);
    }
  }
  return new Response(JSON.stringify({ sent, bulk }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
