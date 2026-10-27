// Cabeçalhos de segurança de todas as respostas do app (auditoria 16/10/2026, Fase 1 item 1).
//
// CSP: só o que o MDSign usa de verdade — Supabase (dados e funções), SignDoc (cerimônia de
// assinatura em iframe), widget da Lacuna, pdf.js/pdf-lib (cdnjs), ViaCEP e, se configurado,
// Google Tag Manager. 'unsafe-inline' em script-src é exigido pelos scripts de hidratação do
// TanStack Start e pelo script de consentimento no <head>.
// frame-ancestors: ninguém exibe o MDSign dentro de outro site, exceto o editor do Lovable
// (a pré-visualização do projeto é um iframe). Por isso não há X-Frame-Options (ele não aceita
// uma lista de origens).

import { siteConfig } from "@/config/site";

const SIGNDOC = "https://sign.signdocmd.com.br";
const LACUNA_CDN = "https://cdn.lacunasoftware.com";
const CDNJS = "https://cdnjs.cloudflare.com";
const VIACEP = "https://viacep.com.br";
const GTM = siteConfig.gtmId
  ? [
      "https://www.googletagmanager.com",
      "https://*.google-analytics.com",
      "https://*.analytics.google.com",
    ]
  : [];
const LOVABLE_EDITOR = [
  "https://lovable.dev",
  "https://*.lovable.dev",
  "https://*.lovableproject.com",
];

export function contentSecurityPolicy(dev = false) {
  const supabase = (
    import.meta.env.VITE_SUPABASE_URL?.trim() || "https://vrksxqbopteeyeovdwpu.supabase.co"
  ).replace(/\/$/, "");
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", CDNJS, LACUNA_CDN, ...GTM.slice(0, 1)],
    "style-src": ["'self'", "'unsafe-inline'"],
    "font-src": ["'self'", "data:"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "connect-src": [
      "'self'",
      supabase,
      supabase.replace(/^https:/, "wss:"),
      CDNJS,
      VIACEP,
      SIGNDOC,
      ...GTM,
      ...(dev ? ["ws:", "http://localhost:*"] : []),
    ],
    "worker-src": ["'self'", "blob:"],
    "frame-src": [
      "'self'",
      "blob:",
      SIGNDOC,
      ...(GTM.length ? ["https://www.googletagmanager.com"] : []),
    ],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'self'", ...LOVABLE_EDITOR],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

/**
 * Câmera (selfie/prova de vida) e localização (registro da assinatura) só para o próprio site e
 * para a tela de assinatura do SignDoc, que roda num quadro dentro do MDSign.
 */
export const PERMISSIONS_POLICY =
  'camera=(self "https://sign.signdocmd.com.br"), geolocation=(self "https://sign.signdocmd.com.br"), microphone=(), payment=(), usb=(), interest-cohort=()';

/** Acrescenta os cabeçalhos sem alterar o corpo nem o status da resposta. */
export function withSecurityHeaders(response: Response, dev = false): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", contentSecurityPolicy(dev));
  headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
