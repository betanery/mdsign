// Entrega dos webhooks de saída (a cada minuto, pelo pg_cron, só quando há entregas vencidas).

import { safeEqual } from "../_shared/net.ts";
import { processNotifications } from "../_shared/notifications.ts";
import { deliverDue } from "../_shared/webhooks.ts";

const SECRET = Deno.env.get("CRON_SECRET") ?? "";

Deno.serve(async (req) => {
  if (
    req.method !== "POST" ||
    !SECRET ||
    !safeEqual(req.headers.get("x-cron-secret") ?? "", SECRET)
  )
    return new Response(null, { status: 401 });
  const result = await deliverDue(100);
  // Fila de notificações (WhatsApp): mesmo agendador, a cada minuto.
  const notifications = await processNotifications(30).catch((e) => {
    console.error("notifications", e);
    return null;
  });
  return new Response(JSON.stringify({ ...result, notifications }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
