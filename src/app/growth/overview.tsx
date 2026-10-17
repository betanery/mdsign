import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAppI18n } from "../i18n";
import { downloadCsv, growthApi, pct, type Filters, type Funnel, type Overview } from "./api";
import { fill, useGrowthTexts } from "./texts";
import { BreakdownTable, DailyChart, Kpi, Panel, PeriodLine, useOriginLabel } from "./ui";

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Visão geral: indicadores reais do período, com a definição de cada um. */
export function GrowthOverview({
  filters,
  onOptions,
}: {
  filters: Filters;
  onOptions: (o: Overview["filters"]) => void;
}) {
  const g = useGrowthTexts();
  const origin = useOriginLabel();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    setError(false);
    growthApi
      .overview(filters)
      .then((r) => {
        if (mine !== seq.current) return;
        setData(r);
        onOptions(r.filters);
      })
      .catch(() => mine === seq.current && setError(true));
  }, [filters, onOptions]);

  if (error) return <p className="text-sm text-destructive">{g.error}</p>;
  if (!data)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {g.loading}
      </p>
    );

  const k = data.kpis;
  const sandbox = String(k["mrr_environment"] ?? k["paid_environment"] ?? "").includes("sandbox");
  const kpiOrder = [
    "visits",
    "cta_clicks",
    "signup_started",
    "signups",
    "orgs_created",
    "first_document",
    "three_documents",
    "cedro_4_of_5",
    "cedro_limit",
    "upgrade_clicks",
    "paid",
  ];
  const campaignLabel = (key: string | null, name?: string | null) =>
    key ? (name ? `${name} (${key})` : key) : g.charts.noCampaign;
  const ranking = [...data.by_campaign]
    .filter((r) => r.key)
    .sort(
      (a, b) =>
        (b.paid ?? 0) - (a.paid ?? 0) || b.signups - a.signups || (b.visits ?? 0) - (a.visits ?? 0),
    )
    .slice(0, 10);

  async function exportCsv() {
    if (!data) return;
    await growthApi.logExport("overview", data.by_campaign.length + data.by_channel.length);
    downloadCsv(
      `mdsign-growth-visao-geral-${filters.from}-a-${filters.to}.csv`,
      ["tipo", "chave", "visitas", "cadastros", "ativados", "pagos"],
      [
        ...data.by_campaign.map((r) => [
          "campanha",
          r.key ?? "",
          r.visits,
          r.signups,
          r.activated,
          r.paid,
        ]),
        ...data.by_channel.map((r) => [
          "canal",
          origin(r.key),
          r.visits,
          r.signups,
          r.activated,
          r.paid,
        ]),
        ...data.by_landing.map((r) => ["landing", r.key ?? "", r.visits, r.signups, "", ""]),
      ],
    );
    toast.success(g.exported);
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PeriodLine f={filters} />
        <Button variant="outline" size="sm" onClick={() => void exportCsv()}>
          <Download aria-hidden />
          {g.export}
        </Button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {kpiOrder.map((key) => (
          <Kpi
            key={key}
            label={g.kpi[key]!}
            value={k[key] as number | null}
            help={g.kpiHelp[key]!}
            note={key === "paid" && sandbox && Number(k[key]) > 0 ? g.sandbox : undefined}
          />
        ))}
        <Kpi
          label={g.kpi["mrr"]!}
          value={k["mrr_cents"] == null ? null : brl(Number(k["mrr_cents"]))}
          help={g.kpiHelp["mrr"]!}
          note={k["mrr_cents"] != null && sandbox ? g.sandbox : undefined}
        />
      </div>

      <Panel title={g.charts.daily}>
        <DailyChart
          data={data.daily}
          series={[
            { key: "visits", label: g.charts.visits, className: "stroke-brand" },
            { key: "signups", label: g.charts.signups, className: "stroke-orange-500" },
            { key: "paid", label: g.charts.paid, className: "stroke-green-700" },
          ]}
        />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={g.charts.byCampaign}>
          <BreakdownTable rows={data.by_campaign} label={campaignLabel} />
        </Panel>
        <Panel title={g.charts.byChannel}>
          <BreakdownTable rows={data.by_channel} label={(key) => origin(key)} />
        </Panel>
        <Panel title={g.charts.byLanding}>
          <BreakdownTable rows={data.by_landing} label={(key) => key ?? g.na} />
        </Panel>
        <Panel title={g.charts.stages}>
          <StageBars stages={data.stages} />
        </Panel>
      </div>

      <Panel title={g.charts.ranking}>
        <BreakdownTable rows={ranking} label={campaignLabel} />
      </Panel>
    </div>
  );
}

function StageBars({ stages }: { stages: Record<string, number> }) {
  const g = useGrowthTexts();
  const order = [
    "no_org",
    "signed_up",
    "activated",
    "recurring",
    "pql",
    "pql_hot",
    "opportunity",
    "paid",
  ];
  const total = order.reduce((s, k) => s + (stages[k] ?? 0), 0);
  if (!total) return <p className="text-sm text-muted-foreground">{g.empty}</p>;
  return (
    <ul className="grid gap-2 text-sm">
      {order.map((k) => (
        <li key={k} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3">
          <span className="truncate">{g.stages[k]}</span>
          <span className="h-2 rounded bg-brand-soft">
            <span
              className="block h-2 rounded bg-brand"
              style={{ width: `${((stages[k] ?? 0) / total) * 100}%` }}
            />
          </span>
          <span className="tabular-nums">{stages[k] ?? 0}</span>
        </li>
      ))}
    </ul>
  );
}

/** Funil: duas populações, cada uma com taxas só entre etapas comparáveis. */
export function GrowthFunnel({ filters }: { filters: Filters }) {
  const g = useGrowthTexts();
  const { locale } = useAppI18n();
  const origin = useOriginLabel();
  const [data, setData] = useState<Funnel | null>(null);
  const [error, setError] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    setError(false);
    growthApi
      .funnel(filters)
      .then((r) => mine === seq.current && setData(r))
      .catch(() => mine === seq.current && setError(true));
  }, [filters]);

  if (error) return <p className="text-sm text-destructive">{g.error}</p>;
  if (!data)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {g.loading}
      </p>
    );

  const webSteps = ["visitors", "cta", "signup_started", "signup_completed"] as const;
  const peopleSteps = [
    "signup_completed",
    "organization",
    "first_document",
    "recurring",
    "upgrade_interest",
    "paid",
  ] as const;
  const stepCols = ["signup_completed", "first_document", "recurring", "upgrade_interest", "paid"];

  return (
    <div className="grid gap-4">
      <PeriodLine f={filters} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={g.funnel.webTitle} hint={g.funnel.webHint}>
          <Steps
            steps={webSteps.map((s) => ({ key: s, n: data.web[s] }))}
            label={(s) => g.funnel.steps[s]!}
          />
        </Panel>
        <Panel title={g.funnel.peopleTitle} hint={g.funnel.peopleHint}>
          <Steps
            steps={peopleSteps.map((s) => ({ key: s, n: data.people[s] }))}
            label={(s) => g.funnel.steps[s]!}
          />
          <p className="text-xs text-muted-foreground">
            {fill(g.funnel.checkoutNote, { n: data.people.checkout_clicks })}
          </p>
        </Panel>
      </div>
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        {g.funnel.noBridge}
      </p>

      <Panel title={g.funnel.weekly}>
        {data.weekly.length ? (
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase">
                  <th className="py-2 pr-3 font-semibold">{g.funnel.week}</th>
                  <th className="py-2 pr-3 text-right font-semibold">
                    {g.funnel.steps["signup_completed"]}
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold">
                    {g.funnel.steps["first_document"]}
                  </th>
                  <th className="py-2 text-right font-semibold">{g.funnel.steps["paid"]}</th>
                </tr>
              </thead>
              <tbody>
                {data.weekly.map((w) => (
                  <tr key={w.week} className="border-t">
                    <td className="py-2 pr-3">
                      {new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale, {
                        dateStyle: "short",
                      }).format(new Date(`${w.week}T12:00:00`))}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{w.signups}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{w.first_document}</td>
                    <td className="py-2 text-right tabular-nums">{w.paid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{g.empty}</p>
        )}
      </Panel>

      {(
        [
          ["byCampaign", data.by_campaign, (k: string | null) => k ?? g.charts.noCampaign],
          ["byChannel", data.by_channel, (k: string | null) => origin(k)],
        ] as const
      ).map(([title, rows, label]) => (
        <Panel key={title} title={g.funnel[title]}>
          {rows.length ? (
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 pr-3 font-semibold">{g.charts.key}</th>
                    {stepCols.map((s) => (
                      <th key={s} className="py-2 pr-3 text-right font-semibold">
                        {g.funnel.steps[s]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.key}`} className="border-t">
                      <td className="py-2 pr-3 font-medium">{label(r.key)}</td>
                      {stepCols.map((s) => (
                        <td key={s} className="py-2 pr-3 text-right tabular-nums">
                          {r[s] ?? 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{g.empty}</p>
          )}
        </Panel>
      ))}
    </div>
  );
}

function Steps({
  steps,
  label,
}: {
  steps: { key: string; n: number }[];
  label: (s: string) => string;
}) {
  const g = useGrowthTexts();
  const top = Math.max(1, steps[0]?.n ?? 0);
  return (
    <ol className="grid gap-2">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1]!.n : null;
        return (
          <li key={s.key} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{label(s.key)}</span>
              <span className="font-display text-lg font-bold tabular-nums">{s.n}</span>
            </div>
            <span className="h-2 rounded bg-brand-soft">
              <span
                className="block h-2 rounded bg-brand"
                style={{ width: `${(s.n / top) * 100}%` }}
              />
            </span>
            {prev !== null && (
              <span className="text-xs text-muted-foreground">
                {g.funnel.conversion}: {pct(s.n, prev)} · {g.funnel.dropoff}:{" "}
                {prev > 0 ? Math.max(prev - s.n, 0) : "—"}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
