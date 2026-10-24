// Recebe os leads do formulário da landing MDSign e grava em public.leads.
//
// Segredos/variáveis (painel do Supabase → Edge Functions → Secrets):
//   ALLOWED_ORIGINS  domínios que podem enviar, separados por vírgula
//                    ex.: https://mdsign.com.br,http://localhost:5188
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem no ambiente da função.

import { createClient } from "npm:@supabase/supabase-js@2";

const PLANS = ["cedro", "jacaranda", "ipe", "mogno"];
const LOCALES = ["pt", "en", "es"];
const MAX_PER_IP = 5; // envios por IP a cada 10 minutos
const WINDOW_MINUTES = 10;

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && allowedOrigins.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);
  if (!origin || !allowedOrigins.includes(origin)) {
    return json({ error: "origin_not_allowed" }, 403, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }

  // Campo-armadilha: pessoas não veem, robôs preenchem. Finge sucesso.
  if (text(body.website, 200)) return json({ ok: true }, 200, origin);

  const nome = text(body.nome, 120);
  const email = text(body.email, 200)?.toLowerCase() ?? null;
  if (!nome || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "invalid_fields" }, 422, origin);
  }

  const plano = typeof body.plano === "string" && PLANS.includes(body.plano) ? body.plano : null;
  const idioma =
    typeof body.idioma === "string" && LOCALES.includes(body.idioma) ? body.idioma : null;
  const utm =
    body.utm && typeof body.utm === "object" && !Array.isArray(body.utm)
      ? Object.fromEntries(
          Object.entries(body.utm as Record<string, unknown>)
            .filter(([k, v]) => k.startsWith("utm_") && typeof v === "string")
            .slice(0, 5)
            .map(([k, v]) => [k, (v as string).slice(0, 200)]),
        )
      : {};

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ipHash = ip ? await sha256(ip) : null;

  if (ipHash) {
    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if ((count ?? 0) >= MAX_PER_IP) return json({ error: "too_many_requests" }, 429, origin);
  }

  const { error } = await supabase.from("leads").insert({
    nome,
    email,
    telefone: text(body.telefone, 40),
    empresa: text(body.empresa, 160),
    plano,
    idioma,
    mensagem: text(body.mensagem, 2000),
    origem: text(body.source, 80),
    pagina: text(body.page, 500),
    utm,
    ip_hash: ipHash,
  });

  if (error) {
    console.error("lead insert failed", error);
    return json({ error: "internal_error" }, 500, origin);
  }

  return json({ ok: true }, 201, origin);
});
