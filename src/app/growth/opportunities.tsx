import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, MessageSquareText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAppI18n } from "../i18n";
import { selectClass } from "../ui";
import { downloadCsv, growthApi, type Opportunity } from "./api";
import { fill, useGrowthTexts } from "./texts";
import { bigSwitch, fmtDay, Pager, Panel, StagePill, useOriginLabel } from "./ui";

const SIZE = 25;
const ORDER = ["pql_hot", "opportunity", "pql", "recurring", "activated", "signed_up", "paid"];

/** Sinais declarados (qualificação) e de uso, em linguagem comercial. */
function signalsOf(o: Opportunity) {
  const out = [...o.signals];
  const q = o.qualification as {
    bulk_interest?: boolean;
    integration_interest?: boolean;
    users_count?: number;
    monthly_volume?: number;
  } | null;
  if (q?.bulk_interest) out.push("bulk_interest");
  if (q?.integration_interest) out.push("integration_interest");
  if ((q?.users_count ?? 0) >= 2) out.push("users");
  if ((q?.monthly_volume ?? 0) >= 20) out.push("volume");
  return out;
}

export function GrowthOpportunities() {
  const g = useGrowthTexts();
  const { locale } = useAppI18n();
  const origin = useOriginLabel();
  const [stage, setStage] = useState("pql_hot");
  const [owner, setOwner] = useState("");
  const [internal, setInternal] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    total: number;
    counts: Record<string, number>;
    rows: Opportunity[];
  } | null>(null);
  const [admins, setAdmins] = useState<{ id: string; name: string }[]>([]);
  const [notesOf, setNotesOf] = useState<Opportunity | null>(null);
  const [error, setError] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    growthApi
      .admins()
      .then(setAdmins)
      .catch(() => undefined);
  }, []);
  useEffect(() => setPage(1), [stage, owner, internal]);
  const load = useCallback(() => {
    const mine = ++seq.current;
    setError(false);
    growthApi
      .opportunities({ stage, owner, internal, page, size: SIZE })
      .then((r) => mine === seq.current && setData(r))
      .catch(() => mine === seq.current && setError(true));
  }, [stage, owner, internal, page]);
  useEffect(load, [load]);

  async function setOwnerOf(o: Opportunity, id: string) {
    try {
      await growthApi.setOwner(o.id, id || null);
      toast.success(g.saved);
      load();
    } catch {
      toast.error(g.error);
    }
  }

  async function exportCsv() {
    const all: Opportunity[] = [];
    for (let p = 1; p <= 10; p++) {
      const r = await growthApi.opportunities({ stage, owner, internal, page: p, size: 100 });
      all.push(...r.rows);
      if (all.length >= r.total) break;
    }
    await growthApi.logExport("opportunities", all.length);
    downloadCsv(
      "mdsign-growth-oportunidades.csv",
      [
        "organizacao",
        "classificacao",
        "plano",
        "documentos_concluidos",
        "gratis_usados",
        "sinais",
        "origem_primeira",
        "campanha_primeira",
        "origem_ultima",
        "campanha_ultima",
        "responsavel",
        "ultima_atividade",
      ],
      all.map((o) => [
        o.name,
        g.stages[o.stage] ?? o.stage,
        o.plan_id,
        o.concluded,
        o.free_used,
        signalsOf(o)
          .map((s) => g.opp.signal[s] ?? s)
          .join(", "),
        origin(o.first_source),
        o.first_campaign,
        origin(o.last_source),
        o.last_campaign,
        o.owner_name,
        o.last_activity?.slice(0, 10),
      ]),
    );
    toast.success(g.exported);
  }

  return (
    <div className="grid gap-4">
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        {g.opp.noAutoNote}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={g.opp.stage}>
        {ORDER.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={stage === s}
            onClick={() => setStage(s)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium",
              stage === s ? "border-brand bg-brand text-white" : "bg-white hover:bg-brand-soft",
            )}
          >
            {g.stages[s]} <span className="tabular-nums opacity-80">{data?.counts[s] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{g.opp.owner}</span>
          <select className={selectClass} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">{g.opp.anyOwner}</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={internal}
            onCheckedChange={setInternal}
            aria-label={g.filters.internal}
            className={bigSwitch}
          />
          {g.filters.internal}
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

      <Panel>
        {error ? (
          <p className="text-sm text-destructive">{g.error}</p>
        ) : !data ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {g.loading}
          </p>
        ) : data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{g.opp.empty}</p>
        ) : (
          <>
            <ul className="grid gap-3">
              {data.rows.map((o) => (
                <li
                  key={o.id}
                  className="grid gap-2 rounded-xl border p-4 md:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {o.name}
                      <StagePill stage={o.stage} />
                      <span className="text-xs font-normal text-muted-foreground">{o.plan_id}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {fill(g.opp.documents, { concluded: o.concluded, free: o.free_used })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {g.opp.origin}: {origin(o.first_source)}
                      {o.first_campaign ? ` · ${o.first_campaign}` : ""}
                      {o.last_campaign && o.last_campaign !== o.first_campaign
                        ? ` → ${o.last_campaign}`
                        : ""}
                    </p>
                    {signalsOf(o).length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {signalsOf(o).map((s) => (
                          <span
                            key={s}
                            className="rounded bg-orange-50 px-1.5 py-0.5 text-[11px] font-semibold text-orange-800"
                          >
                            {g.opp.signal[s] ?? s}
                          </span>
                        ))}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {g.opp.lastActivity}: {fmtDay(o.last_activity, locale)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-start gap-2 md:flex-col md:items-end">
                    <select
                      aria-label={`${g.opp.owner}: ${o.name}`}
                      className={selectClass}
                      value={o.owner_id ?? ""}
                      onChange={(e) => void setOwnerOf(o, e.target.value)}
                    >
                      <option value="">{g.opp.noOwner}</option>
                      {admins.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" variant="outline" onClick={() => setNotesOf(o)}>
                      <MessageSquareText aria-hidden />
                      {g.opp.notes} ({o.notes})
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <Pager page={page} size={SIZE} total={data.total} onPage={setPage} />
          </>
        )}
      </Panel>

      <Notes org={notesOf} onClose={() => setNotesOf(null)} onAdded={load} />
    </div>
  );
}

function Notes({
  org,
  onClose,
  onAdded,
}: {
  org: Opportunity | null;
  onClose: () => void;
  onAdded: () => void;
}) {
  const g = useGrowthTexts();
  const { locale } = useAppI18n();
  const [list, setList] = useState<
    { id: number; body: string; at: string; author: string }[] | null
  >(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!org) return;
    growthApi
      .notes(org.id)
      .then(setList)
      .catch(() => setList([]));
  }, [org]);
  useEffect(() => {
    setList(null);
    setBody("");
    load();
  }, [load]);

  async function add() {
    if (!org || !body.trim()) return;
    setBusy(true);
    try {
      await growthApi.addNote(org.id, body.trim());
      setBody("");
      toast.success(g.opp.noteSaved);
      load();
      onAdded();
    } catch {
      toast.error(g.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={Boolean(org)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{g.opp.notes}</SheetTitle>
          <SheetDescription>{org?.name}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-6">
          <div className="grid gap-2">
            <Label htmlFor="note-body">{g.opp.addNote}</Label>
            <Textarea
              id="note-body"
              rows={3}
              maxLength={2000}
              placeholder={g.opp.notePlaceholder}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <Button
              className="justify-self-end bg-brand hover:bg-brand-strong"
              disabled={!body.trim() || busy}
              onClick={() => void add()}
            >
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {g.save}
            </Button>
          </div>
          {list === null ? (
            <p className="text-sm text-muted-foreground">{g.loading}</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">{g.opp.noNotes}</p>
          ) : (
            <ol className="grid gap-3">
              {list.map((n) => (
                <li key={n.id} className="rounded-lg border p-3 text-sm">
                  <p className="whitespace-pre-line">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {n.author} · {fmtDay(n.at, locale, true)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
