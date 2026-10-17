/**
 * Camada de analytics independente de ferramenta. Os eventos vão para
 * window.dataLayer (GTM/GA4) e, se existir, para gtag. Trocar de ferramenta
 * significa mudar só este arquivo.
 */

import { siteConfig } from "@/config/site";
import { readConsent } from "@/lib/consent";
import { ATTR_KEY, LAST_KEY, SAVED_KEY, syncSavedAttribution } from "@/lib/attribution-store";

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

const SESSION_KEY = "mdsign_session";
const INTERNAL_KEY = "mdsign_internal";

/** Uma origem identificável: UTMs, página de entrada, referência externa e quando. */
export type Touch = Partial<Record<(typeof UTM_KEYS)[number], string>> & {
  landing_page?: string;
  referrer?: string;
  seen_at?: string;
};

/** Primeira origem (first-touch) da sessão, mais a variante da landing de campanha. */
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

/** Cópia guardada com consentimento (até ATTRIBUTION_DAYS); vencida ou ausente = null. */
function readSaved(): { first: Attribution | null; last: Touch | null } | null {
  if (!readConsent()?.analytics) return null;
  try {
    const v = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "null") as {
      first: Attribution | null;
      last: Touch | null;
      exp: number;
    } | null;
    if (!v || !(v.exp > Date.now())) return null;
    return v;
  } catch {
    return null;
  }
}

/** Equipe e homologação: ambientes de teste ou o navegador marcado com ?interno=1. */
export function isInternalTraffic(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  if (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.endsWith(".lovableproject.com") ||
    h.endsWith(".lovable.dev") ||
    h.startsWith("id-preview--")
  )
    return true;
  try {
    return localStorage.getItem(INTERNAL_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Guarda a origem da visita para anexar aos eventos, aos leads e ao cadastro:
 * - primeira origem (first-touch): a primeira identificável; nunca é sobrescrita;
 * - última origem (last-touch): a mais recente que trouxe UTM ou referência externa.
 * Navegação interna e acesso direto não criam origem (não se presume tráfego orgânico).
 * Nada de dado pessoal; a referência guarda só domínio e caminho; sem fingerprinting.
 */
export function captureUtm(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  // Marca/desmarca este navegador como da equipe (fica fora das métricas).
  try {
    if (params.get("interno") === "1") localStorage.setItem(INTERNAL_KEY, "1");
    if (params.get("interno") === "0") localStorage.removeItem(INTERNAL_KEY);
  } catch {
    // sem armazenamento
  }
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) utm[key] = value.slice(0, 160);
  }
  if (Object.keys(utm).length) writeJson(UTM_STORAGE_KEY, utm);
  let referrer: string | undefined;
  try {
    const r = document.referrer ? new URL(document.referrer) : null;
    if (r && r.origin !== window.location.origin) referrer = `${r.host}${r.pathname}`.slice(0, 300);
  } catch {
    referrer = undefined;
  }
  const now = new Date().toISOString();
  // Convite, link seguro e formulário têm código de acesso no caminho: não sai do navegador.
  const landing = window.location.pathname
    .replace(/\/(invite|s|f)\/[^/]+/, "/$1/:codigo")
    .slice(0, 300);
  const saved = readSaved();

  // Última origem: só quando esta visita traz UTM ou referência externa.
  if (Object.keys(utm).length || referrer) {
    writeJson(LAST_KEY, {
      ...utm,
      landing_page: landing,
      ...(referrer ? { referrer } : {}),
      seen_at: now,
    } satisfies Touch);
  } else if (!readJson<Touch>(LAST_KEY) && saved?.last) {
    writeJson(LAST_KEY, saved.last);
  }

  // Primeira origem: a guardada (com consentimento) ou a desta sessão; nunca sobrescreve.
  if (!readJson<Attribution>(ATTR_KEY)) {
    writeJson(
      ATTR_KEY,
      saved?.first ??
        ({
          ...utm,
          landing_page: landing,
          ...(referrer ? { referrer } : {}),
          first_seen_at: now,
        } satisfies Attribution),
    );
  }
  syncSavedAttribution(Boolean(readConsent()?.analytics));
}

/** A landing de campanha marca a variante (ex.: "assinar-pdf-gratis") na origem da sessão. */
export function setCampaign(campaign: string): void {
  if (typeof window === "undefined") return;
  const attr = readJson<Attribution>(ATTR_KEY) ?? {};
  if (!attr.campaign) writeJson(ATTR_KEY, { ...attr, campaign: campaign.slice(0, 120) });
  syncSavedAttribution(Boolean(readConsent()?.analytics));
}

/** Primeira origem identificável (first-touch). */
export function getAttribution(): Attribution {
  if (typeof window === "undefined") return {};
  return readJson<Attribution>(ATTR_KEY) ?? {};
}

/** Última origem identificável (last-touch), se houver. */
export function getLastTouch(): Touch | null {
  if (typeof window === "undefined") return null;
  return readJson<Touch>(LAST_KEY);
}

/** O que vai no cadastro: primeira e última origem, a sessão (para ligar ao funil) e se é interno. */
export function getAcquisitionPayload() {
  const last = getLastTouch();
  return {
    ...getAttribution(),
    ...(last ? { last } : {}),
    session_id: sessionId(),
    ...(isInternalTraffic() ? { internal: "1" } : {}),
  };
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
  // Campanha da visita atual: UTMs desta sessão (as mais recentes) + variante da landing.
  const current: Record<string, string | undefined> = {
    ...getUtm(),
    campaign: getAttribution().campaign,
  };
  const data: Record<string, string> = { page: window.location.pathname, ...params };
  for (const k of [...UTM_KEYS, "campaign"] as const) {
    const v = current[k];
    if (v) data[k] = v;
  }
  if (isInternalTraffic()) data["internal"] = "1";
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
