import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { supabase } from "@/lib/supabase";
import { useAppI18n } from "../i18n";
import { useOrg } from "../org";

export type OrgUsage = {
  plan_id: string;
  plan_name: string;
  status: string;
  billing_status: string;
  documents_total_limit: number | null;
  documents_total_used: number;
  documents_month_limit: number | null;
  documents_month_used: number;
  users_max: number | null;
  users_used: number;
  has_total_limit: boolean;
  has_month_limit: boolean;
};

const USAGE_EVENT = "mdsign:usage-changed";

/** Avisa as telas que o consumo mudou (documento criado), para recarregarem o número real. */
export function notifyUsageChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(USAGE_EVENT));
}

export function useOrgUsage() {
  const { current } = useOrg();
  const [usage, setUsage] = useState<OrgUsage | null>(null);
  const orgId = current?.id;
  useEffect(() => {
    if (!orgId) return;
    const load = () =>
      void supabase
        .rpc("org_usage", { org: orgId })
        .then(({ data }) => setUsage(((data as OrgUsage[] | null) ?? [])[0] ?? null));
    load();
    window.addEventListener(USAGE_EVENT, load);
    return () => window.removeEventListener(USAGE_EVENT, load);
  }, [orgId]);
  return usage;
}

/** Consumo do plano em linguagem simples (PRD §41: "X de 5 documentos"). */
export function PlanUsage({
  usage,
  compact = false,
  hideUpgrade = false,
}: {
  usage: OrgUsage;
  compact?: boolean;
  /** Dentro de "Plano e cobrança" os botões já fazem esse papel. */
  hideUpgrade?: boolean;
}) {
  const { t, f } = useAppI18n();
  const limit = usage.has_total_limit
    ? {
        used: usage.documents_total_used,
        max: usage.documents_total_limit ?? 0,
        text: t.plan.documentsTotal,
      }
    : usage.has_month_limit
      ? {
          used: usage.documents_month_used,
          max: usage.documents_month_limit ?? 0,
          text: t.plan.documentsMonth,
        }
      : null;
  const pct = limit && limit.max ? Math.min(100, Math.round((limit.used / limit.max) * 100)) : 0;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-lg font-semibold">
          {t.plan.plan} {usage.plan_name}
        </p>
        <span className="text-sm text-muted-foreground">
          {t.plan.statuses[usage.status] ?? usage.status}
        </span>
      </div>
      {limit ? (
        <>
          <p className="text-sm">
            {f(limit.text, { used: String(limit.used), limit: String(limit.max) })}
          </p>
          <Progress value={pct} aria-label={`${pct}%`} />
          {pct >= 100 ? (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t.plan.reached}
            </p>
          ) : (
            pct >= 80 && (
              <p className="flex items-start gap-2 text-sm text-orange-700">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {f(t.plan.nearLimit, { pct: String(pct) })}
              </p>
            )
          )}
        </>
      ) : (
        <p className="text-sm">
          {f(t.plan.documentsUnlimited, { used: String(usage.documents_month_used) })}
        </p>
      )}
      {!compact && (
        <p className="text-sm">
          {usage.users_max != null
            ? f(t.plan.users, { used: String(usage.users_used), limit: String(usage.users_max) })
            : f(t.plan.usersUnlimited, { used: String(usage.users_used) })}
        </p>
      )}
      {!hideUpgrade && (pct >= 80 || !compact) && (
        <p className="text-sm text-muted-foreground">{t.plan.upgrade}</p>
      )}
    </div>
  );
}
