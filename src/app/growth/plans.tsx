import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { useFeatureTexts, type FeatureCode } from "../features";
import { selectClass } from "../ui";
import { pct, periodArgs, type Filters } from "./api";
import { fill, useGrowthTexts } from "./texts";
import { Kpi, Panel, PeriodLine } from "./ui";
import { supabase } from "@/lib/supabase";

type Funnel = { steps: Record<string, number>; features: string[] };
type Insights = {
  locked_clicks: { feature: string | null; n: number }[];
  previews: { feature: string | null; n: number }[];
  plans_sought: { plan: string; n: number }[];
  upgrade_clicks: number;
  offers_viewed: number;
  checkouts: number;
  confirmed: number;
  confirmed_environment: string | null;
  cedro_base: number;
  cedro_to_jacaranda: number;
  paid_transitions: { from_plan: string; to_plan: string; n: number }[];
  unknown_origin_upgrades: number;
};

const STEPS = [
  "signups",
  "first_document",
  "three_documents",
  "five_documents",
  "offer_viewed",
  "checkout_started",
  "paid",
];

/** Growth → Planos e upgrade: funil de planos e oportunidades (somente leitura). */
export function GrowthPlans({ filters }: { filters: Filters }) {
  const g = useGrowthTexts();
  const P = g.plans;
  const x = useFeatureTexts();
  const [feature, setFeature] = useState("");
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [ins, setIns] = useState<Insights | null>(null);
  const [error, setError] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    setError(false);
    const f = { ...periodArgs(filters), feature: feature || null };
    Promise.all([
      supabase.rpc("admin_growth_plan_funnel", { f }),
      supabase.rpc("admin_growth_upgrade_insights", { f }),
    ])
      .then(([a, b]) => {
        if (mine !== seq.current) return;
        if (a.error || b.error) return setError(true);
        setFunnel(a.data as Funnel);
        setIns(b.data as Insights);
      })
      .catch(() => mine === seq.current && setError(true));
  }, [filters, feature]);

  if (error) return <p className="text-sm text-destructive">{g.error}</p>;
  if (!funnel || !ins)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {g.loading}
      </p>
    );
  const name = (f: string | null) => (f ? (x.features[f as FeatureCode]?.name ?? f) : g.na);
  const top = Math.max(1, funnel.steps["signups"] ?? 0);
  const sandbox = (ins.confirmed_environment ?? "").includes("sandbox");

  return (
    <div className="grid gap-4">
      <PeriodLine f={filters} />
      <Panel
        title={P.funnelTitle}
        hint={P.funnelHint}
        actions={
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">{P.feature}</span>
            <select
              className={selectClass}
              value={feature}
              onChange={(e) => setFeature(e.target.value)}
            >
              <option value="">{g.filters.all}</option>
              {funnel.features.map((f) => (
                <option key={f} value={f}>
                  {name(f)}
                </option>
              ))}
            </select>
          </label>
        }
      >
        <ol className="grid gap-2">
          {STEPS.map((s, i) => {
            const n = funnel.steps[s] ?? 0;
            const prev = i > 0 ? (funnel.steps[STEPS[i - 1]!] ?? 0) : null;
            return (
              <li key={s} className="grid gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{P.steps[s]}</span>
                  <span className="font-display text-lg font-bold tabular-nums">{n}</span>
                </div>
                <span className="h-2 rounded bg-brand-soft">
                  <span
                    className="block h-2 rounded bg-brand"
                    style={{ width: `${(n / top) * 100}%` }}
                  />
                </span>
                {prev !== null && (
                  <span className="text-xs text-muted-foreground">
                    {g.funnel.conversion}: {pct(n, prev)}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </Panel>

      <Panel title={P.insightsTitle} hint={P.noAuto}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          <Kpi label={P.clicks} value={ins.upgrade_clicks} help={P.noAuto} />
          <Kpi label={P.offers} value={ins.offers_viewed} help={P.noAuto} />
          <Kpi label={P.checkouts} value={ins.checkouts} help={g.kpiHelp["upgrade_clicks"]!} />
          <Kpi
            label={P.confirmed}
            value={ins.confirmed}
            help={g.kpiHelp["paid"]!}
            note={sandbox && ins.confirmed ? g.sandbox : undefined}
          />
          <Kpi
            label={P.cedroToJac}
            value={
              ins.cedro_base
                ? `${ins.cedro_to_jacaranda} / ${ins.cedro_base} (${pct(ins.cedro_to_jacaranda, ins.cedro_base)})`
                : null
            }
            help={P.cedroToJacHint}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Ranking
            title={P.locked}
            rows={ins.locked_clicks.map((r) => [name(r.feature), r.n])}
            empty={g.empty}
            times={P.times}
          />
          <Ranking
            title={P.previews}
            rows={ins.previews.map((r) => [name(r.feature), r.n])}
            empty={g.empty}
            times={P.times}
          />
          <Ranking
            title={P.sought}
            rows={ins.plans_sought.map((r) => [r.plan, r.n])}
            empty={g.empty}
            times={P.times}
          />
        </div>
        <Ranking
          title={P.transitions}
          rows={ins.paid_transitions.map((r) => [`${r.from_plan} → ${r.to_plan}`, r.n])}
          empty={g.empty}
          times={P.times}
        />
        {ins.unknown_origin_upgrades > 0 && (
          <p className="text-xs text-muted-foreground">
            {fill(P.unknownOrigin, { n: ins.unknown_origin_upgrades })}
          </p>
        )}
      </Panel>
    </div>
  );
}

function Ranking({
  title,
  rows,
  empty,
  times,
}: {
  title: string;
  rows: [string, number][];
  empty: string;
  times: string;
}) {
  return (
    <div className="grid content-start gap-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="grid gap-1 text-sm">
          {rows.slice(0, 8).map(([k, n]) => (
            <li key={k} className="flex justify-between gap-2 border-b pb-1">
              <span className="truncate">{k}</span>
              <span className="tabular-nums">{fill(times, { n })}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
