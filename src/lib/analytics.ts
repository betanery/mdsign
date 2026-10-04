/**
 * Camada de analytics independente de ferramenta. Os eventos vão para
 * window.dataLayer (GTM/GA4) e, se existir, para gtag. Trocar de ferramenta
 * significa mudar só este arquivo.
 */

export type AnalyticsEvent =
  | "cta_comece_gratis"
  | "cta_conheca_planos"
  | "cta_conheca_plataforma"
  | "plan_select"
  | "cta_assinar_plano"
  | "cta_fale_especialista"
  | "cta_documentacao_api"
  | "cta_entrar"
  | "form_submit"
  | "faq_open"
  // App (Fase 2, PRD §49)
  | "signup"
  | "organization_created"
  | "member_invited";

type Params = Record<string, string | number | boolean | undefined>;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const UTM_STORAGE_KEY = "mdsign_utm";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Guarda as UTMs da primeira visita da sessão para anexar aos eventos e leads. */
export function captureUtm(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) utm[key] = value;
  }
  if (Object.keys(utm).length === 0) return;
  try {
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm));
  } catch {
    // armazenamento indisponível (modo privado etc.)
  }
}

export function getUtm(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(UTM_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function track(event: AnalyticsEvent, params: Params = {}): void {
  if (typeof window === "undefined") return;
  const payload = { ...getUtm(), ...params };
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ event, ...payload });
  window.gtag?.("event", event, payload);
  if (import.meta.env.DEV) console.debug("[analytics]", event, payload);
}
