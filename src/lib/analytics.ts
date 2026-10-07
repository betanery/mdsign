/**
 * Camada de analytics independente de ferramenta. Os eventos vão para
 * window.dataLayer (GTM/GA4) e, se existir, para gtag. Trocar de ferramenta
 * significa mudar só este arquivo.
 */

import { siteConfig } from "@/config/site";

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

const ATTR_KEY = "mdsign_attr";
const SESSION_KEY = "mdsign_session";

/** Origem da primeira visita da sessão (first-touch): UTMs, página de entrada, referência. */
export type Attribution = Partial<Record<(typeof UTM_KEYS)[number], string>> & {
  landing_page?: string;
  referrer?: string;
  campaign?: string;
  first_seen_at?: string;
};

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // armazenamento indisponível (modo privado etc.)
  }
}

/**
 * Guarda as UTMs e a origem da primeira visita da sessão para anexar aos eventos, aos leads e
 * ao cadastro. Nada de dado pessoal; a referência guarda só domínio e caminho.
 */
export function captureUtm(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) utm[key] = value.slice(0, 160);
  }
  if (Object.keys(utm).length) writeJson(UTM_STORAGE_KEY, utm);
  if (readJson<Attribution>(ATTR_KEY)) return;
  let referrer: string | undefined;
  try {
    const r = document.referrer ? new URL(document.referrer) : null;
    if (r && r.origin !== window.location.origin) referrer = `${r.host}${r.pathname}`.slice(0, 300);
  } catch {
    referrer = undefined;
  }
  writeJson(ATTR_KEY, {
    ...utm,
    landing_page: window.location.pathname.slice(0, 300),
    ...(referrer ? { referrer } : {}),
    first_seen_at: new Date().toISOString(),
  } satisfies Attribution);
}

/** A landing de campanha marca a variante (ex.: "assinar-pdf-gratis") na origem da sessão. */
export function setCampaign(campaign: string): void {
  if (typeof window === "undefined") return;
  const attr = readJson<Attribution>(ATTR_KEY) ?? {};
  if (!attr.campaign) writeJson(ATTR_KEY, { ...attr, campaign: campaign.slice(0, 120) });
}

export function getAttribution(): Attribution {
  if (typeof window === "undefined") return {};
  return { ...(readJson<Attribution>(ATTR_KEY) ?? {}), ...getUtm() };
}

/** Código anônimo da sessão (some ao fechar a aba): conta visitas, não pessoas. */
export function sessionId(): string {
  const existing = typeof window === "undefined" ? null : sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  try {
    sessionStorage.setItem(SESSION_KEY, id);
  } catch {
    // sem armazenamento: cada evento vira uma sessão
  }
  return id;
}

export type GrowthEvent = "acquisition_page_viewed" | "acquisition_cta_clicked" | "signup_started";

/**
 * Eventos do funil para o painel do MDSign (sem cookie, sem dado pessoal). Também seguem para o
 * dataLayer. Falha de rede é ignorada: o evento é só medição.
 */
export function trackGrowth(event: GrowthEvent, params: Record<string, string> = {}): void {
  if (typeof window === "undefined") return;
  const attr = getAttribution();
  const data: Record<string, string> = { page: window.location.pathname, ...params };
  for (const k of [...UTM_KEYS, "campaign"] as const) {
    const v = attr[k];
    if (v) data[k] = v;
  }
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ event, ...data });
  const endpoint = siteConfig.leadEndpoint.replace(/lead-submit$/, "growth-track");
  void fetch(endpoint, {
    method: "POST",
    // text/plain evita a requisição prévia de CORS; a função lê o JSON do corpo.
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ event, session: sessionId(), data }),
    keepalive: true,
  }).catch(() => undefined);
  if (import.meta.env.DEV) console.debug("[growth]", event, data);
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
