// "Só eu assino" (PRD §8): recebe o PDF, cria o documento no motor com o próprio usuário como
// único signatário e devolve o embedUrl para assinar dentro do MDSign. Sem notificações por e-mail.

import { admin, requirePermission, requireUser } from "../_shared/auth.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import { signdoc } from "../_shared/signdoc.ts";

const MAX_BYTES = 20 * 1024 * 1024;
const notificationLanguage: Record<string, string> = { pt: "Pt", en: "En", es: "Es" };

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    const caller = await requireUser(req);
    const form = await req.formData();
    const organizationId = String(form.get("organizationId") ?? "");
    const file = form.get("file");
    if (!organizationId) throw new AppError("organization_required");
    await requirePermission(caller, organizationId, "documents.create");

    // Upload seguro (PRD §43): só PDF, até 20 MB, conferindo a assinatura do arquivo.
    if (!(file instanceof File)) throw new AppError("file_required");
    if (file.size === 0 || file.size > MAX_BYTES) throw new AppError("file_too_large");
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (new TextDecoder().decode(head) !== "%PDF-") throw new AppError("file_not_pdf");

    const { profile, user } = caller;
    if (!profile.full_name?.trim()) throw new AppError("profile_incomplete");
    if (!profile.cpf && !profile.no_cpf) throw new AppError("profile_incomplete");

    const displayName = String(form.get("displayName") ?? "").trim().slice(0, 200) || file.name.replace(/\.pdf$/i, "");
    const uploadId = await signdoc.upload(file);
    const [created] = await signdoc.createDocuments({
      files: [{ id: uploadId, name: file.name, displayName, contentType: "application/pdf" }],
      flowActions: [
        {
          type: "Signer",
          step: 1,
          user: {
            name: profile.full_name,
            email: user.email,
            ...(profile.cpf ? { identifier: profile.cpf } : {}),
          },
          allowElectronicSignature: true,
          notificationLanguage: notificationLanguage[profile.locale] ?? "Pt",
        },
      ],
      disablePendingActionNotifications: true,
    });
    if (!created) throw new AppError("engine_rejected", 422);

    const engine = await signdoc.getDocument(created.documentId);
    const { data: doc, error } = await admin
      .from("documents")
      .insert({
        organization_id: organizationId,
        created_by: user.id,
        kind: "self",
        name: displayName,
        engine_document_id: created.documentId,
        expires_at: engine.expirationDate ?? null,
      })
      .select("id")
      .single();
    if (error || !doc) throw error ?? new AppError("internal_error", 500);

    await admin.from("document_participants").insert({
      document_id: doc.id,
      organization_id: organizationId,
      user_id: user.id,
      role: "signer",
      step: 1,
      name: profile.full_name,
      email: user.email!,
      cpf: profile.cpf,
      status: "pending",
      engine_flow_action_id: engine.flowActions?.[0]?.id ?? null,
    });
    await admin.from("document_events").insert({
      document_id: doc.id,
      organization_id: organizationId,
      type: "document.created",
      actor_name: profile.full_name,
      source: "mdsign",
    });
    await admin.rpc("write_audit_as", {
      org: organizationId,
      actor: user.id,
      act: "document.created",
      ent: "document",
      ent_id: doc.id,
      payload: { kind: "self", name: displayName },
    });

    const action = await signdoc.actionUrl(created.documentId, {
      emailAddress: user.email!,
      ...(profile.cpf ? { identifier: profile.cpf } : {}),
    });
    return json({ documentId: doc.id, embedUrl: action.embedUrl }, 200, origin);
  } catch (error) {
    return handleError(error, origin);
  }
});
