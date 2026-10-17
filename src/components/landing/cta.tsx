import { forwardRef, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";
import type { PlanId } from "@/content/landing";
import { track, trackGrowth, type AnalyticsEvent } from "@/lib/analytics";
import { useI18n } from "@/i18n";
import { useLeadDialog } from "./lead-dialog";

/**
 * Rótulos padronizados do PRD (seção 18), em messages.cta. Cada CTA resolve o destino pela
 * configuração: com a URL definida vira link; sem ela, abre o formulário de
 * contato — assim nenhum botão fica quebrado na Fase 1.
 */
export type CtaKind = "free" | "plans" | "platform" | "subscribe" | "specialist" | "api" | "login";

const events: Record<CtaKind, AnalyticsEvent> = {
  free: "cta_comece_gratis",
  plans: "cta_conheca_planos",
  platform: "cta_conheca_plataforma",
  subscribe: "cta_assinar_plano",
  specialist: "cta_fale_especialista",
  api: "cta_documentacao_api",
  login: "cta_entrar",
};

function resolveHref(
  kind: CtaKind,
  path: (to?: string) => string,
  plan?: PlanId,
): string | undefined {
  switch (kind) {
    case "free":
      return siteConfig.signupUrl;
    case "plans":
      return path("/#planos");
    case "platform":
      return path("/#como-funciona");
    case "subscribe":
      return siteConfig.checkoutUrl && plan
        ? `${siteConfig.checkoutUrl}${siteConfig.checkoutUrl.includes("?") ? "&" : "?"}plano=${plan}`
        : undefined;
    case "specialist":
      return undefined;
    case "api":
      return siteConfig.apiDocsUrl ?? path("/desenvolvedores");
    case "login":
      return siteConfig.appUrl;
  }
}

const variants = {
  primary:
    "bg-brand text-white shadow-md shadow-brand/25 hover:bg-brand-strong focus-visible:ring-brand",
  outline: "border-2 border-brand bg-white text-brand hover:bg-brand-soft focus-visible:ring-brand",
  light: "bg-white text-brand hover:bg-brand-soft focus-visible:ring-white",
  ghostLight: "border border-white/40 text-white hover:bg-white/10 focus-visible:ring-white",
} as const;

type CtaProps = {
  kind: CtaKind;
  plan?: PlanId;
  /** Onde o CTA aparece (vai para o analytics). */
  source: string;
  variant?: keyof typeof variants;
  size?: "sm" | "md" | "lg";
  arrow?: boolean;
  className?: string;
  children?: ReactNode;
};

export const Cta = forwardRef<HTMLAnchorElement & HTMLButtonElement, CtaProps>(function Cta(
  { kind, plan, source, variant = "primary", size = "md", arrow, className, children },
  ref,
) {
  const openLead = useLeadDialog();
  const { t, locale, path } = useI18n();
  const href = resolveHref(kind, path, plan);

  const classes = cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    size === "sm" && "min-h-10 px-4 text-sm",
    size === "md" && "px-5 text-sm",
    size === "lg" && "px-6 text-base",
    variants[variant],
    className,
  );

  const content = (
    <>
      {children ?? t.cta[kind]}
      {arrow && <ArrowRight className="size-4" aria-hidden />}
    </>
  );

  const onClick = () => {
    track(events[kind], { source, plan, lang: locale });
    // Nas landings de aquisição, o "Comece grátis" do cabeçalho também conta no funil.
    if (kind === "free" && /\/(assinar-gratis|lp\/)/.test(window.location.pathname))
      trackGrowth("acquisition_cta_clicked", { cta: source, lang: locale });
    if (!href) openLead({ plan: plan ?? (kind === "free" ? "cedro" : undefined), source });
  };

  if (!href) {
    return (
      <button ref={ref} type="button" className={classes} onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <a ref={ref} href={href} className={classes} onClick={onClick}>
      {content}
    </a>
  );
});
