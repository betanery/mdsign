// Recebe os webhooks do SignDoc (PRD §4 e §27). Regras da Lacuna: validar o token do cabeçalho,
// responder rápido, deduplicar, e tratar o payload como aviso — o estado vem da API (syncDocument).

import { admin } from "../_shared/auth.ts";
import { processEngineEvent } from "../_shared/engine-events.ts";

const TOKEN = Deno.env.get("SIGNDOC_WEBHOOK_TOKEN") ?? "";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length || !a) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type Payload = {
  type?: string;
  data?: Record<string, unknown> & { id?: string; documents?: { id?: string }[] };
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const auth =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.headers.get("x-api-key") ??
    "";
  if (!TOKEN || !safeEqual(auth, TOKEN)) return new Response(null, { status: 401 });

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const type = String(payload.type ?? "unknown");
  const data = payload.data ?? {};
  const ids = data.id
    ? [String(data.id)]
    : (data.documents ?? []).map((d) => String(d.id ?? "")).filter(Boolean);
  const dedupeKey = `${type}:${ids.join(",")}:${String(data.updateDate ?? "")}:${JSON.stringify(data.signature ?? data.refusal ?? "")}`;

  const { data: row, error } = await admin
    .from("engine_webhook_events")
    .insert({ dedupe_key: dedupeKey, type, engine_document_id: ids[0] ?? null, payload })
    .select("id")
    .maybeSingle();
  // Repetido (o Signer reenvia até 10 vezes): já registrado, só confirma.
  if (error?.code === "23505") return new Response(null, { status: 200 });
  if (error || !row) return new Response(null, { status: 500 });

  await processEngineEvent({
    id: row.id,
    type,
    payload: payload as Record<string, unknown>,
    attempts: 0,
  });
  return new Response(null, { status: 200 });
});
