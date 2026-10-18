// "Enviar para assinatura" (PRD §9): Documento → Participantes → Fluxo/autenticação →
// Configurações → Revisão → Envio. O motor envia os e-mails aos participantes.

import { requirePermission, requireUser } from "../_shared/auth.ts";
import {
  createDocument,
  optionalKey,
  readAttachments,
  readPdf,
  requestKey,
} from "../_shared/create.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import { cleanExpiration, cleanLocale, cleanMessage, cleanReminders } from "../_shared/options.ts";
import {
  cleanObservers,
  cleanParticipants,
  type ParticipantInput,
} from "../_shared/participants.ts";
import { cleanParticipantMarks } from "../_shared/pdf.ts";

type Payload = {
  organizationId: string;
  /** Id gerado pela tela a cada envio: repetir a mesma requisição não cobra de novo. */
  requestId?: string;
  name: string;
  message?: string;
  expiresAt?: string | null;
  sequential: boolean;
  locale?: string;
  participants: ParticipantInput[];
  reminders?: { enabled: boolean; firstDays: number; everyDays: number; max: number };
  /** Posições de assinatura/rubrica por participante (mesma ordem de `participants`). */
  marks?: unknown;
  observers?: unknown;
  folderId?: string | null;
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    const caller = await requireUser(req);
    const form = await req.formData();
    let payload: Payload;
    try {
      payload = JSON.parse(String(form.get("payload") ?? ""));
    } catch {
      throw new AppError("invalid_request");
    }
    if (!payload.organizationId) throw new AppError("organization_required");
    await requirePermission(caller, payload.organizationId, "documents.create");
    const { bytes, name: filename } = await readPdf(form.get("file"));
    const attachments = await readAttachments(form.getAll("attachments"));

    const name =
      String(payload.name ?? "")
        .trim()
        .slice(0, 200) || filename.replace(/\.pdf$/i, "");
    const participants = cleanParticipants(payload.participants, Boolean(payload.sequential));

    const created = await createDocument({
      organizationId: payload.organizationId,
      createdBy: caller.user.id,
      actorName: caller.profile.full_name ?? caller.user.email ?? "",
      // Mesmo envio de novo (rede caiu, clique duplo): não cria nem cobra outro documento.
      ...optionalKey(requestKey("send", caller.user.id, payload.requestId)),
      kind: "send",
      name,
      pdf: bytes,
      filename,
      participants,
      locale: cleanLocale(payload.locale, caller.profile.locale),
      message: cleanMessage(payload.message),
      expiresAt: cleanExpiration(payload.expiresAt),
      notify: true,
      origin: "send",
      saveContacts: true,
      reminders: cleanReminders(payload.reminders),
      marks: cleanParticipantMarks(payload.marks, participants.length),
      observers: cleanObservers(payload.observers),
      attachments,
      folderId: payload.folderId ?? null,
    });
    return json({ documentId: created.documentId }, 200, origin);
  } catch (error) {
    return handleError(error, origin);
  }
});
