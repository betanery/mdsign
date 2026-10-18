// Super Admin: envia UMA mensagem fixa de teste pelo WhatsApp (BotConversa) para validar a
// integração antes de liberar o recurso nos planos. Exige confirmação; não usa dados de cliente.

import { admin, requireUser } from "../_shared/auth.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import { sendBotConversa, whatsappConfigured } from "../_shared/notifications.ts";
import { normalizePhone } from "../_shared/participants.ts";

const TEST_MESSAGE =
  "Teste de integração MDSign com BotConversa. Se você recebeu esta mensagem, o envio por WhatsApp está funcionando.";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    const caller = await requireUser(req);
    const { data: isAdmin } = await caller.asUser.rpc("is_platform_admin");
    if (!isAdmin) throw new AppError("forbidden", 403);
    if (!whatsappConfigured()) throw new AppError("whatsapp_not_configured", 503);
    const body = (await req.json().catch(() => ({}))) as { phone?: string; confirmed?: boolean };
    if (body.confirmed !== true) throw new AppError("confirmation_required", 400);
    const phone = normalizePhone(body.phone);
    if (!phone || phone.startsWith("+") === false || !phone.startsWith("+55"))
      throw new AppError("invalid_phone", 400);
    try {
      await sendBotConversa(phone, caller.profile.full_name ?? "MDSign", TEST_MESSAGE);
    } catch (e) {
      console.error("whatsapp test", (e as Error).message);
      throw new AppError("whatsapp_send_failed", 502, { reason: (e as Error).message });
    }
    await admin.rpc("write_audit_as", {
      org: null,
      actor: caller.user.id,
      act: "whatsapp.test_sent",
      ent: "integration",
      ent_id: "botconversa",
      payload: { phone_suffix: phone.slice(-4) },
    });
    return json({ ok: true }, 200, origin);
  } catch (e) {
    return handleError(e, origin);
  }
});
