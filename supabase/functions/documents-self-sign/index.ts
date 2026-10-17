// "Só eu assino" (PRD §8): recebe o PDF, cria o documento com o próprio usuário como único
// signatário e devolve o embedUrl para assinar dentro do MDSign. Sem notificações por e-mail.

import { requirePermission, requireUser } from "../_shared/auth.ts";
import { createDocument, optionalKey, readPdf, requestKey } from "../_shared/create.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import { cleanObservers, identifierOptional } from "../_shared/participants.ts";
import { cleanParticipantMarks } from "../_shared/pdf.ts";
import { signdoc } from "../_shared/signdoc.ts";

const jsonField = (v: FormDataEntryValue | null) => {
  try {
    return typeof v === "string" && v ? JSON.parse(v) : undefined;
  } catch {
    return undefined;
  }
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    const caller = await requireUser(req);
    const form = await req.formData();
    const organizationId = String(form.get("organizationId") ?? "");
    if (!organizationId) throw new AppError("organization_required");
    await requirePermission(caller, organizationId, "documents.create");
    const { bytes, name: filename } = await readPdf(form.get("file"));

    const { profile, user } = caller;
    if (!profile.full_name?.trim() || (!profile.cpf && !profile.no_cpf))
      throw new AppError("profile_incomplete");
    if (!profile.cpf && !identifierOptional) throw new AppError("foreign_not_enabled");
    const name =
      String(form.get("displayName") ?? "")
        .trim()
        .slice(0, 200) || filename.replace(/\.pdf$/i, "");

    const created = await createDocument({
      organizationId,
      createdBy: user.id,
      actorName: profile.full_name,
      ...optionalKey(requestKey("self", user.id, form.get("requestId"))),
      kind: "self",
      name,
      pdf: bytes,
      filename,
      locale: profile.locale,
      notify: false,
      origin: "self",
      marks: cleanParticipantMarks(jsonField(form.get("marks")), 1),
      observers: cleanObservers(jsonField(form.get("observers"))),
      participants: [
        {
          name: profile.full_name,
          email: user.email!.toLowerCase(),
          cpf: profile.cpf,
          noCpf: profile.no_cpf,
          phone: null,
          role: "signer",
          authLevel: "basic",
          step: 1,
        },
      ],
    });

    const action = await signdoc.actionUrl(created.engineDocumentId, {
      emailAddress: user.email!,
      ...(profile.cpf ? { identifier: profile.cpf } : {}),
    });
    return json({ documentId: created.documentId, embedUrl: action.embedUrl }, 200, origin);
  } catch (error) {
    return handleError(error, origin);
  }
});
