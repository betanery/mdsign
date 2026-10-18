// Validação pública de documentos (página /validar): pelo código impresso no documento ou
// enviando o PDF assinado. Sem login; limite de tentativas por endereço; resposta sem dados
// pessoais além do nome de quem assinou (ver _shared/validation.ts).

import { admin } from "../_shared/auth.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import { hashToken } from "../_shared/notifications.ts";
import { signdoc } from "../_shared/signdoc.ts";
import {
  cleanKey,
  looksLikePdf,
  publicDocument,
  publicSigners,
  type PublicSigner,
} from "../_shared/validation.ts";

const WINDOW_MINUTES = 10;
const MAX_PER_IP = 20;

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    if (!corsHeaders(origin)["Access-Control-Allow-Origin"])
      throw new AppError("origin_not_allowed", 403);

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim();
    const ipHash = ip ? await hashToken(ip) : null;
    if (ipHash) {
      const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
      const { count } = await admin
        .from("validation_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", since);
      if ((count ?? 0) >= MAX_PER_IP) throw new AppError("rate_limited", 429);
    }
    const record = (kind: "code" | "file", found: boolean) =>
      admin.from("validation_attempts").insert({ ip_hash: ipHash, kind, found });

    // Enviando o PDF (multipart, campo "file").
    if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      const form = await req.formData().catch(() => null);
      const file = form?.get("file");
      if (!(file instanceof File)) throw new AppError("invalid_file", 400);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!looksLikePdf(bytes)) throw new AppError("invalid_file", 400);
      let signers: PublicSigner[];
      try {
        signers = publicSigners(
          await signdoc.validateFile(
            new File([bytes], "documento.pdf", { type: "application/pdf" }),
          ),
        );
      } catch (e) {
        if (e instanceof AppError && e.code === "engine_rejected") signers = [];
        else throw e;
      }
      await record("file", signers.length > 0);
      return json({ found: signers.length > 0, document: null, signers }, 200, origin);
    }

    // Pelo código de validação.
    const body = (await req.json().catch(() => ({}))) as { code?: unknown };
    const key = cleanKey(body.code);
    if (!key) throw new AppError("invalid_code", 400);
    try {
      const info = await signdoc.validateByKey(key);
      await record("code", true);
      return json(
        { found: true, document: publicDocument(info), signers: publicSigners(info.signers) },
        200,
        origin,
      );
    } catch (e) {
      // Código inexistente (ou de outra conta do motor): "não encontrado", sem detalhes.
      if (e instanceof AppError && e.code === "engine_rejected") {
        await record("code", false);
        return json({ found: false, document: null, signers: [] }, 200, origin);
      }
      throw e;
    }
  } catch (e) {
    return handleError(e, origin);
  }
});
