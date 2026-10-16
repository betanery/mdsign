// Cliente do Asaas (motor financeiro). Só o servidor fala com o Asaas: a chave fica nos
// segredos das funções (ASAAS_API_KEY) e nunca vai para o navegador.
//
// TRAVA DE PRODUÇÃO: nesta fase só o Sandbox é aceito. ASAAS_ENV precisa ser "sandbox";
// "production" é recusado de propósito, e qualquer outro valor (ou ausência) também falha.
// Não há fallback automático para produção. Para ativar produção no futuro, ver
// docs/asaas-producao.md (exige autorização explícita e mudança de código revisada).

import { fetchWithTimeout, maskPersonal, NetError } from "./net.ts";
import { AppError } from "./http.ts";

export type AsaasEnv = "sandbox" | "production";

const BASE_URLS: Record<AsaasEnv, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
};

/** Produção desligada nesta fase (mude só com autorização explícita). */
const PRODUCTION_ENABLED = false;

/** Ambiente configurado, validado. Lança erro seguro se estiver errado. */
export function asaasEnv(): AsaasEnv {
  const env = (Deno.env.get("ASAAS_ENV") ?? "").trim();
  if (env === "sandbox") return "sandbox";
  if (env === "production") {
    if (!PRODUCTION_ENABLED) throw new AppError("billing_production_disabled", 503);
    return "production";
  }
  throw new AppError("billing_not_configured", 503);
}

function apiKey(env: AsaasEnv): string {
  const key = (Deno.env.get("ASAAS_API_KEY") ?? "").trim();
  if (!key) throw new AppError("billing_not_configured", 503);
  // Chave de produção no Sandbox (ou o contrário) é erro de configuração: não chama o Asaas.
  if (env === "sandbox" && key.startsWith("$aact_prod_"))
    throw new AppError("billing_not_configured", 503);
  if (env === "production" && key.startsWith("$aact_hmlg_"))
    throw new AppError("billing_not_configured", 503);
  return key;
}

export function webhookToken(): string {
  return (Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "").trim();
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const env = asaasEnv();
  let res: Response;
  try {
    res = await fetchWithTimeout(`${BASE_URLS[env]}${path}`, {
      method,
      headers: {
        access_token: apiKey(env),
        "Content-Type": "application/json",
        "User-Agent": "MDSign",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (e) {
    console.error("asaas", method, path.split("?")[0], e instanceof NetError ? e.kind : e);
    throw new AppError("billing_unavailable", 502, { errors: null });
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    // O Asaas devolve { errors: [{ code, description }] }: registra e devolve um código estável.
    console.error(
      "asaas",
      method,
      path.split("?")[0],
      res.status,
      maskPersonal(text.slice(0, 500)),
    );
    throw new AppError(res.status >= 500 ? "billing_unavailable" : "billing_rejected", 502, {
      errors: Array.isArray(data?.errors)
        ? data.errors.map((e: { code?: string; description?: string }) => ({
            code: e.code ?? null,
            description: e.description?.slice(0, 200) ?? null,
          }))
        : null,
    });
  }
  return data as T;
}

export type AsaasCustomer = { id: string; externalReference?: string | null };
export type AsaasSubscription = {
  id: string;
  customer: string;
  value: number;
  nextDueDate: string | null;
  cycle: string;
  status: string;
  deleted?: boolean;
  checkoutSession?: string | null;
  externalReference?: string | null;
};
export type AsaasPayment = {
  id: string;
  customer: string;
  subscription?: string | null;
  value: number;
  status: string;
  billingType?: string | null;
  dueDate?: string | null;
  paymentDate?: string | null;
  confirmedDate?: string | null;
  invoiceUrl?: string | null;
  externalReference?: string | null;
  checkoutSession?: string | null;
};

export const asaas = {
  findCustomer: (externalReference: string) =>
    call<{ data: AsaasCustomer[] }>(
      "GET",
      `/customers?externalReference=${encodeURIComponent(externalReference)}&limit=1`,
    ).then((r) => r.data?.[0] ?? null),
  createCustomer: (c: {
    name: string;
    cpfCnpj: string;
    email?: string | null;
    externalReference: string;
  }) =>
    call<AsaasCustomer>("POST", "/customers", {
      ...c,
      notificationDisabled: false,
    }),
  updateCustomer: (id: string, body: Record<string, unknown>) =>
    call<AsaasCustomer>("POST", `/customers/${id}`, body),
  createCheckout: (body: Record<string, unknown>) =>
    call<{ id: string; link: string }>("POST", "/checkouts", body),
  /** Assinatura recorrente pela API (é assim que o Asaas faz Pix recorrente). */
  createSubscription: (body: Record<string, unknown>) =>
    call<AsaasSubscription>("POST", "/subscriptions", body),
  getSubscription: (id: string) => call<AsaasSubscription>("GET", `/subscriptions/${id}`),
  deleteSubscription: (id: string) => call<{ deleted: boolean }>("DELETE", `/subscriptions/${id}`),
  subscriptionPayments: (id: string) =>
    call<{ data: AsaasPayment[] }>("GET", `/subscriptions/${id}/payments?limit=20`).then(
      (r) => r.data ?? [],
    ),
  listWebhooks: () => call<{ data: { id: string; url: string }[] }>("GET", "/webhooks"),
  createWebhook: (body: Record<string, unknown>) => call<{ id: string }>("POST", "/webhooks", body),
  updateWebhook: (id: string, body: Record<string, unknown>) =>
    call<{ id: string }>("PUT", `/webhooks/${id}`, body),
};
