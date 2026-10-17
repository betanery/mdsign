// Formulário / link público (PRD §14): qualquer pessoa com o link preenche, gera o documento
// do modelo e assina dentro da página. Sem login. Proteções: token aleatório, validade e máximo
// de respostas (reserva atômica), limite por IP, honeypot e validação de todos os campos.

import { assertFeature } from "../_shared/features.ts";
import { admin } from "../_shared/auth.ts";
import { createDocument } from "../_shared/create.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import {
  cleanParticipants,
  identifierOptional,
  type AuthLevel,
  type ParticipantInput,
} from "../_shared/participants.ts";
import { signdoc } from "../_shared/signdoc.ts";
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
} from "../_shared/templates.ts";

const PER_IP_PER_HOUR = 5;

// Campos do modelo que repetem os dados de quem assina (ex.: "Nome do receptor", "CPF do
// receptor"): não aparecem no formulário e são preenchidos com "Seus dados".
type Mirror = "name" | "cpf" | "email";
function signerMirror(f: { key: string; label: string; type: string; source?: string }) {
  if (f.source !== "signer") return null;
  if (f.type === "cpf") return "cpf" as Mirror;
  if (f.type === "email") return "email" as Mirror;
  if (f.type === "text" && /^(nome|name|nombre)\b/i.test(`${f.key} ${f.label}`))
    return "name" as Mirror;
  return null;
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function loadForm(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new AppError("form_not_found", 404);
  const { data: form } = await admin
    .from("forms")
    .select(
      "id, organization_id, template_id, created_by, name, active, expires_at, max_responses, responses_count, redirect_url, auth_level, fixed_values, role_people, organizations (name)",
    )
    .eq("token", token)
    .maybeSingle();
  if (!form) throw new AppError("form_not_found", 404);
  const closed =
    !form.active ||
    (form.expires_at && new Date(form.expires_at) < new Date()) ||
    (form.max_responses != null && form.responses_count >= form.max_responses);
  if (closed) throw new AppError("form_closed", 410);
  const template = await loadTemplate(admin, form.template_id, form.organization_id);
  return { form, template };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new AppError("invalid_request");
    }
    const { form, template } = await loadForm(String(body["token"] ?? ""));
    const fixed = cleanValues(form.fixed_values);
    // Quem responde só preenche os campos que não foram fixados por quem criou o link.
    const fillable = fillableFields(template).filter((f) => !(f.key in fixed));
    const mirrored = template.participants.length ? [] : fillable.filter((f) => signerMirror(f));
    const fields = fillable.filter((f) => !mirrored.includes(f));
    const org = form.organizations as unknown as { name: string } | null;

    if (body["action"] === "config")
      return json(
        {
          name: form.name,
          organization: org?.name ?? "",
          locale: template.locale,
          fields: fields.map(({ key, label, type, required, options }) => ({
            key,
            label,
            type,
            required,
            options,
          })),
          foreignSigners: identifierOptional,
        },
        200,
        origin,
      );

    if (body["action"] !== "submit") throw new AppError("invalid_request");
    // Honeypot: campo invisível preenchido = robô. Responde como sucesso, sem criar nada.
    if (String(body["website"] ?? "")) return json({ ok: true }, 200, origin);

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim();
    const ipHash = await sha256(`${form.id}:${ip}`);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("form_submissions")
      .select("id", { count: "exact", head: true })
      .eq("form_id", form.id)
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if ((count ?? 0) >= PER_IP_PER_HOUR) throw new AppError("rate_limited", 429);

    const signer = (body["signer"] ?? {}) as Record<string, unknown>;
    const signerInput = {
      name: String(signer["name"] ?? ""),
      email: String(signer["email"] ?? ""),
      cpf: String(signer["cpf"] ?? ""),
      noCpf: Boolean(signer["noCpf"]),
      authLevel: form.auth_level as AuthLevel,
    };
    const values = { ...cleanValues(body["values"]), ...fixed };
    for (const f of mirrored) {
      const m = signerMirror(f)!;
      const v =
        m === "name"
          ? signerInput.name.trim()
          : m === "email"
            ? signerInput.email.trim()
            : signerInput.cpf;
      if (v) values[f.key] = v;
    }
    let participants;
    let pdf: Uint8Array;
    let marks;
    if (template.participants.length) {
      // Quem responde ocupa o 1º papel; os demais são as pessoas fixas do link.
      const others = (form.role_people ?? {}) as Record<string, ParticipantInput>;
      const r = roleParticipants(
        template,
        { ...others, [String(firstSlot(template))]: signerInput },
        template.flow.sequential ?? true,
      );
      participants = r.list;
      pdf = await renderTemplate(template, slotValues(template, values, r.bySlot));
      marks = marksFor(template, r.slots);
    } else {
      participants = cleanParticipants([signerInput], false);
      pdf = await renderTemplate(template, values);
    }
    const participant = participants.find(
      (x) => x.email === signerInput.email.trim().toLowerCase(),
    )!;

    // Link público só funciona se o plano da organização inclui formulários.
    await assertFeature(form.organization_id, "forms");
    const { data: claimed } = await admin.rpc("claim_form_slot", { target: form.id });
    if (!claimed) throw new AppError("form_closed", 410);
    try {
      const name = `${template.name} — ${participant!.name}`.slice(0, 200);
      const created = await createDocument({
        organizationId: form.organization_id,
        createdBy: form.created_by,
        actorName: participant!.name,
        kind: "send",
        name,
        pdf,
        filename: pdfFilename(name),
        participants,
        marks,
        locale: template.locale,
        // Quem responde assina agora na página. Com outros papéis, eles recebem o convite.
        notify: participants.length > 1,
        origin: "form",
        templateId: template.id,
        saveContacts: true,
      });
      await admin
        .from("form_submissions")
        .insert({ form_id: form.id, document_id: created.documentId, ip_hash: ipHash });
      const action = await signdoc.actionUrl(created.engineDocumentId, {
        emailAddress: participant!.email,
        ...(participant!.cpf ? { identifier: participant!.cpf } : {}),
      });
      return json({ embedUrl: action.embedUrl, redirectUrl: form.redirect_url }, 200, origin);
    } catch (error) {
      await admin.rpc("release_form_slot", { target: form.id });
      throw error;
    }
  } catch (error) {
    return handleError(error, origin);
  }
});
