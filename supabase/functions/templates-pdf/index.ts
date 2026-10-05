// Arquivos dos modelos PDF: enviar (valida, conta páginas, detecta campos do formulário),
// visualizar (URL assinada curta), duplicar e excluir. O bucket é privado e sem políticas:
// só esta função mexe nos arquivos, sempre na pasta da organização.

import { admin, requirePermission, requireUser } from "../_shared/auth.ts";
import { readPdf } from "../_shared/create.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import { detectFields, loadPdf, pageSizes } from "../_shared/pdf.ts";
import { loadTemplate } from "../_shared/templates.ts";

const BUCKET = "templates";
const VIEW_SECONDS = 600;
const PATH = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.pdf$/;

async function signed(path: string) {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, VIEW_SECONDS);
  if (error || !data) throw new AppError("template_not_found", 404);
  return data.signedUrl;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    const caller = await requireUser(req);

    // Upload em multipart: { organizationId, file }.
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const organizationId = String(form.get("organizationId") ?? "");
      if (!organizationId) throw new AppError("organization_required");
      await requirePermission(caller, organizationId, "documents.create");
      const { bytes } = await readPdf(form.get("file"));
      const doc = await loadPdf(bytes);
      const path = `${organizationId}/${crypto.randomUUID()}.pdf`;
      const { error } = await admin.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: "application/pdf", upsert: false });
      if (error) throw new AppError("internal_error", 500);
      return json(
        { path, pages: pageSizes(doc), fields: detectFields(doc), url: await signed(path) },
        200,
        origin,
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new AppError("invalid_request");
    }
    const action = String(body["action"] ?? "");
    const organizationId = String(body["organizationId"] ?? "");
    if (!organizationId) throw new AppError("organization_required");
    await requirePermission(caller, organizationId, "documents.create");

    if (action === "view") {
      // Modelo salvo: a RLS decide se a pessoa pode vê-lo. Arquivo recém-enviado (ainda sem
      // modelo): só se estiver na pasta da organização.
      if (body["templateId"]) {
        const t = await loadTemplate(caller.asUser, String(body["templateId"]), organizationId);
        if (!t.file_path) throw new AppError("template_not_found", 404);
        return json({ url: await signed(t.file_path) }, 200, origin);
      }
      const path = String(body["path"] ?? "");
      if (PATH.exec(path)?.[1] !== organizationId) throw new AppError("template_not_found", 404);
      return json({ url: await signed(path) }, 200, origin);
    }

    if (action === "copy") {
      const t = await loadTemplate(caller.asUser, String(body["templateId"] ?? ""), organizationId);
      if (!t.file_path) throw new AppError("template_not_found", 404);
      const path = `${organizationId}/${crypto.randomUUID()}.pdf`;
      const { error } = await admin.storage.from(BUCKET).copy(t.file_path, path);
      if (error) throw new AppError("internal_error", 500);
      return json({ path, url: await signed(path) }, 200, origin);
    }

    if (action === "delete") {
      const id = String(body["templateId"] ?? "");
      const t = await loadTemplate(caller.asUser, id, organizationId);
      // A exclusão passa pela RLS (dono do pessoal ou templates.manage).
      const { data, error } = await caller.asUser
        .from("templates")
        .delete()
        .eq("id", id)
        .select("id");
      if (error?.code === "23503") throw new AppError("template_in_use", 409);
      if (error || !data?.length) throw new AppError("forbidden", 403);
      if (t.file_path) await admin.storage.from(BUCKET).remove([t.file_path]);
      return json({ ok: true }, 200, origin);
    }

    throw new AppError("invalid_request");
  } catch (error) {
    return handleError(error, origin);
  }
});
