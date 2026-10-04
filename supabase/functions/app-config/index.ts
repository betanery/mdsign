// Capacidades do motor para o app: quais níveis de autenticação podem ser oferecidos (PRD §10).

import { requireUser } from "../_shared/auth.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import { availableAuthLevels, identifierOptional } from "../_shared/participants.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    await requireUser(req);
    return json(
      {
        authLevels: availableAuthLevels(),
        // Participantes sem CPF dependem de General.CountryIdentifierMode=Nullable no motor.
        foreignSigners: identifierOptional,
      },
      200,
      origin,
    );
  } catch (error) {
    return handleError(error, origin);
  }
});
