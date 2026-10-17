// Eventos de navegação do funil (landing de aquisição e início do cadastro). Público, sem login.
// Só aceita nomes da lista, com código de sessão anônimo (some ao fechar a aba) e origem da
// campanha. Nada de nome, e-mail, CPF ou IP gravado: o IP só serve ao limite, como hash em memória.

import { admin } from "../_shared/auth.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";

const EVENTS = new Set(["acquisition_page_viewed", "acquisition_cta_clicked", "signup_started"]);
const KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "campaign",
  "page",
  "cta",
  "lang",
  // "1" = equipe/homologação (ambiente de teste ou navegador marcado); fica fora das métricas.
  "internal",
] as const;
const PER_IP_PER_MINUTE = 30;
const hits = new Map<string, { n: number; at: number }>();

function limited(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 60_000) {
    hits.set(ip, { n: 1, at: now });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  h.n++;
  return h.n > PER_IP_PER_MINUTE;
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
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim();
    if (ip && limited(ip)) return json({ ok: true }, 200, origin);

    // Comprovante de consentimento de cookies (registro anônimo da escolha).
    if (body["kind"] === "cookie_consent") {
      const consentId = String(body["consentId"] ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(consentId)) throw new AppError("invalid_request");
      await admin.from("cookie_consents").insert({
        consent_id: consentId,
        analytics: body["analytics"] === true,
        marketing: body["marketing"] === true,
        version: Math.min(1000, Math.max(1, Number(body["version"]) || 1)),
        page:
          String(body["page"] ?? "")
            .split("?")[0]!
            .slice(0, 200) || null,
      });
      return json({ ok: true }, 200, origin);
    }

    const event = String(body["event"] ?? "");
    const session = String(body["session"] ?? "");
    if (!EVENTS.has(event) || !/^[A-Za-z0-9_-]{8,64}$/.test(session))
      throw new AppError("invalid_request");

    const raw = (body["data"] ?? {}) as Record<string, unknown>;
    const data: Record<string, string> = {};
    for (const k of KEYS) {
      const v = raw[k];
      if (typeof v === "string" && v.trim()) data[k] = v.trim().slice(0, 160);
    }
    // A página fica sem query string (pode trazer dados de campanha já guardados acima).
    if (data["page"]) data["page"] = data["page"].split("?")[0]!.slice(0, 200);

    await admin.from("growth_events").insert({ event, session_id: session, data });
    return json({ ok: true }, 200, origin);
  } catch (error) {
    return handleError(error, origin);
  }
});
