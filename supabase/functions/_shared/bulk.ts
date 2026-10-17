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
  cleanObservers,
  cleanParticipants,
  type AuthLevel,
  type ObserverInput,
  type CleanParticipant,
  type ParticipantInput,
} from "./participants.ts";
import {
  cleanValues,
  fillableFields,
  firstSlot,
  loadTemplate,
  marksFor,
  pdfFilename,
  renderTemplate,
  roleParticipants,
  slotValues,
  type Template,
} from "./templates.ts";
import { loadPdf, type MarkType, type RelBox, type RelMark } from "./pdf.ts";
import { validateValues } from "./render.ts";
import { removeBulkPart } from "./retention.ts";
import { identifierPresent, pdfText, type MatchMethod } from "./verify.ts";

export type BulkRow = ParticipantInput & { values: Record<string, string> };

export type BulkOptions = {
  authLevel: AuthLevel;
  locale: string;
  message: string | null;
  expiresAt: string | null;
  reminders?: Reminders | undefined;
  /** Modelo com papéis: pessoas fixas dos demais papéis (a linha ocupa o 1º papel). */
  rolePeople?: Record<string, ParticipantInput>;
  observers?: ObserverInput[];
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
    observers: cleanObservers(o?.["observers"]),
    rolePeople:
      o?.["rolePeople"] && typeof o["rolePeople"] === "object"
        ? (o["rolePeople"] as Record<string, ParticipantInput>)
        : {},
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
  for (const key of validateValues(fillableFields(template), values)) fields.push(`values.${key}`);
  return { participant, values, problems: fields };
}

function documentName(template: Template, participant: CleanParticipant) {
  return `${template.name} — ${participant.name}`.slice(0, 200);
}

/** Marca de assinatura do lote de PDF: posição relativa na primeira ou na última página. */
export type PdfBulkMark = RelBox & { type: MarkType; pageRef: "first" | "last" };

export type PdfItemData = ParticipantInput & {
  part: string;
  match: {
    method: MatchMethod;
    value: string;
    confidence: "green" | "yellow" | "red";
    confirmed?: boolean;
  };
};

/** Documento de um lote de PDF: baixa a parte, confere a identidade e devolve o que enviar. */
export async function pdfItemDocument(
  job: { organization_id: string; source_folder: string | null; options: unknown },
  data: PdfItemData,
) {
  const options = job.options as BulkOptions & { marks?: PdfBulkMark[]; docName?: string };
  if (!job.source_folder || !data.part?.startsWith(`${job.source_folder}/`))
    throw new AppError("invalid_row", 422);
  const { data: blob, error } = await admin.storage.from("bulk-sources").download(data.part);
  if (error || !blob) throw new AppError("part_missing", 422);
  const pdf = new Uint8Array(await blob.arrayBuffer());
  // Associação automática: o identificador precisa estar no texto desta parte.
  if (!data.match?.confirmed) {
    const ok =
      data.match?.confidence === "green" &&
      identifierPresent(await pdfText(pdf), data.match.method, data.match.value);
    if (!ok) throw new AppError("identity_mismatch", 422);
  }
  const [participant] = cleanParticipants([{ ...data, authLevel: options.authLevel }], false) as [
    CleanParticipant,
  ];
  const pages = (await loadPdf(pdf, 1000)).getPageCount();
  const marks = (options.marks ?? []).map(({ pageRef, ...m }) => ({
    ...m,
    page: pageRef === "last" ? pages : 1,
  }));
  const base = options.docName?.trim() || "Documento";
  return { pdf, participant, marks, name: `${base} — ${participant.name}`.slice(0, 200) };
}

/** Processa até n linhas pendentes. Devolve o andamento do lote. */
export async function processBulk(jobId: string, n = 5) {
  const { data: job } = await admin
    .from("bulk_jobs")
    .select("id, organization_id, created_by, template_id, status, options, source, source_folder")
    .eq("id", jobId)
    .single();
  if (!job) throw new AppError("bulk_not_found", 404);
  if (job.status === "sending" && (job.template_id || job.source === "pdf")) {
    const { data: creator } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", job.created_by)
      .maybeSingle();
    const template =
      job.source === "pdf"
        ? null
        : await loadTemplate(admin, job.template_id!, job.organization_id);
    const options = job.options as BulkOptions;
    const { data: items } = await admin.rpc("claim_bulk_items", { job: jobId, n });
    for (const item of (items ?? []) as { id: number; data: BulkRow & PdfItemData }[]) {
      let status = "sent";
      let error: string | null = null;
      let documentId: string | null = null;
      try {
        let doc: {
          name: string;
          pdf: Uint8Array;
          participants: CleanParticipant[];
          marks?: RelMark[][] | undefined;
        };
        if (!template) {
          const r = await pdfItemDocument(job, item.data);
          doc = { name: r.name, pdf: r.pdf, participants: [r.participant], marks: [r.marks] };
        } else {
          const { participant, values, problems } = checkRow(
            item.data,
            template,
            options.authLevel,
          );
          if (!participant || problems.length) throw new AppError("invalid_row", 422, problems);
          let participants = [participant];
          let pdfValues = values;
          let marks: RelMark[][] | undefined;
          if (template.participants.length) {
            const r = roleParticipants(
              template,
              {
                ...(options.rolePeople ?? {}),
                [String(firstSlot(template))]: { ...item.data, authLevel: options.authLevel },
              },
              template.flow.sequential ?? true,
            );
            participants = r.list;
            pdfValues = slotValues(template, values, r.bySlot);
            marks = marksFor(template, r.slots);
          }
          // Sem marcas no modelo: posição escolhida no lote (primeira ou última página).
          const lotMarks = (options as BulkOptions & { marks?: PdfBulkMark[] }).marks ?? [];
          if (!marks?.some((m) => m.length) && lotMarks.length)
            marks = [
              lotMarks.map(({ pageRef, ...m }) => ({ ...m, page: pageRef === "first" ? 1 : 0 })),
            ];
          doc = {
            name: documentName(template, participant),
            pdf: await renderTemplate(template, pdfValues),
            participants,
            marks,
          };
        }
        const created = await createDocument({
          organizationId: job.organization_id,
          createdBy: job.created_by,
          actorName: creator?.full_name ?? "",
          // Cada linha do lote é um documento: reprocessar a linha não cobra de novo.
          idempotencyKey: `bulk:${job.id}:${item.id}`,
          kind: "send",
          name: doc.name,
          pdf: doc.pdf,
          filename: pdfFilename(doc.name),
          participants: doc.participants,
          marks: doc.marks,
          locale: options.locale,
          message: options.message,
          expiresAt: options.expiresAt,
          notify: true,
          reminders: options.reminders,
          observers: options.observers,
          origin: "bulk",
          templateId: template?.id ?? null,
          saveContacts: true,
        });
        documentId = created.documentId;
        // O documento já está no motor: a parte do PDF (dados pessoais) não é mais necessária.
        if (!template) await removeBulkPart(item.data.part).catch(() => undefined);
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
