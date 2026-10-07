// Descadastro do WhatsApp: o provedor (BotConversa) chama quando a pessoa responde "SAIR".
// Autenticado pelo cabeçalho x-mdsign-whatsapp-secret (sem token na URL).

import { optOut } from "../_shared/notifications.ts";

const SECRET = Deno.env.get("WHATSAPP_WEBHOOK_SECRET") ?? "";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length || !a) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  if (!SECRET || !safeEqual(req.headers.get("x-mdsign-whatsapp-secret") ?? "", SECRET))
    return new Response(null, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const phone = String(body?.["phone"] ?? body?.["telefone"] ?? body?.["subscriber_phone"] ?? "");
  if (!phone) return Response.json({ error: "phone_required" }, { status: 400 });
  const reason = String(body?.["keyword"] ?? body?.["message"] ?? "SAIR").slice(0, 200);
  const orgs = await optOut(phone, reason);
  return Response.json({ ok: true, organizations: orgs });
});
