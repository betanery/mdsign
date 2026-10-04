// Envio em massa (PRD §17–§19): criar lote validado, enviar teste para mim, iniciar,
// continuar o processamento e cancelar. A planilha é lida e mapeada no navegador.

import { requirePermission, requireUser } from "../_shared/auth.ts";
import { checkRow, cleanOptions, processBulk, type BulkRow } from "../_shared/bulk.ts";
import { admin } from "../_shared/auth.ts";
import { createDocument } from "../_shared/create.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import { availableAuthLevels } from "../_shared/participants.ts";
import { loadTemplate, pdfFilename, renderTemplate } from "../_shared/templates.ts";

const MAX_ROWS = 1000;

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    const caller = await requireUser(req);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new AppError("invalid_request");
    }
    const action = String(body["action"] ?? "");

    if (action === "create") {
      const organizationId = String(body["organizationId"] ?? "");
      if (!organizationId) throw new AppError("organization_required");
      await requirePermission(caller, organizationId, "bulk.send");
      const template = await loadTemplate(
        caller.asUser,
        String(body["templateId"] ?? ""),
        organizationId,
      );
      const options = cleanOptions(
        body["options"] as Record<string, unknown>,
        caller.profile.locale,
      );
      if (!availableAuthLevels().includes(options.authLevel)) throw new AppError("invalid_request");
      const rows = body["rows"] as BulkRow[];
      if (!Array.isArray(rows) || rows.length === 0) throw new AppError("bulk_empty");
      if (rows.length > MAX_ROWS) throw new AppError("bulk_too_many", 422, { max: MAX_ROWS });

      const problems: { row: number; fields: string[] }[] = [];
      const seen = new Set<string>();
      const clean = rows.map((row, i) => {
        const { participant, values, problems: p } = checkRow(row, template, options.authLevel);
        if (participant && seen.has(participant.email)) p.push("duplicate");
        if (participant) seen.add(participant.email);
        if (p.length) problems.push({ row: i + 1, fields: p });
        return { participant, values };
      });
      if (problems.length) throw new AppError("invalid_rows", 422, problems);

      const { data: job, error } = await admin
        .from("bulk_jobs")
        .insert({
          organization_id: organizationId,
          created_by: caller.user.id,
          template_id: template.id,
          name:
            String(body["name"] ?? "")
              .trim()
              .slice(0, 160) || template.name,
          mapping: (body["mapping"] ?? {}) as Record<string, unknown>,
          options,
          total: clean.length,
        })
        .select("id")
        .single();
      if (error || !job) throw error ?? new AppError("internal_error", 500);
      const items = clean.map(({ participant: p, values }, i) => ({
        job_id: job.id,
        organization_id: organizationId,
        row_number: i + 1,
        data: {
          name: p!.name,
          email: p!.email,
          cpf: p!.cpf,
          noCpf: p!.noCpf,
          phone: p!.phone,
          values,
        },
      }));
      for (let i = 0; i < items.length; i += 500) {
        const { error: itemsError } = await admin
          .from("bulk_items")
          .insert(items.slice(i, i + 500));
        if (itemsError) throw itemsError;
      }
      await admin.rpc("write_audit_as", {
        org: organizationId,
        actor: caller.user.id,
        act: "bulk.created",
        ent: "bulk_job",
        ent_id: job.id,
        payload: { total: items.length, template: template.id },
      });
      return json({ jobId: job.id, total: items.length }, 200, origin);
    }

    // Demais ações agem sobre um lote existente.
    const { data: job } = await admin
      .from("bulk_jobs")
      .select("id, organization_id, template_id, status, options")
      .eq("id", String(body["jobId"] ?? ""))
      .maybeSingle();
    if (!job) throw new AppError("bulk_not_found", 404);
    await requirePermission(caller, job.organization_id, "bulk.send");

    if (action === "test") {
      // Envia a 1ª linha para quem está montando o lote, para conferir o resultado.
      if (job.status !== "draft") throw new AppError("bulk_not_draft");
      const { profile, user } = caller;
      if (!profile.full_name?.trim() || !profile.cpf) throw new AppError("profile_incomplete");
      const { data: first } = await admin
        .from("bulk_items")
        .select("data")
        .eq("job_id", job.id)
        .order("row_number")
        .limit(1)
        .single();
      const template = await loadTemplate(admin, job.template_id!, job.organization_id);
      const name = `[Teste] ${template.name}`;
      const options = job.options as { locale: string; message: string | null };
      const created = await createDocument({
        organizationId: job.organization_id,
        createdBy: user.id,
        actorName: profile.full_name,
        kind: "send",
        name,
        pdf: await renderTemplate(template, (first?.data as BulkRow).values),
        filename: pdfFilename(name),
        participants: [
          {
            name: profile.full_name,
            email: user.email!.toLowerCase(),
            cpf: profile.cpf,
            noCpf: false,
            phone: null,
            role: "signer",
            authLevel: "basic",
            step: 1,
          },
        ],
        locale: options.locale,
        message: options.message,
        notify: true,
        origin: "bulk_test",
      });
      return json({ documentId: created.documentId }, 200, origin);
    }

    if (action === "start") {
      if (job.status !== "draft") throw new AppError("bulk_not_draft");
      await admin
        .from("bulk_jobs")
        .update({ status: "sending" })
        .eq("id", job.id)
        .eq("status", "draft");
      await admin.rpc("write_audit_as", {
        org: job.organization_id,
        actor: caller.user.id,
        act: "bulk.started",
        ent: "bulk_job",
        ent_id: job.id,
        payload: {},
      });
      return json(await processBulk(job.id), 200, origin);
    }

    if (action === "process") return json(await processBulk(job.id), 200, origin);

    if (action === "cancel") {
      if (job.status === "done" || job.status === "canceled") throw new AppError("bulk_finished");
      await admin.from("bulk_jobs").update({ status: "canceled" }).eq("id", job.id);
      await admin.rpc("write_audit_as", {
        org: job.organization_id,
        actor: caller.user.id,
        act: "bulk.canceled",
        ent: "bulk_job",
        ent_id: job.id,
        payload: {},
      });
      return json({ ok: true }, 200, origin);
    }

    throw new AppError("invalid_request");
  } catch (error) {
    return handleError(error, origin);
  }
});
