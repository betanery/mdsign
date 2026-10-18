import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Gift, Lock, PartyPopper } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAppI18n } from "../i18n";
import { useOrg } from "../org";
import type { OrgUsage } from "./plan-usage";

// Plano grátis Cedro: "Documentos gratuitos: X de 5 utilizados" e as mensagens do funil.
// Os números vêm sempre do consumo real (org_usage), nunca de uma estimativa da tela.

export function freeUsage(usage: OrgUsage | null) {
  if (!usage || usage.plan_id !== "cedro" || !usage.has_total_limit) return null;
  const limit = usage.documents_total_limit ?? 0;
  const used = Math.min(usage.documents_total_used, limit);
  return { used, limit, left: Math.max(0, limit - used) };
}

/** Jacarandá da matriz publicada (o que um cliente novo contrata hoje), para os avisos. */
type Offer = { price_cents: number | null; documents_month: number | null };
let offerCache: Promise<Offer | null> | null = null;
export function useJacarandaOffer() {
  const [offer, setOffer] = useState<Offer | null>(null);
  useEffect(() => {
    offerCache ??= Promise.resolve(supabase.rpc("plan_offer")).then(({ data }) => {
      const p = (
        data as {
          plans: { id: string; price_cents: number | null; entitlements: Record<string, number> }[];
        } | null
      )?.plans.find((x) => x.id === "jacaranda");
      return p
        ? { price_cents: p.price_cents, documents_month: p.entitlements["documents_month"] ?? null }
        : null;
    });
    let alive = true;
    void offerCache.then((o) => alive && setOffer(o));
    return () => {
      alive = false;
    };
  }, []);
  return offer;
}

/** Registra que a oferta de upgrade apareceu (o servidor guarda no máximo 1 por dia). */
export function useOfferViewed(show: boolean, where: string) {
  const { current } = useOrg();
  const orgId = current?.id;
  useEffect(() => {
    if (!show || !orgId) return;
    void supabase.rpc("growth_app_event", {
      org: orgId,
      ev: "upgrade_offer_viewed",
      payload: { where },
    });
  }, [show, orgId, where]);
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Clique em "Ver planos": registra a intenção de upgrade e abre Meu plano → Mudar de plano. */
export function UpgradeButton({
  where,
  className,
  variant = "default",
}: {
  where: string;
  className?: string;
  variant?: "default" | "outline";
}) {
  const { t } = useAppI18n();
  const { current } = useOrg();
  return (
    <Button
      asChild
      variant={variant}
      className={cn(variant === "default" && "bg-brand hover:bg-brand-strong", className)}
    >
      <Link
        to="/app/plan"
        search={{ plano: "jacaranda" }}
        hash="mudar-plano"
        onClick={() => {
          if (current)
            void supabase.rpc("growth_app_event", {
              org: current.id,
              ev: "upgrade_cta_clicked",
              payload: { where },
            });
        }}
      >
        {t.cedro.seePlans}
        <ArrowRight aria-hidden />
      </Link>
    </Button>
  );
}

/**
 * Mensagem contextual conforme o consumo: 3º documento mostra o Jacarandá; 4º avisa que resta 1;
 * 5º destaca o upgrade. Discreta: não impede a conclusão de documentos permitidos.
 */
export function cedroMessage(
  t: ReturnType<typeof useAppI18n>["t"],
  used: number,
  limit: number,
  offer?: Offer | null,
) {
  if (used >= limit) return { text: t.cedro.reached, tone: "danger" as const };
  if (used === limit - 1) return { text: t.cedro.oneLeft, tone: "warn" as const };
  if (used === 3 && offer?.price_cents && offer.documents_month)
    return {
      text: t.cedro.third
        .replace("{docs}", String(offer.documents_month))
        .replace("{price}", brl(offer.price_cents)),
      tone: "info" as const,
    };
  if (used >= 2) return { text: t.cedro.keepGoing, tone: "info" as const };
  return null;
}

/** Tentativa de criar além da franquia: bloqueia com a contratação, sem perder o que já existe. */
export function LimitReachedOffer() {
  const { t } = useAppI18n();
  const offer = useJacarandaOffer();
  useOfferViewed(true, "limit_reached");
  return (
    <div
      role="alert"
      className="grid gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
    >
      <p className="flex items-start gap-2 font-semibold">
        <Lock className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        {t.cedro.blocked}
      </p>
      {offer?.price_cents && offer.documents_month ? (
        <p className="text-muted-foreground">
          {t.cedro.offer
            .replace("{docs}", String(offer.documents_month))
            .replace("{price}", brl(offer.price_cents))}
        </p>
      ) : null}
      <p className="text-muted-foreground">{t.cedro.keepAccess}</p>
      <UpgradeButton where="limit_reached" className="w-fit" />
    </div>
  );
}

export function FreePlanCard({ usage }: { usage: OrgUsage }) {
  const { t, f } = useAppI18n();
  const offer = useJacarandaOffer();
  const free = freeUsage(usage);
  useOfferViewed(Boolean(free && free.used >= 3), "free_card");
  if (!free) return null;
  const msg = cedroMessage(t, free.used, free.limit, offer);
  const pct = free.limit ? Math.round((free.used / free.limit) * 100) : 0;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Gift className="size-5 text-brand" aria-hidden />
        <p className="font-display text-lg font-semibold">
          {t.plan.plan} {usage.plan_name}
        </p>
      </div>
      <p className="text-sm font-medium">
        {f(t.cedro.usage, { used: String(free.used), limit: String(free.limit) })}
      </p>
      <Progress
        value={pct}
        aria-label={f(t.cedro.usage, { used: String(free.used), limit: String(free.limit) })}
      />
      {msg ? (
        <p
          className={cn(
            "flex items-start gap-2 text-sm",
            msg.tone === "danger" && "text-destructive",
            msg.tone === "warn" && "text-orange-700",
            msg.tone === "info" && "text-muted-foreground",
          )}
        >
          {msg.tone !== "info" && <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />}
          {msg.text}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {f(free.left === 1 ? t.cedro.left1 : t.cedro.left, { n: String(free.left) })}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t.cedro.availability}</p>
      <UpgradeButton
        where="free_card"
        variant={free.used >= free.limit - 1 ? "default" : "outline"}
        className="w-fit"
      />
    </div>
  );
}

/** Faixa no topo do app quando falta 1 documento grátis ou acabaram. */
export function CedroBanner({ usage }: { usage: OrgUsage | null }) {
  const { t } = useAppI18n();
  const free = freeUsage(usage);
  useOfferViewed(Boolean(free && free.used >= free.limit - 1), "banner");
  if (!free || free.used < free.limit - 1) return null;
  const reached = free.used >= free.limit;
  return (
    <div
      role="status"
      className={cn(
        "mb-4 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm",
        reached ? "border-destructive/30 bg-destructive/5" : "border-orange-300 bg-orange-50",
      )}
    >
      <AlertTriangle
        className={cn("size-4 shrink-0", reached ? "text-destructive" : "text-orange-600")}
        aria-hidden
      />
      <p className="min-w-0 flex-1">{reached ? t.cedro.reached : t.cedro.oneLeft}</p>
      <UpgradeButton where="banner" className="h-8" />
    </div>
  );
}

/** Depois de criar um documento: confirma e mostra quantos grátis ainda restam. */
export function CedroAfterDocument({ usage }: { usage: OrgUsage | null }) {
  const { t, f } = useAppI18n();
  const offer = useJacarandaOffer();
  const free = freeUsage(usage);
  useOfferViewed(Boolean(free && free.used >= 3), "after_document");
  if (!free) return null;
  const msg = cedroMessage(t, free.used, free.limit, offer);
  return (
    <div className="grid gap-2 rounded-xl border border-brand/20 bg-brand-soft/60 p-4 text-sm">
      {free.used === 1 && (
        <p className="flex items-center gap-2 font-semibold">
          <PartyPopper className="size-4 text-brand" aria-hidden />
          {t.cedro.firstDone}
        </p>
      )}
      <p>
        {msg
          ? msg.text
          : f(free.left === 1 ? t.cedro.left1 : t.cedro.left, { n: String(free.left) })}
      </p>
      {free.used >= 3 && (
        <UpgradeButton
          where="after_document"
          variant={free.left <= 1 ? "default" : "outline"}
          className="w-fit"
        />
      )}
    </div>
  );
}
