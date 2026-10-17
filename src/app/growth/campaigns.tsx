import { useCallback, useEffect, useState } from "react";
import { Copy, Download, Link2, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useConfirm } from "../components/confirm-dialog";
import { useAppI18n } from "../i18n";
import { selectClass } from "../ui";
import {
  buildTrackedUrl,
  CAMPAIGN_SLUG,
  downloadCsv,
  growthApi,
  landingOptions,
  slugify,
  UTM_VALUE,
  type Campaign,
  type CampaignStatus,
  type GrowthSettings,
  type TrackedLink,
} from "./api";
import { fill, useGrowthTexts } from "./texts";
import { fmtDay, Panel } from "./ui";

const statusTone: Record<CampaignStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-success/15 text-green-800",
  paused: "bg-orange-100 text-orange-800",
  ended: "bg-muted text-foreground",
};

type Draft = {
  id?: string | undefined;
  slug: string;
  name: string;
  description: string;
  channel: string;
  medium: string;
  landing_path: string;
  starts_on: string;
  ends_on: string;
  owner_name: string;
  objective: string;
  status: CampaignStatus;
  budget: string;
  notes: string;
};

const emptyDraft = (): Draft => ({
  slug: "",
  name: "",
  description: "",
  channel: "",
  medium: "",
  landing_path: "/pt/assinar-gratis",
  starts_on: "",
  ends_on: "",
  owner_name: "",
  objective: "",
  status: "draft",
  budget: "",
  notes: "",
});

const toDraft = (c: Campaign): Draft => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  description: c.description ?? "",
  channel: c.channel ?? "",
  medium: c.medium ?? "",
  landing_path: c.landing_path ?? "",
  starts_on: c.starts_on ?? "",
  ends_on: c.ends_on ?? "",
  owner_name: c.owner_name ?? "",
  objective: c.objective ?? "",
  status: c.status,
  budget: c.budget_cents == null ? "" : String(c.budget_cents / 100).replace(".", ","),
  notes: c.notes ?? "",
});

export function useSettings() {
  const [settings, setSettings] = useState<GrowthSettings | null>(null);
  useEffect(() => {
    growthApi
      .settings()
      .then((r) => setSettings(r.settings))
      .catch(() => undefined);
  }, []);
  return settings;
}

/** Campanhas: cadastrar, editar, duplicar, pausar/encerrar, ver resultados e links. */
export function GrowthCampaigns({ onLinks }: { onLinks: (campaignId: string) => void }) {
  const g = useGrowthTexts();
  const { locale } = useAppI18n();
  const settings = useSettings();
  const [confirm, confirmDialog] = useConfirm();
  const [list, setList] = useState<Campaign[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    growthApi
      .campaigns(q.trim(), status)
      .then(setList)
      .catch(() => setError(true));
  }, [q, status]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function changeStatus(c: Campaign, st: CampaignStatus) {
    if (st === "ended") {
      const ok = await confirm({
        title: fill(g.campaigns.endTitle, { name: c.name }),
        text: g.campaigns.endText,
        action: g.campaigns.end,
      });
      if (!ok) return;
    }
    try {
      await growthApi.setCampaignStatus(c.id, st);
      toast.success(g.saved);
      load();
    } catch {
      toast.error(g.error);
    }
  }

  async function exportCsv() {
    if (!list) return;
    await growthApi.logExport("campaigns", list.length);
    downloadCsv(
      "mdsign-growth-campanhas.csv",
      [
        "identificador",
        "nome",
        "status",
        "canal",
        "meio",
        "destino",
        "inicio",
        "termino",
        "responsavel",
        "orcamento_reais",
        "links",
        "visitas",
        "cadastros_primeira_origem",
        "cadastros_ultima_origem",
        "pagos_ultima_origem",
      ],
      list.map((c) => [
        c.slug,
        c.name,
        g.campaigns.status[c.status],
        c.channel,
        c.medium,
        c.landing_path,
        c.starts_on,
        c.ends_on,
        c.owner_name,
        c.budget_cents == null ? "" : (c.budget_cents / 100).toFixed(2).replace(".", ","),
        c.links,
        c.visits,
        c.signups_first,
        c.signups_last,
        c.paid_last,
      ]),
    );
    toast.success(g.exported);
  }

  return (
    <div className="grid gap-4">
      {confirmDialog}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label htmlFor="c-q" className="sr-only">
            {g.campaigns.search}
          </Label>
          <Input
            id="c-q"
            placeholder={g.campaigns.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-72 max-w-full"
          />
        </div>
        <select
          aria-label={g.campaigns.fields.status}
          className={selectClass}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{g.filters.all}</option>
          {(["draft", "active", "paused", "ended"] as const).map((s) => (
            <option key={s} value={s}>
              {g.campaigns.status[s]}
            </option>
          ))}
        </select>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void exportCsv()} disabled={!list?.length}>
            <Download aria-hidden />
            {g.export}
          </Button>
          <Button className="bg-brand hover:bg-brand-strong" onClick={() => setDraft(emptyDraft())}>
            <Plus aria-hidden />
            {g.campaigns.new}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{g.error}</p>
      ) : list === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {g.loading}
        </p>
      ) : list.length === 0 ? (
        <Panel>
          <p className="text-sm text-muted-foreground">{g.campaigns.emptyList}</p>
        </Panel>
      ) : (
        <ul className="grid gap-3">
          {list.map((c) => (
            <li key={c.id}>
              <Panel>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {c.name}
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          statusTone[c.status],
                        )}
                      >
                        {g.campaigns.status[c.status]}
                      </span>
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">{c.slug}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[c.channel, c.medium, c.landing_path, c.owner_name]
                        .filter(Boolean)
                        .join(" · ")}
                      {(c.starts_on || c.ends_on) &&
                        ` · ${fmtDay(c.starts_on ? `${c.starts_on}T12:00:00` : null, locale)} – ${fmtDay(c.ends_on ? `${c.ends_on}T12:00:00` : null, locale)}`}
                    </p>
                    {c.objective && <p className="mt-1 text-sm">{c.objective}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDraft(toDraft(c))}>
                      <Pencil aria-hidden />
                      {g.campaigns.edit}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setDraft({
                          ...toDraft(c),
                          id: undefined,
                          slug: `${c.slug}_copia`.slice(0, 80),
                          name: `${c.name} (cópia)`.slice(0, 160),
                          status: "draft",
                        })
                      }
                    >
                      <Copy aria-hidden />
                      {g.campaigns.duplicate}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onLinks(c.id)}>
                      <Link2 aria-hidden />
                      {g.campaigns.links} ({c.links})
                    </Button>
                    {c.status !== "active" && c.status !== "ended" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void changeStatus(c, "active")}
                      >
                        {g.campaigns.activate}
                      </Button>
                    )}
                    {c.status === "active" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void changeStatus(c, "paused")}
                      >
                        {g.campaigns.pause}
                      </Button>
                    )}
                    {c.status !== "ended" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void changeStatus(c, "ended")}
                      >
                        {g.campaigns.end}
                      </Button>
                    )}
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  {(
                    [
                      [g.campaigns.visits, c.visits],
                      [g.campaigns.signupsFirst, c.signups_first],
                      [g.campaigns.signupsLast, c.signups_last],
                      [g.campaigns.paidLast, c.paid_last],
                    ] as const
                  ).map(([label, n]) => (
                    <div key={label} className="rounded-lg bg-muted/50 p-2">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="font-display text-lg font-bold tabular-nums">{n}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <CampaignDialog
          draft={draft}
          settings={settings}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CampaignDialog({
  draft: initial,
  settings,
  onClose,
  onSaved,
}: {
  draft: Draft;
  settings: GrowthSettings | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const g = useGrowthTexts();
  const [d, setD] = useState<Draft>(initial);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.id) || Boolean(initial.slug));
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const editing = Boolean(d.id);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const f = g.campaigns.fields;

  function validate() {
    const p: string[] = [];
    if (d.name.trim().length < 2 || d.name.trim().length > 160) p.push("name");
    if (!CAMPAIGN_SLUG.test(d.slug)) p.push("slug");
    if (d.starts_on && d.ends_on && d.ends_on < d.starts_on) p.push("dates");
    if (d.budget && !/^\d{1,9}([.,]\d{1,2})?$/.test(d.budget.trim())) p.push("budget");
    if (d.channel && !UTM_VALUE.test(d.channel)) p.push("channel");
    if (d.medium && !UTM_VALUE.test(d.medium)) p.push("medium");
    return p;
  }

  async function save() {
    const p = validate();
    setProblems(p);
    if (p.length) return;
    setBusy(true);
    try {
      await growthApi.saveCampaign({
        id: d.id ?? null,
        slug: d.slug,
        name: d.name.trim(),
        description: d.description.trim(),
        channel: d.channel,
        medium: d.medium,
        landing_path: d.landing_path,
        starts_on: d.starts_on,
        ends_on: d.ends_on,
        owner_name: d.owner_name.trim(),
        objective: d.objective.trim(),
        status: d.status,
        budget_cents: d.budget ? Math.round(Number(d.budget.replace(",", ".")) * 100) : "",
        notes: d.notes.trim(),
      });
      toast.success(g.saved);
      onSaved();
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "";
      toast.error(g.campaigns.errors[msg] ?? g.error);
    } finally {
      setBusy(false);
    }
  }

  const err = (k: string) =>
    problems.includes(k) ? (
      <p className="text-xs text-destructive">
        {g.campaigns.errors[k] ?? (k === "channel" || k === "medium" ? g.links.invalid : "")}
      </p>
    ) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? g.campaigns.edit : g.campaigns.new}</DialogTitle>
          {settings?.naming_hint && <DialogDescription>{settings.naming_hint}</DialogDescription>}
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1 sm:col-span-2">
            <Label htmlFor="cd-name">{f.name}</Label>
            <Input
              id="cd-name"
              value={d.name}
              maxLength={160}
              aria-invalid={problems.includes("name")}
              onChange={(e) =>
                set({
                  name: e.target.value,
                  ...(slugTouched ? {} : { slug: slugify(e.target.value) }),
                })
              }
            />
            {err("name")}
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label htmlFor="cd-slug">{f.slug}</Label>
            <Input
              id="cd-slug"
              value={d.slug}
              disabled={editing}
              className="font-mono"
              aria-invalid={problems.includes("slug")}
              onChange={(e) => {
                setSlugTouched(true);
                set({ slug: e.target.value.toLowerCase().replace(/\s+/g, "_") });
              }}
            />
            <p className="text-xs text-muted-foreground">{f.slugHint}</p>
            {err("slug")}
          </div>
          <div className="grid gap-1">
            <Label htmlFor="cd-channel">{f.channel}</Label>
            <Input
              id="cd-channel"
              list="cd-channels"
              value={d.channel}
              aria-invalid={problems.includes("channel")}
              onChange={(e) => set({ channel: e.target.value.toLowerCase().trim() })}
            />
            <datalist id="cd-channels">
              {settings?.channels.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {err("channel")}
          </div>
          <div className="grid gap-1">
            <Label htmlFor="cd-medium">{f.medium}</Label>
            <Input
              id="cd-medium"
              list="cd-mediums"
              value={d.medium}
              aria-invalid={problems.includes("medium")}
              onChange={(e) => set({ medium: e.target.value.toLowerCase().trim() })}
            />
            <datalist id="cd-mediums">
              {settings?.mediums.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {err("medium")}
          </div>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium">{f.landing}</span>
            <select
              className={cn(selectClass, "w-full min-w-0")}
              value={d.landing_path}
              onChange={(e) => set({ landing_path: e.target.value })}
            >
              {landingOptions().map((o) => (
                <option key={o.path} value={o.path}>
                  {o.path} — {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-1">
            <Label htmlFor="cd-start">{f.starts}</Label>
            <Input
              id="cd-start"
              type="date"
              value={d.starts_on}
              onChange={(e) => set({ starts_on: e.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="cd-end">{f.ends}</Label>
            <Input
              id="cd-end"
              type="date"
              value={d.ends_on}
              min={d.starts_on || undefined}
              aria-invalid={problems.includes("dates")}
              onChange={(e) => set({ ends_on: e.target.value })}
            />
            {err("dates")}
          </div>
          <div className="grid gap-1">
            <Label htmlFor="cd-owner">{f.owner}</Label>
            <Input
              id="cd-owner"
              value={d.owner_name}
              maxLength={120}
              onChange={(e) => set({ owner_name: e.target.value })}
            />
          </div>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{f.status}</span>
            <select
              className={selectClass}
              value={d.status}
              onChange={(e) => set({ status: e.target.value as CampaignStatus })}
            >
              {(["draft", "active", "paused", "ended"] as const).map((s) => (
                <option key={s} value={s}>
                  {g.campaigns.status[s]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-1 sm:col-span-2">
            <Label htmlFor="cd-objective">{f.objective}</Label>
            <Input
              id="cd-objective"
              value={d.objective}
              maxLength={300}
              onChange={(e) => set({ objective: e.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="cd-budget">{f.budget}</Label>
            <Input
              id="cd-budget"
              inputMode="decimal"
              value={d.budget}
              aria-invalid={problems.includes("budget")}
              onChange={(e) => set({ budget: e.target.value })}
            />
            {err("budget")}
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label htmlFor="cd-desc">{f.description}</Label>
            <Textarea
              id="cd-desc"
              rows={2}
              maxLength={1000}
              value={d.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label htmlFor="cd-notes">{f.notes}</Label>
            <Textarea
              id="cd-notes"
              rows={2}
              maxLength={2000}
              value={d.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {g.cancel}
          </Button>
          <Button
            className="bg-brand hover:bg-brand-strong"
            onClick={() => void save()}
            disabled={busy}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {g.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Gerador de links rastreáveis + histórico (por campanha ou todos). */
export function GrowthLinks({
  campaignId,
  onCampaign,
}: {
  campaignId: string;
  onCampaign: (id: string) => void;
}) {
  const g = useGrowthTexts();
  const { locale } = useAppI18n();
  const settings = useSettings();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [links, setLinks] = useState<TrackedLink[] | null>(null);
  const [form, setForm] = useState({
    label: "",
    landing_path: "/pt/assinar-gratis",
    utm_source: "",
    utm_medium: "",
    utm_content: "",
    utm_term: "",
  });
  const [busy, setBusy] = useState(false);
  const campaign = campaigns?.find((c) => c.id === campaignId) ?? null;

  useEffect(() => {
    growthApi
      .campaigns()
      .then(setCampaigns)
      .catch(() => setCampaigns([]));
  }, []);
  const loadLinks = useCallback(() => {
    growthApi
      .links(campaignId || undefined)
      .then(setLinks)
      .catch(() => setLinks([]));
  }, [campaignId]);
  useEffect(loadLinks, [loadLinks]);

  // Sugere canal, meio e destino a partir da campanha.
  useEffect(() => {
    if (!campaign) return;
    setForm((f) => ({
      ...f,
      utm_source: campaign.channel ?? f.utm_source,
      utm_medium: campaign.medium ?? f.utm_medium,
      landing_path: campaign.landing_path ?? f.landing_path,
    }));
  }, [campaign]);

  const values = { ...form, utm_campaign: campaign?.slug ?? "" };
  const invalid: string[] = [];
  for (const k of ["utm_source", "utm_medium", "utm_campaign"] as const)
    if (!UTM_VALUE.test(values[k])) invalid.push(k);
  for (const k of ["utm_content", "utm_term"] as const)
    if (values[k] && !UTM_VALUE.test(values[k])) invalid.push(k);
  const url = campaign && !invalid.length ? buildTrackedUrl(values) : "";

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(g.copied);
    } catch {
      toast.error(g.copyFail);
    }
  }

  async function save() {
    if (!campaign || invalid.length) return;
    setBusy(true);
    try {
      await growthApi.saveLink({ ...values, campaign_id: campaign.id });
      toast.success(g.saved);
      setForm((f) => ({ ...f, label: "", utm_content: "", utm_term: "" }));
      loadLinks();
    } catch {
      toast.error(g.error);
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    if (!links) return;
    await growthApi.logExport("links", links.length);
    downloadCsv(
      "mdsign-growth-links.csv",
      [
        "link",
        "campanha",
        "criativo",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "ativo",
        "visitas",
        "criado_em",
      ],
      links.map((l) => [
        buildTrackedUrl(l),
        l.campaign_slug,
        l.label,
        l.utm_source,
        l.utm_medium,
        l.utm_campaign,
        l.utm_content,
        l.utm_term,
        l.active ? "sim" : "não",
        l.visits,
        l.created_at.slice(0, 10),
      ]),
    );
    toast.success(g.exported);
  }

  const field = (key: keyof typeof form, label: string, utm = true) => (
    <div className="grid gap-1">
      <Label htmlFor={`lk-${key}`}>{label}</Label>
      <Input
        id={`lk-${key}`}
        list={key === "utm_source" ? "lk-sources" : key === "utm_medium" ? "lk-mediums" : undefined}
        value={form[key]}
        aria-invalid={invalid.includes(key)}
        onChange={(e) =>
          setForm((f) => ({
            ...f,
            [key]: utm ? e.target.value.toLowerCase().trim() : e.target.value,
          }))
        }
      />
      {invalid.includes(key) && form[key] && (
        <p className="text-xs text-destructive">{g.links.invalid}</p>
      )}
    </div>
  );

  return (
    <div className="grid gap-4">
      <Panel
        title={g.links.title}
        hint={fill(g.links.domainNote, {
          domain: new URL(
            buildTrackedUrl({
              landing_path: "/",
              utm_source: "x",
              utm_medium: "x",
              utm_campaign: "x",
            }),
          ).host,
        })}
      >
        {campaigns && campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">{g.links.noCampaigns}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="font-medium">{g.links.campaign}</span>
                <select
                  className={cn(selectClass, "w-full min-w-0")}
                  value={campaignId}
                  onChange={(e) => onCampaign(e.target.value)}
                >
                  <option value="">{g.links.chooseCampaign}</option>
                  {campaigns
                    ?.filter((c) => c.status !== "ended" || c.id === campaignId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.slug})
                      </option>
                    ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="font-medium">{g.links.landing}</span>
                <select
                  className={cn(selectClass, "w-full min-w-0")}
                  value={form.landing_path}
                  onChange={(e) => setForm((f) => ({ ...f, landing_path: e.target.value }))}
                >
                  {landingOptions().map((o) => (
                    <option key={o.path} value={o.path}>
                      {o.path} — {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {field("utm_source", g.links.source)}
              {field("utm_medium", g.links.medium)}
              <div className="grid gap-1">
                <Label htmlFor="lk-campaign">{g.links.campaignUtm}</Label>
                <Input
                  id="lk-campaign"
                  value={values.utm_campaign}
                  disabled
                  className="font-mono"
                />
              </div>
              {field("label", g.links.label, false)}
              {field("utm_content", g.links.content)}
              {field("utm_term", g.links.term)}
              <datalist id="lk-sources">
                {settings?.channels.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <datalist id="lk-mediums">
                {settings?.mediums.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="lk-url">{g.links.preview}</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="lk-url"
                  readOnly
                  value={url}
                  className="min-w-0 flex-1 font-mono text-xs"
                  onFocus={(e) => e.target.select()}
                />
                <Button variant="outline" disabled={!url} onClick={() => void copy(url)}>
                  <Copy aria-hidden />
                  {g.copy}
                </Button>
                <Button
                  className="bg-brand hover:bg-brand-strong"
                  disabled={!url || busy}
                  onClick={() => void save()}
                >
                  {busy && <Loader2 className="animate-spin" aria-hidden />}
                  {g.links.saveLink}
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>

      <Panel
        title={g.links.history}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void exportCsv()}
            disabled={!links?.length}
          >
            <Download aria-hidden />
            {g.export}
          </Button>
        }
      >
        {links === null ? (
          <p className="text-sm text-muted-foreground">{g.loading}</p>
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground">{g.links.empty}</p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase">
                  <th className="py-2 pr-3 font-semibold">{g.links.columns.link}</th>
                  <th className="py-2 pr-3 font-semibold">{g.links.columns.campaign}</th>
                  <th className="py-2 pr-3 font-semibold">{g.links.columns.label}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{g.links.columns.visits}</th>
                  <th className="py-2 pr-3 font-semibold">{g.links.columns.created}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {links.map((l) => {
                  const u = buildTrackedUrl(l);
                  return (
                    <tr key={l.id} className={cn("border-t", !l.active && "text-muted-foreground")}>
                      <td className="max-w-[22rem] py-2 pr-3">
                        <span className="block truncate font-mono text-xs" title={u}>
                          {u}
                        </span>
                        {!l.active && <span className="text-xs">{g.links.inactive}</span>}
                      </td>
                      <td className="py-2 pr-3">{l.campaign_name}</td>
                      <td className="py-2 pr-3">{l.label ?? l.utm_content ?? "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{l.visits}</td>
                      <td className="py-2 pr-3">{fmtDay(l.created_at, locale)}</td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void copy(u)}
                            aria-label={`${g.copy} ${u}`}
                          >
                            <Copy aria-hidden />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              void growthApi
                                .setLinkActive(l.id, !l.active)
                                .then(loadLinks)
                                .catch(() => toast.error(g.error))
                            }
                          >
                            {l.active ? g.links.deactivate : g.links.reactivate}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
