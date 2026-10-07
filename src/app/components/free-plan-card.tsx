import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Gift, PartyPopper } from "lucide-react";

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

/** Clique em "Ver planos": vai para o funil (intenção de upgrade) e abre Plano e cobrança. */
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
        to="/app/organization"
        search={{ tab: "plan" }}
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

/** Mensagem contextual conforme o consumo (2, 4 e 5 documentos). */
export function cedroMessage(t: ReturnType<typeof useAppI18n>["t"], used: number, limit: number) {
  if (used >= limit) return { text: t.cedro.reached, tone: "danger" as const };
  if (used === limit - 1) return { text: t.cedro.oneLeft, tone: "warn" as const };
  if (used >= 2) return { text: t.cedro.keepGoing, tone: "info" as const };
  return null;
}

export function FreePlanCard({ usage }: { usage: OrgUsage }) {
  const { t, f } = useAppI18n();
  const free = freeUsage(usage);
  if (!free) return null;
  const msg = cedroMessage(t, free.used, free.limit);
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
  const free = freeUsage(usage);
  if (!free) return null;
  const msg = cedroMessage(t, free.used, free.limit);
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
      {free.left <= 1 && <UpgradeButton where="after_document" className="w-fit" />}
    </div>
  );
}
