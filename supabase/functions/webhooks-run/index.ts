// Entrega dos webhooks de saída (a cada minuto, pelo pg_cron, só quando há entregas vencidas).

import { deliverDue } from "../_shared/webhooks.ts";

const SECRET = Deno.env.get("CRON_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method !== "POST" || !SECRET || req.headers.get("x-cron-secret") !== SECRET)
    return new Response(null, { status: 401 });
  const result = await deliverDue(100);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
