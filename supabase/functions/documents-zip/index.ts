// Baixar documentos em lote: um ZIP com os PDFs marcados na lista (assinado, se concluído;
// original, se ainda não). Só documentos que a pessoa vê (RLS). No máximo 30 por vez e 100 MB.
// O que não der para incluir (Cedro fora do prazo, falha do motor) entra no LEIA-ME.txt.

import { admin, requireUser } from "../_shared/auth.ts";
import { AppError, corsHeaders, handleError } from "../_shared/http.ts";
import { fetchWithTimeout } from "../_shared/net.ts";
import { signdoc } from "../_shared/signdoc.ts";
import { zip } from "../_shared/zip.ts";

const MAX_DOCS = 30;
const MAX_BYTES = 100 * 1024 * 1024;

// Mesmo nome de arquivo da exportação da conta (sem acento nem símbolos).
const safeName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80) || "documento";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    const caller = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      documentIds?: unknown;
      version?: unknown;
    };
    const ids = [...new Set(Array.isArray(body.documentIds) ? body.documentIds.map(String) : [])];
    if (!ids.length) throw new AppError("invalid_request");
    if (ids.length > MAX_DOCS) throw new AppError("too_many_documents", 422, { max: MAX_DOCS });
    const printable = body.version === "printable";

    // Leitura com a identidade do usuário: o que o RLS não deixa ver não entra no ZIP.
    const { data: docs } = await caller.asUser
      .from("documents")
      .select("id, name, status, created_at, organization_id, engine_document_id")
      .in("id", ids)
      .is("deleted_at", null);
    if (!docs?.length) throw new AppError("document_not_found", 404);

    const files: { name: string; data: Uint8Array }[] = [];
    const skipped: string[] = [];
    const used = new Set<string>();
    let total = 0;
    for (const d of docs) {
      try {
        const { data: until } = await admin.rpc("document_available_until", { doc: d.id });
        if (until && new Date(until as string).getTime() < Date.now()) {
          skipped.push(`${d.name}: fora do prazo de consulta do plano grátis`);
          continue;
        }
        const type = printable
          ? "PrinterFriendlyVersion"
          : d.status === "concluded"
            ? "Signatures"
            : "Original";
        const ticket = await signdoc.ticket(d.engine_document_id, type);
        const url = ticket.location.startsWith("http")
          ? ticket.location
          : `${signdoc.baseUrl}${ticket.location}`;
        const res = await fetchWithTimeout(url);
        if (!res.ok) throw new Error(String(res.status));
        const data = new Uint8Array(await res.arrayBuffer());
        if (total + data.length > MAX_BYTES) {
          skipped.push(`${d.name}: o ZIP passaria de 100 MB; baixe este separado`);
          continue;
        }
        total += data.length;
        let base = `${d.created_at.slice(0, 10)}_${safeName(d.name)}`;
        for (let i = 2; used.has(base); i++)
          base = `${d.created_at.slice(0, 10)}_${safeName(d.name)}_${i}`;
        used.add(base);
        files.push({ name: `${base}.pdf`, data });
      } catch (e) {
        console.error("zip", d.id, e);
        skipped.push(`${d.name}: não foi possível baixar agora; tente de novo`);
      }
    }
    const missing = ids.length - docs.length;
    if (missing > 0) skipped.push(`${missing} documento(s) sem acesso ou excluído(s)`);
    if (!files.length) throw new AppError("download_failed", 502);
    if (skipped.length)
      files.push({
        name: "LEIA-ME.txt",
        data: new TextEncoder().encode(
          `Alguns documentos não entraram neste arquivo:\r\n\r\n${skipped.join("\r\n")}\r\n`,
        ),
      });

    for (const org of new Set(docs.map((d) => d.organization_id as string)))
      await admin.rpc("write_audit_as", {
        org,
        actor: caller.user.id,
        act: "documents.downloaded_batch",
        ent: "organization",
        ent_id: org,
        payload: { documents: files.length - (skipped.length ? 1 : 0), printable },
      });

    return new Response(zip(files) as BodyInit, {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="mdsign-documentos.zip"`,
      },
    });
  } catch (e) {
    return handleError(e, origin);
  }
});
