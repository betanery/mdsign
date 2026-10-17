import { useEffect, useRef, useState } from "react";
import { Download, History, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { selectClass } from "../ui";
import { useAppI18n } from "../i18n";
import { downloadCsv, growthApi, type Filters, type LeadRow } from "./api";
import { useGrowthTexts } from "./texts";
import { fmtDay, Pager, Panel, PeriodLine, StagePill, useOriginLabel } from "./ui";

const SIZE = 25;

/** Leads e cadastros: formulário, cadastrado, ativado e pago, sem duplicar a mesma pessoa. */
export function GrowthLeads({ filters }: { filters: Filters }) {
  const g = useGrowthTexts();
  const { locale } = useAppI18n();
  const origin = useOriginLabel();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [sort, setSort] = useState("created_at");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; rows: LeadRow[] } | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<LeadRow | null>(null);
  const seq = useRef(0);

  useEffect(() => setPage(1), [filters, q, kind, sort]);
  useEffect(() => {
    const mine = ++seq.current;
    const t = setTimeout(() => {
      setError(false);
      growthApi
        .leads(filters, { q: q.trim(), kind, page, size: SIZE, sort })
        .then((r) => mine === seq.current && setData(r))
        .catch(() => mine === seq.current && setError(true));
    }, 250);
    return () => clearTimeout(t);
  }, [filters, q, kind, sort, page]);

  async function exportCsv() {
    // Até 1.000 linhas do filtro atual; e-mail só com aceite comercial ou formulário de contato.
    const all: LeadRow[] = [];
    for (let p = 1; p <= 10; p++) {
      const r = await growthApi.leads(filters, { q: q.trim(), kind, page: p, size: 100, sort });
      all.push(...r.rows);
      if (all.length >= r.total) break;
    }
    await growthApi.logExport("leads", all.length);
    downloadCsv(
      `mdsign-growth-leads-${filters.from}-a-${filters.to}.csv`,
      [
        "tipo",
        "nome",
        "email",
        "empresa",
        "cadastro",
        "origem",
        "campanha",
        "landing",
        "plano",
        "estagio",
        "documentos",
        "interesse",
        "comunicacoes_comerciais",
      ],
      all.map((r) => [
        g.leads.kinds[r.kind],
        r.name,
        r.row_type === "form" || r.marketing ? r.email : "",
        r.organization,
        r.created_at.slice(0, 10),
        origin(r.source),
        r.campaign,
        r.landing,
        r.plan_id,
        r.stage ? g.stages[r.stage] : "",
        r.docs_used,
        r.interest ? (g.leads.interest[r.interest] ?? r.interest) : "",
        r.marketing === null ? "" : r.marketing ? g.leads.yes : g.leads.no,
      ]),
    );
    toast.success(g.exported);
  }

  const L = g.leads.columns;
  return (
    <div className="grid gap-4">
      <PeriodLine f={filters} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label htmlFor="ld-q" className="sr-only">
            {g.leads.search}
          </Label>
          <Input
            id="ld-q"
            placeholder={g.leads.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-72 max-w-full"
          />
        </div>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{g.leads.kind}</span>
          <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">{g.filters.all}</option>
            {(["form", "registered", "activated", "paid"] as const).map((k) => (
              <option key={k} value={k}>
                {g.leads.kinds[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{g.leads.sort}</span>
          <select className={selectClass} value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(g.leads.sorts).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          className="ml-auto"
          onClick={() => void exportCsv()}
          disabled={!data?.total}
        >
          <Download aria-hidden />
          {g.export}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{g.leads.exportNote}</p>

      <Panel>
        {error ? (
          <p className="text-sm text-destructive">{g.error}</p>
        ) : !data ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {g.loading}
          </p>
        ) : data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{g.empty}</p>
        ) : (
          <>
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase">
                    {[
                      L.name,
                      L.organization,
                      L.created,
                      L.origin,
                      L.campaign,
                      L.landing,
                      L.plan,
                      L.stage,
                      L.docs,
                      L.interest,
                      L.marketing,
                      "",
                    ].map((h, i) => (
                      <th key={i} className="py-2 pr-3 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={`${r.row_type}-${r.id}`} className="border-t align-top">
                      <td className="py-2 pr-3">
                        <span className="block font-medium">{r.name ?? "—"}</span>
                        <span className="block text-xs text-muted-foreground">{r.email}</span>
                        <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold">
                          {g.leads.kinds[r.kind]}
                        </span>
                        {r.also_form && (
                          <span className="ml-1 text-[11px] text-muted-foreground">
                            {g.leads.alsoForm}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">{r.organization ?? "—"}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {fmtDay(r.created_at, locale)}
                      </td>
                      <td className="py-2 pr-3">{origin(r.source)}</td>
                      <td className="py-2 pr-3">{r.campaign ?? "—"}</td>
                      <td className="py-2 pr-3">{r.landing ?? "—"}</td>
                      <td className="py-2 pr-3">{r.plan_id ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <StagePill stage={r.stage} />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.docs_used ?? "—"}</td>
                      <td className="py-2 pr-3">
                        {r.interest ? (g.leads.interest[r.interest] ?? r.interest) : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {r.marketing === null ? "—" : r.marketing ? g.leads.yes : g.leads.no}
                      </td>
                      <td className="py-2">
                        {r.row_type === "user" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setOpen(r)}
                            aria-label={`${g.leads.history}: ${r.name ?? ""}`}
                          >
                            <History aria-hidden />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} size={SIZE} total={data.total} onPage={setPage} />
          </>
        )}
      </Panel>

      <Timeline row={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Timeline({ row, onClose }: { row: LeadRow | null; onClose: () => void }) {
  const g = useGrowthTexts();
  const { locale } = useAppI18n();
  const [data, setData] = useState<Awaited<ReturnType<typeof growthApi.timeline>> | null>(null);

  useEffect(() => {
    setData(null);
    if (!row) return;
    growthApi
      .timeline(row.id, row.org_id)
      .then(setData)
      .catch(() => toast.error(g.error));
  }, [row, g.error]);

  const a = data?.acquisition ?? null;
  const touch = (prefix: "" | "last_") =>
    a
      ? [
          a[`${prefix}utm_source`],
          a[`${prefix}utm_medium`],
          a[`${prefix}utm_campaign`],
          a[`${prefix}landing_page`],
          a[`${prefix}referrer`],
        ]
          .filter(Boolean)
          .join(" · ") || g.origin.nao_identificada
      : g.origin.nao_identificada;

  return (
    <Sheet open={Boolean(row)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{g.leads.historyTitle}</SheetTitle>
          <SheetDescription>
            {row?.name} {row?.organization ? `· ${row.organization}` : ""}
          </SheetDescription>
        </SheetHeader>
        {!data ? (
          <p className="px-4 text-sm text-muted-foreground">{g.loading}</p>
        ) : (
          <div className="grid gap-4 px-4 pb-6 text-sm">
            <dl className="grid gap-2">
              <dt className="font-semibold">{g.leads.firstTouch}</dt>
              <dd className="text-muted-foreground">{touch("")}</dd>
              <dt className="font-semibold">{g.leads.lastTouch}</dt>
              <dd className="text-muted-foreground">
                {a?.["last_seen_at"] ? touch("last_") : g.na}
              </dd>
            </dl>
            <div>
              <h4 className="mb-1 font-semibold">{g.leads.events}</h4>
              {data.events.length === 0 ? (
                <p className="text-muted-foreground">{g.leads.noEvents}</p>
              ) : (
                <ol className="grid gap-1.5">
                  {data.events.map((e, i) => (
                    <li key={i} className="flex justify-between gap-3 border-b pb-1.5">
                      <span className="font-mono text-xs">{e.event}</span>
                      <span className="text-xs whitespace-nowrap text-muted-foreground">
                        {fmtDay(e.at, locale, true)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <h4 className="mb-1 font-semibold">{g.leads.consents}</h4>
              <ul className="grid gap-1">
                {data.consents.map((c, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    {c.kind}: {c.granted ? g.leads.yes : g.leads.no} · {c.version ?? "—"} ·{" "}
                    {fmtDay(c.at, locale)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
