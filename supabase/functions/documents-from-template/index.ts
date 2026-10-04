// Criar documento a partir de modelo (PRD §13): prévia do PDF, "Só eu assino" ou envio.

import { requirePermission, requireUser } from "../_shared/auth.ts";
import { createDocument } from "../_shared/create.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import { cleanExpiration, cleanLocale, cleanMessage, cleanReminders } from "../_shared/options.ts";
import {
  cleanParticipants,
  identifierOptional,
  type ParticipantInput,
} from "../_shared/participants.ts";
import { signdoc } from "../_shared/signdoc.ts";
import { cleanValues, loadTemplate, pdfFilename, renderTemplate } from "../_shared/templates.ts";

type Payload = {
  organizationId: string;
  templateId: string;
  mode: "preview" | "self" | "send";
  values: Record<string, unknown>;
  name?: string;
  participants?: ParticipantInput[];
  sequential?: boolean;
  message?: string;
  expiresAt?: string | null;
  locale?: string;
  reminders?: { enabled: boolean; firstDays: number; everyDays: number; max: number };
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    const caller = await requireUser(req);
    let p: Payload;
    try {
      p = await req.json();
    } catch {
      throw new AppError("invalid_request");
    }
    if (!p.organizationId) throw new AppError("organization_required");
    await requirePermission(caller, p.organizationId, "documents.create");
    const template = await loadTemplate(
      caller.asUser,
      String(p.templateId ?? ""),
      p.organizationId,
    );
    const values = cleanValues(p.values);
    const pdf = await renderTemplate(template, values);
    const name =
      String(p.name ?? "")
        .trim()
        .slice(0, 200) || template.name;

    if (p.mode === "preview")
      return new Response(new Uint8Array(pdf), {
        status: 200,
        headers: { ...corsHeaders(origin), "Content-Type": "application/pdf" },
      });

    const { profile, user } = caller;
    const base = {
      organizationId: p.organizationId,
      createdBy: user.id,
      actorName: profile.full_name ?? user.email ?? "",
      name,
      pdf,
      filename: pdfFilename(name),
      origin: "template",
    };

    if (p.mode === "self") {
      if (!profile.full_name?.trim() || (!profile.cpf && !profile.no_cpf))
        throw new AppError("profile_incomplete");
      if (!profile.cpf && !identifierOptional) throw new AppError("foreign_not_enabled");
      const created = await createDocument({
        ...base,
        kind: "self",
        locale: profile.locale,
        notify: false,
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
    }

    if (p.mode !== "send") throw new AppError("invalid_request");
    const created = await createDocument({
      ...base,
      kind: "send",
      participants: cleanParticipants(p.participants ?? [], Boolean(p.sequential)),
      locale: cleanLocale(p.locale, profile.locale),
      message: cleanMessage(p.message),
      expiresAt: cleanExpiration(p.expiresAt),
      notify: true,
      saveContacts: true,
      reminders: cleanReminders(p.reminders),
    });
    return json({ documentId: created.documentId }, 200, origin);
  } catch (error) {
    return handleError(error, origin);
  }
});
