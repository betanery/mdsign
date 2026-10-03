/**
 * Configuração pública do site. Tudo que muda por ambiente vem de variáveis
 * VITE_* (ver .env.example). Nunca coloque segredos aqui: tudo que começa com
 * VITE_ vai para o bundle do navegador.
 */

const env = import.meta.env;

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const siteConfig = {
  name: "MDSign",
  company: "Mundo Digital Tech",
  /** URL pública canônica, ex.: https://mdsign.com.br (sem barra final). */
  siteUrl: optional(env.VITE_SITE_URL)?.replace(/\/$/, ""),

  /** Aplicação MDSign (Fase 2). Sem valor, "Entrar" leva ao contato. */
  appUrl: optional(env.VITE_APP_URL),
  /** Cadastro no plano gratuito Cedro. Sem valor, usa appUrl ou o contato. */
  signupUrl: optional(env.VITE_SIGNUP_URL),
  /** Contratação de plano pago (Fase 3: checkout). Recebe ?plano=<id>. */
  checkoutUrl: optional(env.VITE_CHECKOUT_URL),
  /** Documentação da API. Sem valor, aponta para a página /desenvolvedores. */
  apiDocsUrl: optional(env.VITE_API_DOCS_URL),

  /**
   * Edge Function do Supabase que recebe os leads (POST JSON). A URL é
   * pública; a função só aceita os domínios do segredo ALLOWED_ORIGINS.
   */
  leadEndpoint:
    optional(env.VITE_LEAD_ENDPOINT) ??
    "https://vrksxqbopteeyeovdwpu.supabase.co/functions/v1/lead-submit",
  /** Google Tag Manager (opcional). */
  gtmId: optional(env.VITE_GTM_ID),

  contact: {
    phoneDisplay: "+55 61 99573-4098",
    phoneHref: "tel:+5561995734098",
    whatsapp: "5561995734098",
    email: "contato@mundodigitaltech.com.br",
    address: "SCS QD 01 Bl K Sala 1103 - Asa Sul - Brasília/DF",
  },
} as const;

export function absoluteUrl(path = "/"): string | undefined {
  return siteConfig.siteUrl ? `${siteConfig.siteUrl}${path}` : undefined;
}
