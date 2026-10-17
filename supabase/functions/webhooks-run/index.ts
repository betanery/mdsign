// Entrega dos webhooks de saída (a cada minuto, pelo pg_cron, só quando há entregas vencidas).

import { processPendingEngineEvents } from "../_shared/engine-events.ts";
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
  // Webhooks do motor que falharam: novas tentativas com espera crescente.
  const engine = await processPendingEngineEvents(20).catch((e) => {
    console.error("engine events", e);
    return null;
  });
  return new Response(JSON.stringify({ ...result, notifications, engine }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
