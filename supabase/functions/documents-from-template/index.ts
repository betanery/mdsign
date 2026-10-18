// Criar documento a partir de modelo (PRD §13): prévia, teste de rascunho, "Só eu assino" ou
// envio. Modelos com papéis (ex.: Colaborador, Gestor, RH) recebem uma pessoa por papel; as
// variáveis do papel e as marcas de assinatura/rubrica seguem quem ocupa o papel.

import { assertFeature } from "../_shared/features.ts";
import { requirePermission, requireUser } from "../_shared/auth.ts";
import { createDocument, optionalKey, requestKey } from "../_shared/create.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import { cleanExpiration, cleanLocale, cleanMessage, cleanReminders } from "../_shared/options.ts";
import {
  cleanObservers,
  cleanParticipants,
  identifierOptional,
  type CleanParticipant,
  type ParticipantInput,
} from "../_shared/participants.ts";
import { cleanParticipantMarks } from "../_shared/pdf.ts";
import { signdoc } from "../_shared/signdoc.ts";
import {
  cleanValues,
  loadTemplate,
  marksFor,
  normalizeTemplate,
  pdfFilename,
  renderTemplate,
  roleParticipants,
  slotValues,
  type Template,
} from "../_shared/templates.ts";

type Payload = {
  organizationId: string;
  /** Id gerado pela tela a cada envio: repetir a mesma requisição não cobra de novo. */
  requestId?: string;
  templateId?: string;
  /** Modelo ainda não salvo ("Testar modelo"): só gera a prévia. */
  draft?: Record<string, unknown>;
  mode: "preview" | "test" | "self" | "send";
  values: Record<string, unknown>;
  name?: string;
  /** Modelo sem papéis: lista livre de participantes. */
  participants?: ParticipantInput[];
  /** Modelo com papéis: uma pessoa por papel ({ "1": {...}, "2": {...} }). */
  roles?: Record<string, ParticipantInput>;
  sequential?: boolean;
  message?: string;
  expiresAt?: string | null;
  locale?: string;
  reminders?: { enabled: boolean; firstDays: number; everyDays: number; max: number };
  /** Modelos sem marcas definidas: posições escolhidas no envio, por participante. */
  marks?: unknown;
  observers?: unknown;
  folderId?: string | null;
};

const pdfResponse = (pdf: Uint8Array, origin: string | null) =>
  new Response(new Uint8Array(pdf), {
    status: 200,
    headers: { ...corsHeaders(origin), "Content-Type": "application/pdf" },
  });

/** Pessoas fictícias/da amostra por papel, só para preencher a prévia (nada é enviado). */
function previewPeople(t: Template, roles: Record<string, ParticipantInput> | undefined) {
  const people = new Map<number, CleanParticipant>();
  for (const r of t.participants) {
    const person = roles?.[String(r.slot)];
    if (person?.name)
      people.set(r.slot, {
        name: String(person.name),
        email: String(person.email ?? ""),
        cpf: person.cpf ? String(person.cpf) : null,
        noCpf: Boolean(person.noCpf),
        phone: person.phone ? String(person.phone) : null,
        role: r.role,
        authLevel: r.authLevel,
        step: r.slot,
      });
  }
  return people;
}

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
    await assertFeature(p.organizationId, "templates");
    const values = cleanValues(p.values);

    // Teste de rascunho: nada é criado, enviado ou consumido do plano.
    if (p.mode === "test") {
      if (!p.draft) throw new AppError("invalid_request");
      const draft = normalizeTemplate({ ...p.draft, organization_id: p.organizationId });
      const people = previewPeople(draft, p.roles);
      const pdf = await renderTemplate(draft, slotValues(draft, values, people), {
        previewMarks: true,
        optional: true,
      });
      return pdfResponse(pdf, origin);
    }

    const template = await loadTemplate(
      caller.asUser,
      String(p.templateId ?? ""),
      p.organizationId,
    );
    const name =
      String(p.name ?? "")
        .trim()
        .slice(0, 200) || template.name;
    const withRoles = template.participants.length > 0;

    // Prévia: sem pessoas, os campos de papel ficam de fora; com `roles` (amostra do envio
    // em massa), eles saem preenchidos com quem vai assinar. Nada é criado nem consumido.
    if (p.mode === "preview")
      return pdfResponse(
        await renderTemplate(
          template,
          p.roles ? slotValues(template, values, previewPeople(template, p.roles)) : values,
          { previewMarks: true, skipSlotFields: !p.roles },
        ),
        origin,
      );

    const { profile, user } = caller;
    const base = {
      organizationId: p.organizationId,
      createdBy: user.id,
      actorName: profile.full_name ?? user.email ?? "",
      name,
      filename: pdfFilename(name),
      origin: "template",
      templateId: template.id,
      folderId: p.folderId ?? null,
      ...optionalKey(requestKey("template", user.id, p.requestId)),
    };

    if (p.mode === "self") {
      if (!profile.full_name?.trim() || (!profile.cpf && !profile.no_cpf))
        throw new AppError("profile_incomplete");
      if (!profile.cpf && !identifierOptional) throw new AppError("foreign_not_enabled");
      // "Só eu assino" só serve para modelos de um papel (ou sem papéis).
      if (template.participants.length > 1) throw new AppError("template_needs_participants");
      const me: CleanParticipant = {
        name: profile.full_name,
        email: user.email!.toLowerCase(),
        cpf: profile.cpf,
        noCpf: profile.no_cpf,
        phone: null,
        role: "signer",
        authLevel: "basic",
        step: 1,
      };
      const slot = template.participants[0]?.slot ?? 1;
      const created = await createDocument({
        ...base,
        kind: "self",
        pdf: await renderTemplate(template, slotValues(template, values, new Map([[slot, me]]))),
        locale: profile.locale,
        notify: false,
        participants: [me],
        marks:
          withRoles && template.marks.length
            ? marksFor(template, [slot])
            : cleanParticipantMarks(p.marks, 1),
        observers: cleanObservers(p.observers),
      });
      const action = await signdoc.actionUrl(created.engineDocumentId, {
        emailAddress: user.email!,
        ...(profile.cpf ? { identifier: profile.cpf } : {}),
      });
      return json({ documentId: created.documentId, embedUrl: action.embedUrl }, 200, origin);
    }

    if (p.mode !== "send") throw new AppError("invalid_request");
    const sequential = p.sequential ?? template.flow.sequential ?? true;
    let participants: CleanParticipant[];
    let pdf: Uint8Array;
    let marks: ReturnType<typeof marksFor> | undefined;
    if (withRoles) {
      const r = roleParticipants(template, p.roles ?? {}, Boolean(sequential));
      participants = r.list;
      pdf = await renderTemplate(template, slotValues(template, values, r.bySlot));
      marks = marksFor(template, r.slots);
    } else {
      participants = cleanParticipants(p.participants ?? [], Boolean(sequential));
      pdf = await renderTemplate(template, values);
    }
    // Sem marcas no modelo, valem as posições escolhidas no envio.
    if (!marks?.some((m) => m.length)) marks = cleanParticipantMarks(p.marks, participants.length);
    const created = await createDocument({
      ...base,
      kind: "send",
      pdf,
      participants,
      marks,
      locale: cleanLocale(p.locale, profile.locale),
      message: cleanMessage(p.message ?? template.flow.message),
      expiresAt: cleanExpiration(p.expiresAt),
      notify: true,
      saveContacts: true,
      reminders: cleanReminders(p.reminders ?? template.flow.reminders),
      observers: cleanObservers(p.observers),
    });
    return json({ documentId: created.documentId }, 200, origin);
  } catch (error) {
    return handleError(error, origin);
  }
});
