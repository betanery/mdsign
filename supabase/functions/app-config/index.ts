// Capacidades do motor para o app: quais níveis de autenticação podem ser oferecidos (PRD §10).

import { asaasEnv } from "../_shared/asaas.ts";
import { admin, requireUser } from "../_shared/auth.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import { emailConfigured, emailTestMode } from "../_shared/email.ts";
import { availableAuthLevels, identifierOptional } from "../_shared/participants.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    const caller = await requireUser(req);
    // Quórum em grupos: liberado pela política ou, durante a homologação, só para o Super Admin.
    const [{ data: policy }, { data: platformAdmin }] = await Promise.all([
      admin.from("policies").select("active").eq("id", "quorum_groups").maybeSingle(),
      admin.from("platform_admins").select("user_id").eq("user_id", caller.user.id).maybeSingle(),
    ]);
    return json(
      {
        authLevels: availableAuthLevels(),
        // Participantes sem CPF dependem de General.CountryIdentifierMode=Nullable no motor.
        foreignSigners: identifierOptional,
        // WhatsApp do MDSign (provedor configurado nos segredos; só o sim/não vem para o app).
        whatsappConfigured: Boolean(Deno.env.get("BOTCONVERSA_API_KEY")),
        quorumGroups: Boolean(policy?.active || platformAdmin),
        // E-mail próprio (Resend): "test" = remetente de teste, só para o Super Admin.
        ownEmail: !emailConfigured()
          ? "off"
          : emailTestMode()
            ? platformAdmin
              ? "test"
              : "off"
            : "on",
        // Ambiente de cobrança (só o nome, nunca a chave); null = cobrança não configurada.
        billingEnvironment: (() => {
          try {
            return asaasEnv();
          } catch {
            return null;
          }
        })(),
      },
      200,
      origin,
    );
  } catch (error) {
    return handleError(error, origin);
  }
});
