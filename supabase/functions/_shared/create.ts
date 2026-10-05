// Criação de documento no motor + registro no MDSign. Usado por Só eu assino, envio,
// modelos, formulários e envio em massa: uma única regra de criação.

import { admin } from "./auth.ts";
import { AppError } from "./http.ts";
import { toFlowAction, type CleanParticipant } from "./participants.ts";
import { loadPdf, pageSizes, toEngineMarks, type RelMark } from "./pdf.ts";
import { signdoc } from "./signdoc.ts";

export type CreateInput = {
  organizationId: string;
  createdBy: string | null;
  actorName: string;
  kind: "self" | "send";
  name: string;
  pdf: Uint8Array;
  filename: string;
  participants: CleanParticipant[];
  locale: string;
  message?: string | null;
  /** AAAA-MM-DD; o motor usa o fim do dia. */
  expiresAt?: string | null;
  /** false = assinatura dentro do MDSign (sem e-mail para o 1º passo). */
  notify: boolean;
  reminders?: { enabled: boolean; firstDays: number; everyDays: number; max: number };
  /** Origem para auditoria/consumo (ex.: "self", "send", "template", "form", "bulk"). */
  origin: string;
  /** Salva os participantes nos contatos da organização. */
  saveContacts?: boolean;
  /** Assinatura/rubrica posicionadas, por participante (mesmo índice de `participants`). */
  marks?: (RelMark[] | undefined)[];
};

export type Created = { documentId: string; engineDocumentId: string; participantIds: string[] };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export async function createDocument(input: CreateInput): Promise<Created> {
  // Limite do plano (Bloco 6): bloqueia antes de criar no motor.
  const { data: allowed, error: limitError } = await admin.rpc("consume_document", {
    org: input.organizationId,
    origin: input.origin,
  });
  if (limitError) throw new AppError("internal_error", 500);
  if (allowed === false) throw new AppError("plan_limit_reached", 402);

  try {
    const sizes = input.marks?.some((m) => m?.length) ? pageSizes(await loadPdf(input.pdf)) : [];
    const upload = await signdoc.uploadBytes(toBase64(input.pdf));
    const [created] = await signdoc.createDocuments({
      files: [
        {
          id: upload,
          name: input.filename,
          displayName: input.name,
          contentType: "application/pdf",
        },
      ],
      flowActions: input.participants.map((p, i) => {
        const marks = p.role === "signer" ? (input.marks?.[i] ?? []) : [];
        return {
          ...toFlowAction(p, input.locale),
          ...(marks.length ? { prePositionedMarks: toEngineMarks(marks, sizes) } : {}),
        };
      }),
      ...(input.message ? { description: input.message } : {}),
      ...(input.expiresAt ? { expirationDate: input.expiresAt } : {}),
      disablePendingActionNotifications: !input.notify,
    });
    if (!created) throw new AppError("engine_rejected", 422);
    const engine = await signdoc.getDocument(created.documentId);

    const { data: doc, error } = await admin
      .from("documents")
      .insert({
        organization_id: input.organizationId,
        created_by: input.createdBy,
        kind: input.kind,
        name: input.name,
        engine_document_id: created.documentId,
        expires_at: engine.expirationDate ?? null,
        message: input.message ?? null,
        reminders_enabled: input.reminders?.enabled ?? input.notify,
        reminder_first_days: input.reminders?.firstDays ?? 2,
        reminder_every_days: input.reminders?.everyDays ?? 3,
        reminder_max: input.reminders?.max ?? 3,
      })
      .select("id")
      .single();
    if (error || !doc) throw error ?? new AppError("internal_error", 500);

    // Liga cada participante à ação do motor (mesma ordem de envio) e à conta MDSign, se houver.
    const actions = [...(engine.flowActions ?? [])];
    const rows = [];
    for (const p of input.participants) {
      const idx = actions.findIndex(
        (a) => a.step === p.step && (a.user?.email ?? "").toLowerCase() === p.email,
      );
      const action = idx >= 0 ? actions.splice(idx, 1)[0] : undefined;
      const { data: userId } = await admin.rpc("user_id_by_email", { target: p.email });
      rows.push({
        document_id: doc.id,
        organization_id: input.organizationId,
        user_id: (userId as string | null) ?? null,
        role: p.role,
        step: p.step,
        name: p.name,
        email: p.email,
        cpf: p.cpf,
        no_cpf: p.noCpf,
        phone: p.phone,
        auth_level: p.authLevel,
        status: action?.status === "Created" ? "created" : "pending",
        engine_flow_action_id: action?.id ?? null,
      });
    }
    const { data: inserted } = await admin.from("document_participants").insert(rows).select("id");

    await admin.from("document_events").insert({
      document_id: doc.id,
      organization_id: input.organizationId,
      type: input.kind === "send" ? "document.sent" : "document.created",
      actor_name: input.actorName,
      source: "mdsign",
    });
    await admin.rpc("write_audit_as", {
      org: input.organizationId,
      actor: input.createdBy,
      act: "document.created",
      ent: "document",
      ent_id: doc.id,
      payload: { origin: input.origin, name: input.name, participants: input.participants.length },
    });

    if (input.saveContacts)
      await admin.from("contacts").upsert(
        input.participants.map((p) => ({
          organization_id: input.organizationId,
          name: p.name,
          email: p.email,
          cpf: p.cpf,
          no_cpf: p.noCpf,
          phone: p.phone,
          source: "document",
          created_by: input.createdBy,
        })),
        { onConflict: "organization_id,email", ignoreDuplicates: true },
      );

    return {
      documentId: doc.id,
      engineDocumentId: created.documentId,
      participantIds: (inserted ?? []).map((r) => r.id as string),
    };
  } catch (error) {
    // Não cobra documento que não foi criado.
    await admin.rpc("refund_document", { org: input.organizationId });
    throw error;
  }
}

/** Valida PDF enviado pelo navegador (PRD §43: upload seguro). */
export async function readPdf(
  file: FormDataEntryValue | null,
): Promise<{ bytes: Uint8Array; name: string }> {
  if (!(file instanceof File)) throw new AppError("file_required");
  if (file.size === 0 || file.size > 20 * 1024 * 1024) throw new AppError("file_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
    throw new AppError("file_not_pdf");
  return { bytes, name: file.name.slice(0, 200) };
}
