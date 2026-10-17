// Funcionalidade do plano (navegação progressiva): a decisão é do banco (feature_enabled), não
// da tela. Recurso fora do plano é recusado mesmo com chamada direta à função.

import { admin } from "./auth.ts";
import { AppError } from "./http.ts";

export async function assertFeature(organizationId: string, code: string) {
  const { data, error } = await admin.rpc("feature_enabled", { org: organizationId, code });
  if (error) throw new AppError("internal_error", 500);
  if (!data) throw new AppError("feature_not_in_plan", 403, { feature: code });
}
