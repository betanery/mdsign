// Processamento do envio em massa (PRD §17–§19): cada linha vira um documento do modelo.
// Chamado pela tela (enquanto aberta) e pelo agendador (reminders-run), em lotes pequenos.

import { admin } from "./auth.ts";
import { createDocument } from "./create.ts";
import { AppError } from "./http.ts";
import {
  cleanExpiration,
  cleanLocale,
  cleanMessage,
  cleanReminders,
  type Reminders,
} from "./options.ts";
import {
  cleanParticipants,
  type AuthLevel,
  type CleanParticipant,
  type ParticipantInput,
} from "./participants.ts";
import {
  cleanValues,
  loadTemplate,
  pdfFilename,
  renderTemplate,
  type Template,
} from "./templates.ts";
import { validateValues } from "./render.ts";

export type BulkRow = ParticipantInput & { values: Record<string, string> };

export type BulkOptions = {
  authLevel: AuthLevel;
  locale: string;
  message: string | null;
  expiresAt: string | null;
  reminders?: Reminders | undefined;
};

export function cleanOptions(
  o: Record<string, unknown> | null | undefined,
  fallbackLocale: string,
): BulkOptions {
  return {
    authLevel: String(o?.["authLevel"] ?? "basic") as AuthLevel,
    locale: cleanLocale(o?.["locale"], fallbackLocale),
    message: cleanMessage(o?.["message"]),
    expiresAt: cleanExpiration(o?.["expiresAt"]),
    reminders: cleanReminders(o?.["reminders"] as Partial<Reminders> | undefined),
  };
}

/** Valida uma linha: participante + campos do modelo. Devolve o participante limpo e os problemas. */
export function checkRow(row: BulkRow, template: Template, authLevel: AuthLevel) {
  const fields: string[] = [];
  let participant: CleanParticipant | null = null;
  try {
    [participant] = cleanParticipants([{ ...row, authLevel }], false) as [CleanParticipant];
  } catch (e) {
    if (e instanceof AppError && Array.isArray(e.details))
      for (const d of e.details as { field: string }[]) fields.push(d.field);
    else throw e;
  }
  const values = cleanValues(row.values);
  for (const key of validateValues(template.fields, values)) fields.push(`values.${key}`);
  return { participant, values, problems: fields };
}

function documentName(template: Template, participant: CleanParticipant) {
  return `${template.name} — ${participant.name}`.slice(0, 200);
}

/** Processa até n linhas pendentes. Devolve o andamento do lote. */
export async function processBulk(jobId: string, n = 5) {
  const { data: job } = await admin
    .from("bulk_jobs")
    .select("id, organization_id, created_by, template_id, status, options")
    .eq("id", jobId)
    .single();
  if (!job) throw new AppError("bulk_not_found", 404);
  if (job.status === "sending" && job.template_id) {
    const { data: creator } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", job.created_by)
      .maybeSingle();
    const template = await loadTemplate(admin, job.template_id, job.organization_id);
    const options = job.options as BulkOptions;
    const { data: items } = await admin.rpc("claim_bulk_items", { job: jobId, n });
    for (const item of (items ?? []) as { id: number; data: BulkRow }[]) {
      let status = "sent";
      let error: string | null = null;
      let documentId: string | null = null;
      try {
        const { participant, values, problems } = checkRow(item.data, template, options.authLevel);
        if (!participant || problems.length) throw new AppError("invalid_row", 422, problems);
        const name = documentName(template, participant);
        const created = await createDocument({
          organizationId: job.organization_id,
          createdBy: job.created_by,
          actorName: creator?.full_name ?? "",
          kind: "send",
          name,
          pdf: await renderTemplate(template, values),
          filename: pdfFilename(name),
          participants: [participant],
          locale: options.locale,
          message: options.message,
          expiresAt: options.expiresAt,
          notify: true,
          reminders: options.reminders,
          origin: "bulk",
          saveContacts: true,
        });
        documentId = created.documentId;
      } catch (e) {
        status = "failed";
        error = e instanceof AppError ? e.code : "internal_error";
        if (!(e instanceof AppError)) console.error("bulk item", item.id, e);
      }
      await admin
        .from("bulk_items")
        .update({ status, error, document_id: documentId, updated_at: new Date().toISOString() })
        .eq("id", item.id);
      // Sem saldo no plano: as demais linhas também falhariam. Encerra com o motivo.
      if (error === "plan_limit_reached") {
        await admin
          .from("bulk_items")
          .update({ status: "failed", error, updated_at: new Date().toISOString() })
          .eq("job_id", jobId)
          .eq("status", "pending");
        break;
      }
    }
    await admin.rpc("refresh_bulk_job", { job: jobId });
  }
  const { data: progress } = await admin
    .from("bulk_jobs")
    .select("id, status, total, sent, failed")
    .eq("id", jobId)
    .single();
  return progress;
}
