// Preferências de cookies (LGPD). Necessários sempre ligados; análise e marketing só com
// consentimento. O Google Tag Manager só é carregado depois do consentimento, e o Consent Mode
// do Google começa negado (script no <head>, em src/routes/__root.tsx).

import { siteConfig } from "@/config/site";
import { syncSavedAttribution } from "@/lib/attribution-store";

export const CONSENT_KEY = "mdsign_consent";
export const CONSENT_VERSION = 1;
export const OPEN_PREFS_EVENT = "mdsign:cookie-preferences";

export type Consent = {
  v: number;
  analytics: boolean;
  marketing: boolean;
  at: string;
  /** Código anônimo deste navegador, para o comprovante guardado no servidor. */
  id?: string;
};

declare global {
  interface Window {
    __mdsignLoadGtm?: () => void;
  }
}

export function readConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const c = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "null") as Consent | null;
    return c && c.v === CONSENT_VERSION ? c : null;
  } catch {
    return null;
  }
}

export function saveConsent(choice: { analytics: boolean; marketing: boolean }) {
  const previous = readConsent();
  const c: Consent = {
    v: CONSENT_VERSION,
    ...choice,
    at: new Date().toISOString(),
    id: previous?.id ?? crypto.randomUUID(),
  };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(c));
  } catch {
    // sem armazenamento: a escolha vale só para esta página
  }
  const g = (v: boolean) => (v ? "granted" : "denied");
  window.gtag?.("consent", "update", {
    analytics_storage: g(c.analytics),
    ad_storage: g(c.marketing),
    ad_user_data: g(c.marketing),
    ad_personalization: g(c.marketing),
  });
  if (c.analytics || c.marketing) window.__mdsignLoadGtm?.();
  // Origem da campanha: guardada por 30 dias só com consentimento de análise; sem ele, apagada.
  syncSavedAttribution(c.analytics);
  // Comprovante no servidor (anônimo). Falha de rede não impede a escolha valer no navegador.
  const endpoint = siteConfig.leadEndpoint.replace(/lead-submit$/, "growth-track");
  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      kind: "cookie_consent",
      consentId: c.id,
      analytics: c.analytics,
      marketing: c.marketing,
      version: c.v,
      page: window.location.pathname,
    }),
    keepalive: true,
  }).catch(() => undefined);
  return c;
}

/** Abre o painel de preferências (link "Preferências de cookies" no rodapé). */
export function openCookiePreferences() {
  window.dispatchEvent(new Event(OPEN_PREFS_EVENT));
}

/** Script do <head>: Consent Mode negado por padrão e GTM carregado só com consentimento. */
export function consentHeadScript(gtmId: string) {
  const id = JSON.stringify(gtmId);
  return `window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){dataLayer.push(arguments)};
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'granted',security_storage:'granted',wait_for_update:500});
window.__mdsignLoadGtm=function(){if(window.__mdsignGtm)return;window.__mdsignGtm=1;(function(w,d,s,l,i){w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${id});};
try{var c=JSON.parse(localStorage.getItem('${CONSENT_KEY}')||'null');if(c&&c.v===${CONSENT_VERSION}){var g=function(v){return v?'granted':'denied'};gtag('consent','update',{analytics_storage:g(c.analytics),ad_storage:g(c.marketing),ad_user_data:g(c.marketing),ad_personalization:g(c.marketing)});if(c.analytics||c.marketing)window.__mdsignLoadGtm();}}catch(e){}`;
}
