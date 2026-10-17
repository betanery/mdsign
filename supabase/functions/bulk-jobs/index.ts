// Envio em massa (PRD §17–§19): criar lote validado, enviar teste para mim, iniciar,
// continuar o processamento e cancelar. A planilha é lida e mapeada no navegador.

import { assertFeature } from "../_shared/features.ts";
import { requirePermission, requireUser } from "../_shared/auth.ts";
import {
  checkRow,
  cleanOptions,
  pdfItemDocument,
  processBulk,
  type BulkRow,
  type PdfBulkMark,
  type PdfItemData,
} from "../_shared/bulk.ts";
import { admin } from "../_shared/auth.ts";
import { createDocument } from "../_shared/create.ts";
import { removeBulkFolder } from "../_shared/retention.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import {
  availableAuthLevels,
  cleanParticipants,
  type AuthLevel,
  type ParticipantInput,
} from "../_shared/participants.ts";
import { firstSlot, loadTemplate, pdfFilename, renderTemplate } from "../_shared/templates.ts";

const MAX_ROWS = 1000;
const FOLDER = /^([0-9a-f-]{36})\/[0-9a-f-]{36}$/;

/** Posição da assinatura do lote de PDF (primeira ou última página de cada documento). */
function cleanMarks(raw: unknown): PdfBulkMark[] {
  if (!Array.isArray(raw)) return [];
  const clamp = (v: unknown) => Math.min(Math.max(Number(v) || 0, 0), 1);
  return raw
    .slice(0, 10)
    .map((m) => {
      const x = clamp(m?.x);
      const y = clamp(m?.y);
      return {
        type: ["signature", "initials", "stamp"].includes(m?.type) ? m.type : "signature",
        pageRef: m?.pageRef === "first" ? "first" : "last",
        page: 1,
        x,
        y,
        w: Math.min(clamp(m?.w), 1 - x),
        h: Math.min(clamp(m?.h), 1 - y),
      } as PdfBulkMark;
    })
    .filter((m) => m.w > 0.01 && m.h > 0.01);
}

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
      await assertFeature(organizationId, "bulk_send");
      const template = await loadTemplate(
        caller.asUser,
        String(body["templateId"] ?? ""),
        organizationId,
      );
      const options = {
        ...cleanOptions(body["options"] as Record<string, unknown>, caller.profile.locale),
        marks: cleanMarks((body["options"] as Record<string, unknown>)?.["marks"]),
      };
      if (!availableAuthLevels().includes(options.authLevel)) throw new AppError("invalid_request");
      // Modelo com papéis: os papéis além do 1º precisam de pessoas fixas válidas.
      const others = template.participants.filter((r) => r.slot !== firstSlot(template));
      if (others.length) {
        const people = options.rolePeople ?? {};
        cleanParticipants(
          others.map((r) => ({
            ...(people[String(r.slot)] ?? { name: "", email: "" }),
            role: r.role,
            authLevel: people[String(r.slot)]?.authLevel ?? r.authLevel,
          })),
          false,
        );
      }
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

    // ---- PDF com vários documentos (separado no navegador, uma parte por pessoa) ----
    if (action === "upload-urls") {
      const organizationId = String(body["organizationId"] ?? "");
      if (!organizationId) throw new AppError("organization_required");
      await requirePermission(caller, organizationId, "bulk.send");
      await assertFeature(organizationId, "bulk_send");
      const count = Math.trunc(Number(body["count"]));
      if (!(count >= 1 && count <= 100)) throw new AppError("invalid_request");
      const folder =
        typeof body["folder"] === "string" && FOLDER.exec(body["folder"])?.[1] === organizationId
          ? String(body["folder"])
          : `${organizationId}/${crypto.randomUUID()}`;
      const start = Math.max(0, Math.trunc(Number(body["start"]) || 0));
      const urls = [];
      for (let i = 0; i < count; i++) {
        const path = `${folder}/${String(start + i + 1).padStart(4, "0")}.pdf`;
        const { data, error } = await admin.storage
          .from("bulk-sources")
          .createSignedUploadUrl(path);
        if (error || !data) throw new AppError("internal_error", 500);
        urls.push({ path, token: data.token });
      }
      return json({ folder, urls }, 200, origin);
    }

    if (action === "create-pdf") {
      const organizationId = String(body["organizationId"] ?? "");
      if (!organizationId) throw new AppError("organization_required");
      await requirePermission(caller, organizationId, "bulk.send");
      await assertFeature(organizationId, "bulk_send");
      const folder = String(body["folder"] ?? "");
      if (FOLDER.exec(folder)?.[1] !== organizationId) throw new AppError("invalid_request");
      const source = (body["source"] ?? {}) as Record<string, unknown>;
      const options = {
        ...cleanOptions(body["options"] as Record<string, unknown>, caller.profile.locale),
        docName: String((body["options"] as Record<string, unknown>)?.["docName"] ?? "")
          .trim()
          .slice(0, 160),
        marks: cleanMarks((body["options"] as Record<string, unknown>)?.["marks"]),
      };
      if (!availableAuthLevels().includes(options.authLevel)) throw new AppError("invalid_request");
      const items = body["items"] as (PdfItemData & { pages: [number, number] })[];
      if (!Array.isArray(items) || items.length === 0) throw new AppError("bulk_empty");
      if (items.length > MAX_ROWS) throw new AppError("bulk_too_many", 422, { max: MAX_ROWS });
      const pageCount = Math.trunc(Number(source["pages"]));
      if (!(pageCount >= 1 && pageCount <= 1000)) throw new AppError("invalid_request");

      // Partes enviadas de fato para a pasta do lote.
      const { data: files } = await admin.storage
        .from("bulk-sources")
        .list(folder, { limit: 1000 });
      const uploaded = new Set((files ?? []).map((f) => `${folder}/${f.name}`));

      const problems: { row: number; fields: string[] }[] = [];
      const seenParts = new Set<string>();
      const used = new Set<number>();
      let confirmed = 0;
      const clean = items.map((it, i) => {
        const fields: string[] = [];
        const [from, to] = Array.isArray(it.pages) ? it.pages.map(Math.trunc) : [0, 0];
        if (!(from! >= 1 && to! >= from! && to! <= pageCount)) fields.push("pages");
        for (let pg = from!; pg <= to!; pg++) {
          if (used.has(pg)) fields.push("pages_overlap");
          used.add(pg);
        }
        if (!uploaded.has(it.part) || seenParts.has(it.part)) fields.push("part");
        seenParts.add(it.part);
        const m = it.match ?? { method: "manual", value: "", confidence: "red" };
        // Regra crítica: só verde (identificador verificável) ou confirmado explicitamente.
        const safe = m.confidence === "green" || m.confirmed === true;
        if (!safe) fields.push("unsafe");
        if (m.confirmed) confirmed++;
        let participant;
        try {
          [participant] = cleanParticipants([{ ...it, authLevel: options.authLevel }], false);
        } catch (e) {
          if (e instanceof AppError && Array.isArray(e.details))
            for (const d of e.details as { field: string }[]) fields.push(d.field);
          else throw e;
        }
        if (fields.length) problems.push({ row: i + 1, fields: [...new Set(fields)] });
        return {
          participant,
          pages: [from!, to!] as const,
          part: it.part,
          match: {
            method: m.method,
            value: String(m.value ?? "").slice(0, 120),
            confidence: m.confidence,
            ...(m.confirmed
              ? {
                  confirmed: true,
                  confirmed_by: caller.user.id,
                  confirmed_at: new Date().toISOString(),
                }
              : {}),
          },
        };
      });
      if (problems.some((p) => p.fields.includes("unsafe")))
        throw new AppError("unsafe_association", 422, problems);
      if (problems.length) throw new AppError("invalid_rows", 422, problems);

      const split = (body["split"] ?? {}) as Record<string, unknown>;
      const { data: job, error } = await admin
        .from("bulk_jobs")
        .insert({
          organization_id: organizationId,
          created_by: caller.user.id,
          template_id: null,
          name:
            String(body["name"] ?? "")
              .trim()
              .slice(0, 160) ||
            options.docName ||
            "PDF",
          source: "pdf",
          source_folder: folder,
          source_name: String(source["name"] ?? "").slice(0, 200) || null,
          source_sha256: /^[0-9a-f]{64}$/.test(String(source["sha256"]))
            ? String(source["sha256"])
            : null,
          source_pages: pageCount,
          split,
          options,
          total: clean.length,
        })
        .select("id")
        .single();
      if (error || !job) throw error ?? new AppError("internal_error", 500);
      const rows = clean.map(({ participant: p, pages, part, match }, i) => ({
        job_id: job.id,
        organization_id: organizationId,
        row_number: i + 1,
        page_from: pages[0],
        page_to: pages[1],
        match,
        data: {
          name: p!.name,
          email: p!.email,
          cpf: p!.cpf,
          noCpf: p!.noCpf,
          phone: p!.phone,
          part,
          match,
        },
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error: itemsError } = await admin.from("bulk_items").insert(rows.slice(i, i + 500));
        if (itemsError) throw itemsError;
      }
      // Auditoria: arquivo original, regra de separação, associação e confirmações manuais.
      const byMethod: Record<string, number> = {};
      for (const r of rows) byMethod[r.match.method] = (byMethod[r.match.method] ?? 0) + 1;
      await admin.rpc("write_audit_as", {
        org: organizationId,
        actor: caller.user.id,
        act: "bulk.created",
        ent: "bulk_job",
        ent_id: job.id,
        payload: {
          source: "pdf",
          file: source["name"] ?? null,
          sha256: source["sha256"] ?? null,
          pages: pageCount,
          split,
          total: rows.length,
          byMethod,
          manuallyConfirmed: confirmed,
        },
      });
      if (confirmed)
        await admin.rpc("write_audit_as", {
          org: organizationId,
          actor: caller.user.id,
          act: "bulk.items_confirmed",
          ent: "bulk_job",
          ent_id: job.id,
          payload: {
            rows: rows
              .filter((r) => r.match.confirmed)
              .map((r) => ({
                row: r.row_number,
                pages: [r.page_from, r.page_to],
                email: r.data.email,
              })),
          },
        });
      return json({ jobId: job.id, total: rows.length }, 200, origin);
    }

    // Demais ações agem sobre um lote existente.
    const { data: job } = await admin
      .from("bulk_jobs")
      .select("id, organization_id, template_id, status, options, source, source_folder")
      .eq("id", String(body["jobId"] ?? ""))
      .maybeSingle();
    if (!job) throw new AppError("bulk_not_found", 404);
    await requirePermission(caller, job.organization_id, "bulk.send");
    await assertFeature(job.organization_id, "bulk_send");

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
      const me = {
        name: profile.full_name,
        email: user.email!.toLowerCase(),
        cpf: profile.cpf,
        noCpf: false,
        phone: null,
        role: "signer" as const,
        authLevel: "basic" as const,
        step: 1,
      };
      const testOptions = job.options as { locale: string; message: string | null };
      if (job.source === "pdf") {
        // Teste do lote de PDF: a 1ª parte, com as marcas, vai para quem montou o lote.
        const r = await pdfItemDocument(job, {
          ...(first?.data as PdfItemData),
          match: { method: "manual", value: "", confidence: "green", confirmed: true },
        });
        const testName = `[Teste] ${r.name}`.slice(0, 200);
        const created = await createDocument({
          organizationId: job.organization_id,
          createdBy: user.id,
          actorName: profile.full_name,
          kind: "send",
          name: testName,
          pdf: r.pdf,
          filename: pdfFilename(testName),
          participants: [me],
          marks: [r.marks],
          locale: testOptions.locale,
          message: testOptions.message,
          notify: true,
          origin: "bulk_test",
        });
        return json({ documentId: created.documentId }, 200, origin);
      }
      const template = await loadTemplate(admin, job.template_id!, job.organization_id);
      const name = `[Teste] ${template.name}`;
      const options = job.options as { locale: string; message: string | null };
      const created = await createDocument({
        organizationId: job.organization_id,
        createdBy: user.id,
        actorName: profile.full_name,
        kind: "send",
        name,
        pdf: await renderTemplate(template, (first?.data as BulkRow).values, {
          skipSlotFields: true,
        }),
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

    // Central de erros: reenvia só as linhas com erro (as enviadas não são tocadas).
    if (action === "retry-failed") {
      if (job.status === "canceled") throw new AppError("bulk_finished");
      const { data: retried } = await admin
        .from("bulk_items")
        .update({ status: "pending", error: null, updated_at: new Date().toISOString() })
        .eq("job_id", job.id)
        .eq("status", "failed")
        .select("id");
      await admin.from("bulk_jobs").update({ status: "sending" }).eq("id", job.id);
      await admin.rpc("refresh_bulk_job", { job: job.id });
      await admin.rpc("write_audit_as", {
        org: job.organization_id,
        actor: caller.user.id,
        act: "bulk.retried",
        ent: "bulk_job",
        ent_id: job.id,
        payload: { items: retried?.length ?? 0 },
      });
      return json(await processBulk(job.id), 200, origin);
    }

    // Corrigir o destinatário de uma linha com erro (confirmação explícita, com auditoria).
    if (action === "update-item") {
      const row = Math.trunc(Number(body["row"]));
      const { data: item } = await admin
        .from("bulk_items")
        .select("id, status, data, row_number")
        .eq("job_id", job.id)
        .eq("row_number", row)
        .maybeSingle();
      if (!item) throw new AppError("bulk_not_found", 404);
      if (item.status !== "failed") throw new AppError("invalid_request");
      const input = (body["recipient"] ?? {}) as ParticipantInput;
      const [p] = cleanParticipants(
        [{ ...input, authLevel: (job.options as { authLevel: AuthLevel }).authLevel }],
        false,
      );
      const before = item.data as Record<string, unknown>;
      const match = {
        method: "manual",
        value: "",
        confidence: "green",
        confirmed: true,
        confirmed_by: caller.user.id,
        confirmed_at: new Date().toISOString(),
      };
      await admin
        .from("bulk_items")
        .update({
          data: {
            ...before,
            name: p!.name,
            email: p!.email,
            cpf: p!.cpf,
            noCpf: p!.noCpf,
            phone: p!.phone,
            match,
          },
          match,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      await admin.rpc("write_audit_as", {
        org: job.organization_id,
        actor: caller.user.id,
        act: "bulk.item_reassigned",
        ent: "bulk_job",
        ent_id: job.id,
        payload: { row, from: before["email"] ?? null, to: p!.email },
      });
      return json({ ok: true }, 200, origin);
    }

    // Salvar a configuração do lote como Processo MDSign ("Fazer de novo").
    if (action === "save-process") {
      const name = String(body["name"] ?? "")
        .trim()
        .slice(0, 160);
      if (name.length < 2) throw new AppError("invalid_request");
      const opts = job.options as Record<string, unknown>;
      const { data: full } = await admin
        .from("bulk_jobs")
        .select("split")
        .eq("id", job.id)
        .single();
      const config = {
        // Lote de origem: a página Processos sabe quais envios já viraram processo.
        jobId: job.id,
        source: job.source,
        templateId: job.template_id,
        split: full?.split ?? {},
        options: {
          authLevel: opts["authLevel"],
          locale: opts["locale"],
          message: opts["message"],
          reminders: opts["reminders"],
          marks: opts["marks"],
          docName: opts["docName"],
          rolePeople: opts["rolePeople"],
        },
      };
      const { data: created, error } = await caller.asUser
        .from("processes")
        .insert({
          organization_id: job.organization_id,
          created_by: caller.user.id,
          name,
          kind: job.source === "pdf" ? "bulk_pdf" : "bulk_template",
          config,
        })
        .select("id")
        .single();
      if (error || !created) throw new AppError("forbidden", 403);
      return json({ processId: created.id }, 200, origin);
    }

    if (action === "cancel") {
      if (job.status === "done" || job.status === "canceled") throw new AppError("bulk_finished");
      await admin.from("bulk_jobs").update({ status: "canceled" }).eq("id", job.id);
      // Lote cancelado: as partes do PDF (dados pessoais) não serão usadas.
      if (job.source_folder) await removeBulkFolder(job.source_folder).catch(() => undefined);
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
