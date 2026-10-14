// Retenção de arquivos (LGPD, minimização): o MDSign só guarda PDFs enquanto precisa deles.
// - Partes de um lote de PDF (ex.: contracheques) existem só até o documento ser criado no
//   motor de assinatura; o documento assinado fica no motor.
// - Rascunhos e uploads abandonados são apagados depois de um prazo curto.
// Roda de hora em hora junto com os lembretes (reminders-run).

import { admin } from "./auth.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const DRAFT_DAYS = 3; // lote de PDF em rascunho, sem envio
const FAILED_DAYS = 30; // partes de itens com erro, depois do fim do lote (para reenviar)
const ORPHAN_FOLDER_HOURS = 24; // pasta enviada que nunca virou lote
const TEMPLATE_ORPHAN_DAYS = 7; // PDF de modelo nunca salvo (mesmo prazo do rascunho no navegador)

const BULK = "bulk-sources";
const TEMPLATES = "templates";

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

/** Apaga arquivos do armazenamento (em blocos). Devolve quantos foram removidos. */
async function removeFiles(bucket: string, paths: string[]) {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const { data } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
    removed += data?.length ?? 0;
  }
  return removed;
}

/** Arquivos de uma pasta do lote, com a data de envio. */
async function folderFiles(folder: string) {
  const { data } = await admin.storage.from(BULK).list(folder, { limit: 1000 });
  return (data ?? [])
    .filter((f) => f.id)
    .map((f) => ({
      path: `${folder}/${f.name}`,
      createdAt: f.created_at ? new Date(f.created_at).getTime() : Date.now(),
    }));
}

/** Apaga todos os arquivos de uma pasta do lote. */
export async function removeBulkFolder(folder: string) {
  const files = (await folderFiles(folder)).map((f) => f.path);
  return files.length ? removeFiles(BULK, files) : 0;
}

/** Apaga a parte de um item já criado no motor (não é mais necessária). */
export async function removeBulkPart(path: string | undefined) {
  if (path) await removeFiles(BULK, [path]);
}

/** Pastas (organização/lote) e arquivos de primeiro nível do bucket. */
async function listTwoLevels(bucket: string) {
  const out: { path: string; createdAt: number; isFolder: boolean }[] = [];
  const { data: orgs } = await admin.storage.from(bucket).list("", { limit: 1000 });
  for (const org of orgs ?? []) {
    if (org.id) continue; // só pastas de organização
    const { data: items } = await admin.storage
      .from(bucket)
      .list(org.name, { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
    for (const it of items ?? [])
      out.push({
        path: `${org.name}/${it.name}`,
        createdAt: it.created_at ? new Date(it.created_at).getTime() : 0,
        isFolder: !it.id,
      });
  }
  return out;
}

export async function runRetention() {
  const result = { draftJobs: 0, finishedJobs: 0, orphanFolders: 0, templateFiles: 0, files: 0 };

  // 1. Lotes de PDF em rascunho abandonados: cancela e apaga as partes.
  const { data: drafts } = await admin
    .from("bulk_jobs")
    .select("id, organization_id, source_folder")
    .eq("source", "pdf")
    .eq("status", "draft")
    .lt("updated_at", ago(DRAFT_DAYS * DAY))
    .limit(50);
  for (const job of drafts ?? []) {
    if (job.source_folder) result.files += await removeBulkFolder(job.source_folder);
    await admin.from("bulk_jobs").update({ status: "canceled" }).eq("id", job.id);
    await admin.rpc("write_audit_as", {
      org: job.organization_id,
      actor: null,
      act: "bulk.expired",
      ent: "bulk_job",
      ent_id: job.id,
      payload: { reason: "draft_abandoned", days: DRAFT_DAYS },
    });
    result.draftJobs++;
  }

  // 2. Lotes encerrados: cancelados (na hora) e concluídos com erros (após o prazo de reenvio).
  for (const [status, olderThan] of [
    ["canceled", 0],
    ["done", FAILED_DAYS * DAY],
  ] as const) {
    const { data: jobs } = await admin
      .from("bulk_jobs")
      .select("id, source_folder")
      .eq("source", "pdf")
      .eq("status", status)
      .not("source_folder", "is", null)
      .lt("updated_at", ago(olderThan))
      .limit(50);
    for (const job of jobs ?? []) {
      const n = await removeBulkFolder(job.source_folder!);
      if (n) {
        result.files += n;
        result.finishedJobs++;
      }
    }
  }

  // 2b. Lotes concluídos recentes: as partes dos itens já enviados ao motor saem agora
  // (inclui lotes anteriores a esta regra); as dos itens com erro ficam para reenvio.
  const { data: recent } = await admin
    .from("bulk_jobs")
    .select("id")
    .eq("source", "pdf")
    .eq("status", "done")
    .gte("updated_at", ago(FAILED_DAYS * DAY))
    .limit(50);
  for (const job of recent ?? []) {
    const { data: sent } = await admin
      .from("bulk_items")
      .select("data->>part")
      .eq("job_id", job.id)
      .eq("status", "sent")
      .not("document_id", "is", null);
    const parts = (sent ?? [])
      .map((r) => (r as { part?: string | null }).part)
      .filter((p): p is string => Boolean(p));
    if (parts.length) result.files += await removeFiles(BULK, parts);
  }

  // 3. Pastas de lote enviadas que nunca viraram lote (a pessoa saiu no meio).
  const folders = (await listTwoLevels(BULK)).filter((f) => f.isFolder);
  if (folders.length) {
    const { data: known } = await admin
      .from("bulk_jobs")
      .select("source_folder")
      .in(
        "source_folder",
        folders.map((f) => f.path),
      );
    const used = new Set((known ?? []).map((j) => j.source_folder));
    for (const folder of folders) {
      if (used.has(folder.path)) continue;
      // Pastas não têm data: só apaga se até o arquivo mais novo for antigo (envio em andamento
      // ou lote prestes a ser criado ficam intactos).
      const inside = await folderFiles(folder.path);
      const newest = Math.max(0, ...inside.map((f) => f.createdAt));
      if (!inside.length || newest > Date.now() - ORPHAN_FOLDER_HOURS * HOUR) continue;
      result.files += await removeFiles(
        BULK,
        inside.map((f) => f.path),
      );
      result.orphanFolders++;
    }
  }

  // 4. PDFs de modelo enviados e nunca salvos como modelo.
  const files = (await listTwoLevels(TEMPLATES)).filter(
    (f) => !f.isFolder && f.createdAt && f.createdAt < Date.now() - TEMPLATE_ORPHAN_DAYS * DAY,
  );
  if (files.length) {
    const { data: known } = await admin
      .from("templates")
      .select("file_path")
      .in(
        "file_path",
        files.map((f) => f.path),
      );
    const used = new Set((known ?? []).map((t) => t.file_path));
    const orphans = files.filter((f) => !used.has(f.path)).map((f) => f.path);
    result.templateFiles = orphans.length ? await removeFiles(TEMPLATES, orphans) : 0;
    result.files += result.templateFiles;
  }

  return result;
}

/** Conta encerrada há 60 dias: apaga os arquivos da organização nos dois buckets. */
async function removeOrgFiles(org: string) {
  let removed = 0;
  for (const bucket of [BULK, TEMPLATES]) {
    const { data: items } = await admin.storage.from(bucket).list(org, { limit: 1000 });
    const files: string[] = [];
    for (const it of items ?? []) {
      if (it.id) files.push(`${org}/${it.name}`);
      else {
        const { data: inner } = await admin.storage
          .from(bucket)
          .list(`${org}/${it.name}`, { limit: 1000 });
        for (const f of inner ?? []) if (f.id) files.push(`${org}/${it.name}/${f.name}`);
      }
    }
    if (files.length) removed += await removeFiles(bucket, files);
  }
  return removed;
}

/**
 * 60º dia após o encerramento: apaga arquivos e dados operacionais. Documentos, participantes,
 * eventos, auditoria e cobrança ficam como registro; os PDFs assinados ficam no motor.
 */
export async function runAccountPurge() {
  const { data: orgs } = await admin
    .from("organizations")
    .select("id")
    .lte("purge_after", new Date().toISOString())
    .is("purged_at", null)
    .limit(20);
  let purged = 0;
  for (const o of orgs ?? []) {
    try {
      await removeOrgFiles(o.id as string);
      const { error } = await admin.rpc("purge_organization", { org: o.id });
      if (error) throw error;
      purged++;
    } catch (e) {
      console.error("purge", o.id, e);
    }
  }
  return purged;
}
