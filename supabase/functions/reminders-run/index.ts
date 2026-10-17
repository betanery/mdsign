// Lembretes automáticos (PRD §28): roda de hora em hora (pg_cron). Para cada documento pendente
// com lembretes ligados, lembra quem está com a ação pendente, respeitando primeiro lembrete,
// recorrência e máximo. Para quando a pessoa assina (o status vem do motor).

import { safeEqual } from "../_shared/net.ts";
import { admin } from "../_shared/auth.ts";
import { processBulk } from "../_shared/bulk.ts";
import { runBilling } from "../_shared/billing.ts";
import { enqueueChannels } from "../_shared/notifications.ts";
import { runAccountPurge, runRetention } from "../_shared/retention.ts";
import { syncDocument } from "../_shared/documents.ts";
import { signdoc } from "../_shared/signdoc.ts";

const SECRET = Deno.env.get("CRON_SECRET") ?? "";
const DAY = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (
    req.method !== "POST" ||
    !SECRET ||
    !safeEqual(req.headers.get("x-cron-secret") ?? "", SECRET)
  )
    return new Response(null, { status: 401 });

  const { data: docs } = await admin
    .from("documents")
    .select(
      "id, organization_id, status, engine_document_id, own_email, created_at, reminder_first_days, reminder_every_days, reminder_max, document_participants (id, name, status, engine_flow_action_id, last_reminded_at, reminder_count)",
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
        // E-mail próprio: o lembrete sai do MDSign (o motor não é acionado, para não dobrar).
        if (!doc.own_email) await signdoc.remind(doc.engine_document_id, p.engine_flow_action_id);
        await enqueueChannels(doc.id, [p.id], "reminder");
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
  // Retenção: apaga partes de lotes e PDFs que não são mais necessários.
  let retention = null;
  try {
    retention = { ...(await runRetention()), purgedAccounts: await runAccountPurge() };
  } catch (e) {
    console.error("retention", e);
  }
  // Faturamento: reprocessa eventos do Asaas, suspende após a tolerância, encerra cancelados.
  let billing = null;
  try {
    billing = await runBilling();
  } catch (e) {
    console.error("billing", e);
  }
  // Reconciliação diária (6h UTC): confere no motor os pendentes sem lembrete, que não passam
  // pelo laço acima. Divergências de status são corrigidas pelo próprio syncDocument.
  let reconciled = 0;
  if (new Date().getUTCHours() === 6) {
    const { data: rest } = await admin
      .from("documents")
      .select("id, organization_id, status, engine_document_id")
      .eq("status", "pending")
      .eq("reminders_enabled", false)
      .is("deleted_at", null)
      .limit(300);
    for (const d of rest ?? []) {
      try {
        await syncDocument(d);
        reconciled++;
      } catch {
        // o erro do motor já fica em engine_errors
      }
    }
  }
  // Alertas da plataforma (abre e fecha conforme as condições).
  let alerts = null;
  try {
    // Reservas de consumo presas há mais de 30 min viram "a conferir" antes de abrir alertas.
    await admin.rpc("sweep_document_charges");
    const { data } = await admin.rpc("refresh_platform_alerts");
    alerts = data;
  } catch (e) {
    console.error("alerts", e);
  }
  // Funil: registra gatilhos (inativo, checkout abandonado) para automações futuras. Não envia nada.
  let growth = null;
  try {
    const { data } = await admin.rpc("growth_daily");
    growth = data;
  } catch (e) {
    console.error("growth", e);
  }
  return new Response(
    JSON.stringify({ sent, bulk, retention, billing, growth, reconciled, alerts }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});
