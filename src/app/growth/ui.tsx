// Peças visuais do módulo Growth & Aquisição (mesmo visual do Super Admin).

import type { ReactNode } from "react";
import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { selectClass } from "../ui";
import { pct, type Filters } from "./api";
import { fill, useGrowthTexts } from "./texts";

/** Chave com alvo de toque de 24 px (WCAG 2.2, 2.5.8). */
export const bigSwitch = "h-6 w-11 [&>span]:size-5 [&>span[data-state=checked]]:translate-x-5";

export function Panel({
  title,
  hint,
  actions,
  children,
  className,
}: {
  title?: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("grid min-w-0 gap-3 rounded-2xl border bg-white p-5 shadow-sm", className)}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h3 className="font-display text-base font-semibold">{title}</h3>}
            {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Indicador com a definição sempre visível (sem número inventado: null = "Não disponível"). */
export function Kpi({
  label,
  value,
  help,
  note,
}: {
  label: string;
  value: string | number | null | undefined;
  help: string;
  note?: string | undefined;
}) {
  const g = useGrowthTexts();
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="grid content-start gap-1 rounded-xl border bg-white p-4">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-display text-2xl font-bold tabular-nums",
          empty && "text-base font-semibold text-muted-foreground",
        )}
      >
        {empty ? g.na : typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </span>
      {note && <span className="text-xs font-semibold text-orange-700">{note}</span>}
      <span className="flex gap-1 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
        {help}
      </span>
    </div>
  );
}

/** "nao_identificada" e "ref:host" em linguagem humana. */
export function useOriginLabel() {
  const g = useGrowthTexts();
  return (v: string | null | undefined) => {
    if (!v || v === "nao_identificada") return g.origin.nao_identificada;
    if (v.startsWith("ref:")) return fill(g.origin.ref, { host: v.slice(4) });
    return v;
  };
}

export function StagePill({ stage }: { stage: string | null | undefined }) {
  const g = useGrowthTexts();
  if (!stage) return <span className="text-muted-foreground">—</span>;
  const tone: Record<string, string> = {
    paid: "bg-success/15 text-green-800",
    opportunity: "bg-brand text-white",
    pql_hot: "bg-orange-100 text-orange-800",
    pql: "bg-brand-soft text-brand",
    recurring: "bg-muted text-foreground",
    activated: "bg-muted text-foreground",
    signed_up: "bg-muted text-muted-foreground",
    no_org: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        tone[stage],
      )}
    >
      {g.stages[stage] ?? stage}
    </span>
  );
}

/** Filtros comuns: período, origem, campanha, landing, plano, estágio, modelo e tráfego interno. */
export function FiltersBar({
  value,
  onChange,
  options,
  show = ["source", "campaign", "landing", "plan", "stage"],
}: {
  value: Filters;
  onChange: (f: Filters) => void;
  options?:
    { sources: string[]; campaigns: string[]; landings: string[]; plans: string[] } | undefined;
  show?: ("source" | "campaign" | "landing" | "plan" | "stage")[];
}) {
  const g = useGrowthTexts();
  const origin = useOriginLabel();
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const select = (
    key: "source" | "campaign" | "landing" | "plan",
    label: string,
    list: string[] | undefined,
    fmt: (v: string) => string = (v) => v,
  ) =>
    show.includes(key) && (
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{label}</span>
        <select
          className={cn(selectClass, "max-w-56")}
          value={value[key] ?? ""}
          onChange={(e) => set({ [key]: e.target.value || undefined })}
        >
          <option value="">{g.filters.all}</option>
          {(list ?? []).map((v) => (
            <option key={v} value={v}>
              {fmt(v)}
            </option>
          ))}
        </select>
      </label>
    );
  return (
    <div className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label htmlFor="g-from">{g.filters.from}</Label>
          <Input
            id="g-from"
            type="date"
            className="w-40"
            value={value.from}
            max={value.to}
            onChange={(e) => e.target.value && set({ from: e.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="g-to">{g.filters.to}</Label>
          <Input
            id="g-to"
            type="date"
            className="w-40"
            value={value.to}
            min={value.from}
            onChange={(e) => e.target.value && set({ to: e.target.value })}
          />
        </div>
        {select("source", g.filters.source, options?.sources, origin)}
        {select("campaign", g.filters.campaign, options?.campaigns)}
        {select("landing", g.filters.landing, options?.landings)}
        {select("plan", g.filters.plan, options?.plans)}
        {show.includes("stage") && (
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{g.filters.stage}</span>
            <select
              className={selectClass}
              value={value.stage ?? ""}
              onChange={(e) => set({ stage: e.target.value || undefined })}
            >
              <option value="">{g.filters.all}</option>
              {Object.entries(g.stages).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{g.filters.model}</span>
          <select
            className={selectClass}
            value={value.model}
            onChange={(e) => set({ model: e.target.value === "last" ? "last" : "first" })}
          >
            <option value="first">{g.filters.first}</option>
            <option value="last">{g.filters.last}</option>
          </select>
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <Switch
          checked={value.internal}
          onCheckedChange={(v) => set({ internal: v })}
          aria-label={g.filters.internal}
          className={cn("mt-0.5", bigSwitch)}
        />
        <span>
          <span className="font-medium">{g.filters.internal}</span>
          <span className="block text-xs text-muted-foreground">{g.filters.internalHint}</span>
        </span>
      </label>
    </div>
  );
}

/** Linha do período e do modelo de atribuição, para todo indicador ter contexto. */
export function PeriodLine({ f }: { f: Filters }) {
  const g = useGrowthTexts();
  const d = (s: string) => s.split("-").reverse().join("/");
  return (
    <p className="text-xs text-muted-foreground">
      {fill(g.period, {
        from: d(f.from),
        to: d(f.to),
        model: f.model === "last" ? g.filters.last : g.filters.first,
        internal: f.internal ? g.internalOn : "",
      })}
    </p>
  );
}

/** Tabela de quebra (campanha, canal, landing) com barra proporcional e taxa visita → cadastro. */
export function BreakdownTable({
  rows,
  label,
  showRate = true,
}: {
  rows: {
    key: string | null;
    name?: string | null;
    visits?: number;
    signups: number;
    activated?: number;
    paid?: number;
  }[];
  label: (key: string | null, name?: string | null) => string;
  showRate?: boolean;
}) {
  const g = useGrowthTexts();
  if (!rows.length) return <p className="text-sm text-muted-foreground">{g.empty}</p>;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.visits ?? 0, r.signups)));
  return (
    <div className="overflow-x-auto" tabIndex={0}>
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground uppercase">
            <th className="py-2 pr-3 font-semibold">{g.charts.key}</th>
            <th className="py-2 pr-3 text-right font-semibold">{g.charts.visits}</th>
            <th className="py-2 pr-3 text-right font-semibold">{g.charts.signups}</th>
            {rows.some((r) => r.activated !== undefined) && (
              <th className="py-2 pr-3 text-right font-semibold">{g.charts.activated}</th>
            )}
            {rows.some((r) => r.paid !== undefined) && (
              <th className="py-2 pr-3 text-right font-semibold">{g.charts.paid}</th>
            )}
            {showRate && <th className="py-2 text-right font-semibold">{g.charts.rate}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.key}`} className="border-t">
              <td className="py-2 pr-3">
                <span className="block truncate font-medium">{label(r.key, r.name)}</span>
                <span className="mt-1 block h-1.5 rounded bg-brand-soft">
                  <span
                    className="block h-1.5 rounded bg-brand"
                    style={{ width: `${(Math.max(r.visits ?? 0, r.signups) / max) * 100}%` }}
                  />
                </span>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.visits ?? "—"}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.signups}</td>
              {r.activated !== undefined && (
                <td className="py-2 pr-3 text-right tabular-nums">{r.activated}</td>
              )}
              {r.paid !== undefined && (
                <td className="py-2 pr-3 text-right tabular-nums">{r.paid}</td>
              )}
              {showRate && (
                <td className="py-2 text-right tabular-nums">
                  {/* Visitas são sessões e cadastros são pessoas: taxa só quando há visitas. */}
                  {r.visits ? pct(r.signups, r.visits) : "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Linhas diárias em SVG (sem biblioteca), escala única para as séries. */
export function DailyChart({
  data,
  series,
}: {
  data: Record<string, number | string>[];
  series: { key: string; label: string; className: string }[];
}) {
  const g = useGrowthTexts();
  if (!data.length) return <p className="text-sm text-muted-foreground">{g.empty}</p>;
  const W = 640;
  const H = 180;
  const pad = { l: 32, r: 8, t: 8, b: 24 };
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const x = (i: number) =>
    pad.l + (data.length === 1 ? 0 : (i / (data.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ticks = [0, Math.round(max / 2), max];
  const label = (s: string) => s.slice(8, 10) + "/" + s.slice(5, 7);
  const every = Math.max(1, Math.ceil(data.length / 8));
  return (
    <div className="grid gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full" role="img" aria-label={g.charts.daily}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-border" />
            <text
              x={pad.l - 6}
              y={y(t) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % every === 0 ? (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {label(String(d["day"]))}
            </text>
          ) : null,
        )}
        {series.map((s) => (
          <polyline
            key={s.key}
            fill="none"
            strokeWidth={2}
            className={s.className}
            points={data.map((d, i) => `${x(i)},${y(Number(d[s.key]) || 0)}`).join(" ")}
          />
        ))}
      </svg>
      <div className="flex flex-wrap gap-4 text-xs">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <svg width="14" height="4" aria-hidden>
              <line x1="0" x2="14" y1="2" y2="2" strokeWidth="3" className={s.className} />
            </svg>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Pager({
  page,
  size,
  total,
  onPage,
}: {
  page: number;
  size: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const g = useGrowthTexts();
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>{fill(g.pageOf, { page, pages, total })}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          {g.prev}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          {g.next}
        </Button>
      </div>
    </div>
  );
}

export const fmtDay = (iso: string | null | undefined, locale: string, withTime = false) =>
  iso
    ? new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale, {
        dateStyle: "short",
        ...(withTime ? { timeStyle: "short" } : {}),
      }).format(new Date(iso))
    : "—";
