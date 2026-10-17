// Canal do titular (LGPD art. 18): recebe pedidos com ou sem login e devolve o protocolo.
// Proteções: origem permitida, campo isca contra robôs, limite por IP (hash) e validação.
// Com login, o pedido fica ligado à conta (identidade confirmada se o e-mail for o da conta).

import { admin } from "../_shared/auth.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";

const PER_IP_PER_HOUR = 3;
const RELATIONS = new Set(["user", "signer", "representative", "other"]);
const KINDS = new Set([
  "access",
  "correction",
  "deletion",
  "portability",
  "sharing_info",
  "revoke_consent",
  "opposition",
  "other",
]);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function sha256(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    if (!corsHeaders(origin)["Access-Control-Allow-Origin"])
      throw new AppError("origin_not_allowed", 403);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new AppError("invalid_request");
    }
    // Campo isca: robô preenche; responde como sucesso sem gravar.
    if (String(body["website"] ?? "")) return json({ protocol: "LGPD-0000-000000" }, 200, origin);

    const text = (k: string, max: number) =>
      String(body[k] ?? "")
        .trim()
        .slice(0, max);
    const name = text("name", 160);
    const email = text("email", 200).toLowerCase();
    const relation = text("relation", 20);
    const kind = text("kind", 20);
    const org = text("organization", 160);
    const description = text("description", 4000);
    const bad: string[] = [];
    if (name.length < 2) bad.push("name");
    if (!EMAIL.test(email)) bad.push("email");
    if (!RELATIONS.has(relation)) bad.push("relation");
    if (!KINDS.has(kind)) bad.push("kind");
    if (description.length < 10) bad.push("description");
    if (bad.length) throw new AppError("invalid_fields", 422, { fields: bad });

    // Login opcional: se houver token válido, liga o pedido à conta.
    let userId: string | null = null;
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (token) {
      const { data } = await admin.auth.getUser(token);
      userId = data.user?.id ?? null;
    }

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim();
    const ipHash = ip ? await sha256(`titular:${ip}`) : null;
    if (ipHash && !userId) {
      const { count } = await admin
        .from("data_requests")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
      if ((count ?? 0) >= PER_IP_PER_HOUR) throw new AppError("rate_limited", 429);
    }

    const { data: protocol, error } = await admin.rpc("create_data_request", {
      p_user: userId,
      p_name: name,
      p_email: email,
      p_relation: relation,
      p_kind: kind,
      p_org: org || null,
      p_description: description,
      p_ip_hash: ipHash,
    });
    if (error || !protocol) throw new AppError("internal_error", 500);
    return json({ protocol }, 200, origin);
  } catch (error) {
    return handleError(error, origin);
  }
});
