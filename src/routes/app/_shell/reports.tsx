import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FeatureGate } from "@/app/components/feature-preview";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  X,
} from "lucide-react";

import { markGuideStep } from "@/app/onboarding";
import { PageHeader } from "@/app/components/app-shell";
import { useAppI18n } from "@/app/i18n";
import { useFeatures } from "@/app/features";
import { useOrg } from "@/app/org";
import { downloadBlob, toPdf, toXlsx, type ExportTable } from "@/app/report-export";
import { downloadCsv, toCsv } from "@/app/sheet";
import { selectClass } from "@/app/ui";
import { useFolders } from "@/app/folders";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

// Relatórios (Bloco D): só métricas com dado real. "Visualizado"/"entregue" não existem
// porque o motor de assinatura não informa esses eventos.
export const Route = createFileRoute("/app/_shell/reports")({
  // Recurso do plano: fora dele, a prévia de upgrade no lugar da tela (o backend recusa).
  component: () => (
    <FeatureGate code="reports">
      <ReportsPage />
    </FeatureGate>
  ),
});

type Preset = "today" | "7d" | "30d" | "month" | "lastMonth" | "custom";
type Report = {
  documents: Record<string, number> & { by_origin: Record<string, number> };
  signatures: {
    signed: number;
    approved: number;
    pending: number;
    avg_hours: number | null;
    completion_rate: number | null;
  };
  pending: {
    count: number;
    oldest: {
      name: string;
      email: string;
      role: string;
      document_id: string;
      doc_name: string;
      since: string;
      days: number;
      reminder_count: number;
    }[];
    by_unit: { name: string; n: number }[];
    by_group: { name: string; n: number }[];
  };
  bulk: Record<string, number | null>;
  usage: {
    consumed: Record<string, number>;
    active_users: number;
    members: number;
    by_day: Record<string, number>;
  };
};
type Option = { id: string; name: string };

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function range(preset: Preset, from: string, to: string): [Date, Date] {
  const now = new Date();
  const today = dayStart(now);
  const tomorrow = new Date(today.getTime() + 86400000);
  if (preset === "today") return [today, tomorrow];
  if (preset === "7d") return [new Date(tomorrow.getTime() - 7 * 86400000), tomorrow];
  if (preset === "30d") return [new Date(tomorrow.getTime() - 30 * 86400000), tomorrow];
  if (preset === "month") return [new Date(now.getFullYear(), now.getMonth(), 1), tomorrow];
  if (preset === "lastMonth")
    return [
      new Date(now.getFullYear(), now.getMonth() - 1, 1),
      new Date(now.getFullYear(), now.getMonth(), 1),
    ];
  const a = from ? new Date(`${from}T00:00:00`) : today;
  const b = to ? new Date(new Date(`${to}T00:00:00`).getTime() + 86400000) : tomorrow;
  return [a, b];
}

function ReportsPage() {
  const { t, f, locale } = useAppI18n();
  const { mode: featureMode } = useFeatures();
  const { current, can } = useOrg();
  const guideOrg = current?.id;
  useEffect(() => markGuideStep(guideOrg, "viewed_reports"), [guideOrg]);
  const orgId = current?.id;
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const { folders } = useFolders(orgId);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [opts, setOpts] = useState<Record<"user" | "unit" | "group" | "template", Option[]>>({
    user: [],
    unit: [],
    group: [],
    template: [],
  });
  const [start, end] = useMemo(() => range(preset, from, to), [preset, from, to]);
  const nf = new Intl.NumberFormat(locale === "pt" ? "pt-BR" : locale);
  const df = useMemo(
    () => new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale, { dateStyle: "short" }),
    [locale],
  );

  useEffect(() => {
    if (!orgId) return;
    void Promise.all([
      supabase.rpc("list_members", { org: orgId }),
      supabase
        .from("organization_units")
        .select("id, name")
        .eq("organization_id", orgId)
        .order("name"),
      supabase.from("org_groups").select("id, name").eq("organization_id", orgId).order("name"),
      supabase.from("templates").select("id, name").eq("organization_id", orgId).order("name"),
    ]).then(([m, u, g, tp]) =>
      setOpts({
        user: (
          (m.data as { user_id: string; full_name: string | null; email: string }[] | null) ?? []
        ).map((x) => ({ id: x.user_id, name: x.full_name || x.email })),
        unit: (u.data as Option[] | null) ?? [],
        group: (g.data as Option[] | null) ?? [],
        template: (tp.data as Option[] | null) ?? [],
      }),
    );
  }, [orgId]);

  // Filtros trocados em sequência: só a resposta da consulta mais recente vale.
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!orgId) return;
    const n = ++seq.current;
    setBusy(true);
    const f = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const { data } = await supabase.rpc("org_report", {
      org: orgId,
      date_from: start.toISOString(),
      date_to: end.toISOString(),
      f,
    });
    if (n !== seq.current) return;
    setReport((data as Report | null) ?? null);
    setBusy(false);
  }, [orgId, start, end, filters]);
  useEffect(() => {
    void load();
  }, [load]);

  const pct = (v: number | null | undefined) => (v == null ? null : `${nf.format(v)}%`);
  const monthName = (k: string) => {
    const [y, m] = k.split("-").map(Number);
    return new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale, {
      month: "long",
      year: "numeric",
    }).format(new Date(y!, (m ?? 1) - 1, 1));
  };
  const periodText = `${df.format(start)} – ${df.format(new Date(end.getTime() - 1))}`;

  // Dias do período para a evolução (até 62 barras; acima disso, agrupa por semana).
  const evolution = useMemo(() => {
    if (!report) return [];
    const days: { label: string; n: number }[] = [];
    for (let d = new Date(start); d < end; d = new Date(d.getTime() + 86400000)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      days.push({ label: df.format(d), n: report.usage.by_day[key] ?? 0 });
    }
    if (days.length <= 62) return days;
    const weeks: { label: string; n: number }[] = [];
    for (let i = 0; i < days.length; i += 7)
      weeks.push({ label: days[i]!.label, n: days.slice(i, i + 7).reduce((s, x) => s + x.n, 0) });
    return weeks;
  }, [report, start, end, df]);

  function tables(): ExportTable[] {
    if (!report) return [];
    const d = report.documents;
    const s = report.signatures;
    const b = report.bulk;
    const num = (v: number | null | undefined) => (v == null ? "—" : v);
    return [
      {
        name: t.reports.sections.documents,
        headers: [t.reports.metric, t.reports.value],
        rows: (
          [
            "created",
            "sent",
            "waiting_signature",
            "waiting_approval",
            "concluded",
            "refused",
            "canceled",
            "expired",
            "errors",
          ] as const
        ).map((k) => [t.reports.docs[k], d[k] ?? 0]),
      },
      {
        name: t.reports.sections.signatures,
        headers: [t.reports.metric, t.reports.value],
        rows: [
          [t.reports.sig.signed, s.signed],
          [t.reports.sig.approved, s.approved],
          [t.reports.sig.pending, s.pending],
          [t.reports.sig.avgHours, num(s.avg_hours)],
          [t.reports.sig.completionRate, pct(s.completion_rate) ?? "—"],
        ],
      },
      {
        name: t.reports.sections.pending,
        headers: [
          t.reports.pend.person,
          t.reports.pend.email,
          t.reports.pend.role,
          t.reports.pend.document,
          t.reports.pend.since,
          t.reports.pend.days,
          t.reports.pend.reminders,
        ],
        rows: report.pending.oldest.map((p) => [
          p.name,
          p.email,
          t.participants.roles[p.role as "signer"] ?? p.role,
          p.doc_name,
          df.format(new Date(p.since)),
          p.days,
          p.reminder_count,
        ]),
      },
      {
        name: t.reports.sections.bulk,
        headers: [t.reports.metric, t.reports.value],
        rows: (["jobs", "items", "sent", "signed", "pending", "errors"] as const)
          .map((k) => [t.reports.bulkM[k], num(b[k])] as (string | number)[])
          .concat([[t.reports.bulkM.success_rate, pct(b["success_rate"]) ?? "—"]]),
      },
      {
        name: t.reports.sections.usage,
        headers: [t.reports.metric, t.reports.value],
        rows: [
          [t.reports.use.activeUsers, report.usage.active_users],
          [t.reports.use.members, report.usage.members],
          ...Object.entries(report.usage.consumed)
            .sort()
            .map(
              ([k, v]) =>
                [f(t.reports.use.consumedIn, { month: monthName(k) }), v] as (string | number)[],
            ),
        ],
      },
    ];
  }

  async function exportAs(kind: "csv" | "xlsx" | "pdf") {
    const name = `relatorio-mdsign-${start.toISOString().slice(0, 10)}`;
    const all = tables();
    setExporting(kind);
    try {
      if (kind === "csv")
        downloadCsv(
          `${name}.csv`,
          toCsv(
            [t.reports.section, ...all[0]!.headers],
            all.flatMap((tb) =>
              tb.headers.length === 2 ? tb.rows.map((r) => [tb.name, ...r.map(String)]) : [],
            ),
          ),
        );
      else if (kind === "xlsx") downloadBlob(`${name}.xlsx`, toXlsx(all));
      else
        downloadBlob(
          `${name}.pdf`,
          await toPdf(`${t.reports.title} — ${current?.name ?? ""}`, periodText, all),
        );
    } finally {
      setExporting(null);
    }
  }

  const setFilter = (k: string, v: string) => setFilters((x) => ({ ...x, [k]: v }));
  const advanced = featureMode("reports_advanced") === "available";
  const activeFilters = Object.values(filters).filter(Boolean).length;
  // Filtros com título visível; quem/departamento/grupo/modelo só aparecem se houver opções.
  // Relatórios gerenciais (Ipê): período, situação e pessoa da equipe, exportação CSV.
  // Relatórios avançados (Mogno): também origem, modelo, departamento, grupo, pasta, Excel e PDF.
  const filterDefs: { key: keyof typeof t.reports.f; options: Option[] }[] = [
    ...(["user", "unit", "group", "template"] as const)
      .filter((k) => opts[k].length && (advanced || k === "user"))
      .map((k) => ({ key: k, options: opts[k] })),
    {
      key: "status",
      options: (["pending", "concluded", "refused", "canceled", "expired"] as const).map((x) => ({
        id: x,
        name: t.documents.status[x] ?? x,
      })),
    },
    ...(advanced
      ? [
          {
            key: "origin" as const,
            options: Object.keys(t.reports.origins).map((o) => ({
              id: o,
              name: t.reports.origins[o]!,
            })),
          },
        ]
      : []),
    ...(advanced && folders.length
      ? [
          {
            key: "folder" as const,
            options: [{ id: "none", name: t.folders.none }, ...folders],
          },
        ]
      : []),
  ];
  const card = (label: string, value: number | string | null | undefined, tone?: string) => (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("font-display text-2xl font-semibold", tone)}>
        {value == null ? "—" : typeof value === "number" ? nf.format(value) : value}
      </p>
    </div>
  );
  const max = Math.max(1, ...evolution.map((e) => e.n));

  return (
    <>
      <PageHeader
        title={t.reports.title}
        subtitle={t.reports.subtitle}
        actions={
          can("reports.export") && report ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={exporting !== null}>
                  {exporting ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <Download aria-hidden />
                  )}
                  {t.reports.exportLabel}
                  <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(advanced ? (["pdf", "xlsx", "csv"] as const) : (["csv"] as const)).map((k) => (
                  <DropdownMenuItem key={k} onSelect={() => void exportAs(k)}>
                    {k === "pdf" ? (
                      <FileText aria-hidden />
                    ) : k === "xlsx" ? (
                      <FileSpreadsheet aria-hidden />
                    ) : (
                      <Download aria-hidden />
                    )}
                    {t.reports.exportAs[k]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
      />

      <section
        data-tour="reports-filters"
        className="mb-5 grid gap-4 rounded-2xl border bg-white p-4 shadow-sm"
        aria-label={t.reports.filters}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="flex flex-wrap gap-1 rounded-xl bg-muted/60 p-1"
            role="group"
            aria-label={t.reports.period}
          >
            {(["today", "7d", "30d", "month", "lastMonth", "custom"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                aria-pressed={preset === p}
                className={cn(
                  "min-h-8 rounded-lg px-3 text-sm font-medium",
                  preset === p
                    ? "bg-white text-brand-strong shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.reports.presets[p]}
              </button>
            ))}
          </div>
          {/* O período que os números mostram, sempre à vista. */}
          <p className="flex items-center gap-2 text-sm font-semibold" aria-live="polite">
            <CalendarDays className="size-4 text-brand" aria-hidden />
            {periodText}
          </p>
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              {t.reports.from}
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-auto"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              {t.reports.to}
              <Input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="w-auto"
              />
            </label>
          </div>
        )}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3">
          {filterDefs.map((d) => (
            <label key={d.key} className="grid gap-1 text-xs font-medium text-muted-foreground">
              {t.reports.f[d.key]}
              <select
                value={filters[d.key] ?? ""}
                onChange={(e) => setFilter(d.key, e.target.value)}
                className={cn(
                  selectClass,
                  "h-9 w-full text-foreground",
                  filters[d.key] && "border-brand font-semibold text-brand-strong",
                )}
              >
                <option value="">{t.reports.allOption}</option>
                {d.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t.reports.scopeHint}</p>
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
              <X aria-hidden />
              {f(t.reports.clear, { n: String(activeFilters) })}
            </Button>
          )}
        </div>
      </section>

      {!report ? (
        <p className="flex items-center gap-2 text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t.common.loading}
        </p>
      ) : (
        <div className={cn("grid gap-6", busy && "opacity-60")}>
          <section aria-labelledby="r-docs" className="grid gap-2">
            <h2 id="r-docs" className="font-display text-lg font-semibold">
              {t.reports.sections.documents}
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {card(t.reports.docs.created, report.documents["created"])}
              {card(t.reports.docs.sent, report.documents["sent"])}
              {card(
                t.reports.docs.waiting_signature,
                report.documents["waiting_signature"],
                "text-orange-700",
              )}
              {card(
                t.reports.docs.waiting_approval,
                report.documents["waiting_approval"],
                "text-orange-700",
              )}
              {card(t.reports.docs.concluded, report.documents["concluded"], "text-success")}
              {card(t.reports.docs.refused, report.documents["refused"], "text-destructive")}
              {card(t.reports.docs.canceled, report.documents["canceled"])}
              {card(t.reports.docs.expired, report.documents["expired"])}
              {card(t.reports.docs.errors, report.documents["errors"], "text-destructive")}
            </div>
          </section>

          <section aria-labelledby="r-sig" className="grid gap-2">
            <h2 id="r-sig" className="font-display text-lg font-semibold">
              {t.reports.sections.signatures}
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {card(t.reports.sig.signed, report.signatures.signed)}
              {card(t.reports.sig.approved, report.signatures.approved)}
              {card(t.reports.sig.pending, report.signatures.pending, "text-orange-700")}
              {card(t.reports.sig.avgHours, report.signatures.avg_hours)}
              {card(
                t.reports.sig.completionRate,
                report.signatures.completion_rate == null
                  ? null
                  : `${report.signatures.completion_rate}%`,
              )}
            </div>
          </section>

          <section aria-labelledby="r-pend" className="grid gap-2">
            <h2 id="r-pend" className="font-display text-lg font-semibold">
              {t.reports.sections.pending} · {nf.format(report.pending.count)}
            </h2>
            {report.pending.oldest.length === 0 ? (
              <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">
                {t.reports.pend.none}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="p-2 font-medium">{t.reports.pend.person}</th>
                      <th className="p-2 font-medium">{t.reports.pend.document}</th>
                      <th className="p-2 font-medium">{t.reports.pend.since}</th>
                      <th className="p-2 font-medium">{t.reports.pend.days}</th>
                      <th className="p-2 font-medium">{t.reports.pend.reminders}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {report.pending.oldest.map((p) => (
                      <tr key={`${p.document_id}:${p.email}`}>
                        <td className="p-2">
                          {p.name}
                          <span className="block text-xs text-muted-foreground">
                            {t.participants.roles[p.role as "signer"] ?? p.role}
                          </span>
                        </td>
                        <td className="p-2">
                          <Link
                            to="/app/documents/$id"
                            params={{ id: p.document_id }}
                            className="text-brand hover:underline"
                          >
                            {p.doc_name}
                          </Link>
                        </td>
                        <td className="p-2">{df.format(new Date(p.since))}</td>
                        <td className="p-2">{nf.format(p.days)}</td>
                        <td className="p-2">{p.reminder_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(report.pending.by_unit.length > 1 || report.pending.by_group.length > 0) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  [t.reports.pend.byUnit, report.pending.by_unit],
                  [t.reports.pend.byGroup, report.pending.by_group],
                ].map(([title, list]) =>
                  (list as { name: string; n: number }[]).length ? (
                    <div key={title as string} className="rounded-xl border bg-white p-3 text-sm">
                      <p className="mb-1 font-medium">{title as string}</p>
                      <ul>
                        {(list as { name: string; n: number }[]).map((x) => (
                          <li key={x.name} className="flex justify-between">
                            <span>{x.name}</span>
                            <span className="font-semibold">{x.n}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </section>

          <section aria-labelledby="r-bulk" className="grid gap-2">
            <h2 id="r-bulk" className="font-display text-lg font-semibold">
              {t.reports.sections.bulk}
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {(["jobs", "items", "sent", "signed", "pending", "errors"] as const).map((k) => (
                <div key={k}>{card(t.reports.bulkM[k], report.bulk[k])}</div>
              ))}
              {card(t.reports.bulkM.success_rate, pct(report.bulk["success_rate"]))}
            </div>
          </section>

          <section aria-labelledby="r-use" className="grid gap-2">
            <h2 id="r-use" className="font-display text-lg font-semibold">
              {t.reports.sections.usage}
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {card(t.reports.use.activeUsers, report.usage.active_users)}
              {card(t.reports.use.members, report.usage.members)}
              {Object.entries(report.usage.consumed)
                .sort()
                .map(([k, v]) => (
                  <div key={k}>{card(f(t.reports.use.consumedIn, { month: monthName(k) }), v)}</div>
                ))}
            </div>
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="mb-2 text-sm font-medium">{t.reports.use.evolution}</p>
              <div
                className="flex h-32 items-end gap-px"
                role="img"
                aria-label={t.reports.use.evolution}
              >
                {evolution.map((e, i) => (
                  <div
                    key={i}
                    title={`${e.label}: ${e.n}`}
                    className="min-w-[3px] flex-1 rounded-t bg-brand/70"
                    style={{ height: `${(e.n / max) * 100}%` }}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>{evolution[0]?.label}</span>
                <span>{evolution.at(-1)?.label}</span>
              </div>
            </div>
          </section>
          <p className="text-xs text-muted-foreground">{t.reports.noViewInfo}</p>
        </div>
      )}
    </>
  );
}
