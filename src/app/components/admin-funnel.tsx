import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAppI18n } from "../i18n";
import { selectClass } from "../ui";

// Super Admin → Funil: aquisição e conversão do Cedro, só com dados registrados (sem estimativa
// histórica). "Visitas" = sessões anônimas sem cookie, não pessoas únicas.

type Funnel = {
  visits: number;
  page_views: number;
  cta_clicks: number;
  signup_started: number;
  signups: number;
  milestones: Record<string, number>;
  by_source: {
    source: string;
    campaign: string;
    signups: number;
    activated: number;
    paid: number;
  }[];
  orgs: {
    id: string;
    name: string;
    created_at: string;
    source: string | null;
    campaign: string | null;
    stage: string;
    documents_used: number;
    plan_id: string | null;
  }[];
  campaigns: string[];
  sources: string[];
};

const day = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");

const stageTone: Record<string, string> = {
  paid: "bg-success/15 text-success",
  opportunity: "bg-brand text-white",
  pql_hot: "bg-orange-100 text-orange-700",
  pql: "bg-brand-soft text-brand",
  recurring: "bg-muted text-foreground",
  activated: "bg-muted text-foreground",
  signed_up: "bg-muted text-muted-foreground",
};

export function AdminFunnel({ fmtDate }: { fmtDate: (v: string | null) => string }) {
  const { t } = useAppI18n();
  const g = t.admin.funnel;
  const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * day)));
  const [to, setTo] = useState(iso(new Date()));
  const [campaign, setCampaign] = useState("");
  const [source, setSource] = useState("");
  const [data, setData] = useState<Funnel | null>(null);
  const [error, setError] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const end = new Date(`${to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    const { data: r, error: e } = await supabase.rpc("admin_growth_funnel", {
      date_from: new Date(`${from}T00:00:00`).toISOString(),
      date_to: end.toISOString(),
      campaign: campaign || null,
      source: source || null,
    });
    if (mine !== seq.current) return;
    setError(Boolean(e));
    setData((r as Funnel | null) ?? null);
  }, [from, to, campaign, source]);

  useEffect(() => {
    void load();
  }, [load]);

  const m = data?.milestones ?? {};
  const n = (k: string) => m[k] ?? 0;
  const steps = data
    ? [
        { label: g.visits, value: data.visits, hint: g.visitsHint },
        { label: g.ctaClicks, value: data.cta_clicks },
        { label: g.signups, value: data.signups, rate: pct(data.signups, data.visits) },
        {
          label: g.firstDone,
          value: n("first_document_completed"),
          rate: pct(n("first_document_completed"), data.signups),
        },
        { label: g.secondDone, value: n("second_document_completed") },
        { label: g.usage4, value: n("cedro_usage_4_of_5") },
        { label: g.limit, value: n("cedro_limit_reached") },
        { label: g.checkout, value: n("checkout_started") },
        {
          label: g.paid,
          value: n("paid_plan_activated"),
          rate: pct(n("paid_plan_activated"), data.signups),
        },
      ]
    : [];

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4 shadow-sm">
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-muted-foreground">{g.from}</span>
          <Input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-muted-foreground">{g.to}</span>
          <Input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="h-9"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-muted-foreground">{g.campaign}</span>
          <select
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            className={cn(selectClass, "w-auto")}
          >
            <option value="">{g.all}</option>
            {(data?.campaigns ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-muted-foreground">{g.source}</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className={cn(selectClass, "w-auto")}
          >
            <option value="">{g.all}</option>
            {(data?.sources ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error ? (
        <p className="rounded-2xl border bg-white p-5 text-destructive">{t.common.genericError}</p>
      ) : !data ? (
        <p className="flex items-center gap-2 text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t.common.loading}
        </p>
      ) : (
        <>
          <section aria-label={g.title} className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="font-display text-lg font-semibold">{g.title}</h2>
            <p className="text-sm text-muted-foreground">{g.note}</p>
            <ol className="mt-4 grid gap-2">
              {steps.map((s) => {
                const max = Math.max(1, steps[0]?.value ?? 1, data.signups);
                return (
                  <li key={s.label} className="grid gap-1 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span title={s.hint}>
                        {s.label}
                        {s.hint && (
                          <span className="text-xs text-muted-foreground"> · {s.hint}</span>
                        )}
                      </span>
                      <span className="tabular-nums">
                        <span className="font-semibold">{s.value}</span>
                        {s.rate && (
                          <span className="ml-2 text-xs text-muted-foreground">{s.rate}</span>
                        )}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-brand"
                        style={{
                          width: `${s.value ? Math.max(2, Math.min(100, (s.value / max) * 100)) : 0}%`,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="rounded-2xl border bg-white shadow-sm">
            <h2 className="border-b p-4 font-display text-lg font-semibold">{g.bySource}</h2>
            {data.by_source.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">{g.empty}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">{g.source}</th>
                      <th className="p-3 font-medium">{g.campaign}</th>
                      <th className="p-3 text-right font-medium">{g.signups}</th>
                      <th className="p-3 text-right font-medium">{g.firstDone}</th>
                      <th className="p-3 text-right font-medium">{g.paid}</th>
                      <th className="p-3 text-right font-medium">{g.conversion}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.by_source.map((r) => (
                      <tr key={`${r.source}-${r.campaign}`}>
                        <td className="p-3">{r.source}</td>
                        <td className="p-3">{r.campaign}</td>
                        <td className="p-3 text-right tabular-nums">{r.signups}</td>
                        <td className="p-3 text-right tabular-nums">{r.activated}</td>
                        <td className="p-3 text-right tabular-nums">{r.paid}</td>
                        <td className="p-3 text-right tabular-nums">{pct(r.paid, r.signups)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border bg-white shadow-sm">
            <div className="border-b p-4">
              <h2 className="font-display text-lg font-semibold">{g.stagesTitle}</h2>
              <p className="text-sm text-muted-foreground">{g.stagesHint}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">{t.admin.organization}</th>
                    <th className="p-3 font-medium">{g.stage}</th>
                    <th className="p-3 font-medium">{t.admin.plan}</th>
                    <th className="p-3 text-right font-medium">{g.docsUsed}</th>
                    <th className="p-3 font-medium">{g.source}</th>
                    <th className="p-3 font-medium">{t.admin.created}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.orgs.map((o) => (
                    <tr key={o.id}>
                      <td className="p-3">{o.name}</td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            stageTone[o.stage],
                          )}
                        >
                          {g.stages[o.stage] ?? o.stage}
                        </span>
                      </td>
                      <td className="p-3">{o.plan_id ?? "—"}</td>
                      <td className="p-3 text-right tabular-nums">{o.documents_used}</td>
                      <td className="p-3">
                        {o.source ?? g.noSource}
                        {o.campaign && (
                          <span className="text-muted-foreground"> · {o.campaign}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap p-3">{fmtDate(o.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
