import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { growthApi, type GrowthSettings } from "./api";
import { useGrowthTexts } from "./texts";
import { Panel } from "./ui";

const list = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

/** Configurações de Growth: auditadas; não alcançam preço, franquia nem cobrança. */
export function GrowthSettingsPanel() {
  const g = useGrowthTexts();
  const S = g.settings;
  const [cfg, setCfg] = useState<GrowthSettings | null>(null);
  const [stages, setStages] = useState<Record<string, number> | null>(null);
  const [text, setText] = useState({ channels: "", mediums: "", domains: "", orgs: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    growthApi
      .settings()
      .then((r) => {
        setCfg(r.settings);
        setStages(r.stages);
        setText({
          channels: r.settings.channels.join(", "),
          mediums: r.settings.mediums.join(", "),
          domains: r.settings.internal_email_domains.join(", "),
          orgs: r.settings.exclude_org_ids.join("\n"),
        });
      })
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="text-sm text-destructive">{g.error}</p>;
  if (!cfg || !stages)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {g.loading}
      </p>
    );

  async function save() {
    if (!cfg || !stages) return;
    setBusy(true);
    try {
      await growthApi.saveSettings({
        ...cfg,
        channels: list(text.channels),
        mediums: list(text.mediums),
        internal_email_domains: list(text.domains),
        exclude_org_ids: list(text.orgs),
      });
      await growthApi.saveStages(stages);
      toast.success(g.saved);
    } catch {
      toast.error(S.invalid);
    } finally {
      setBusy(false);
    }
  }

  const num = (v: string) => (v === "" ? 0 : Math.max(0, Math.min(100000, Number(v) || 0)));

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={`${S.channels} · ${S.mediums}`} hint={S.listHint}>
          <div className="grid gap-1">
            <Label htmlFor="gs-channels">{S.channels}</Label>
            <Textarea
              id="gs-channels"
              rows={2}
              value={text.channels}
              onChange={(e) => setText((t) => ({ ...t, channels: e.target.value }))}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="gs-mediums">{S.mediums}</Label>
            <Textarea
              id="gs-mediums"
              rows={2}
              value={text.mediums}
              onChange={(e) => setText((t) => ({ ...t, mediums: e.target.value }))}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="gs-naming">{S.naming}</Label>
            <Input
              id="gs-naming"
              maxLength={300}
              value={cfg.naming_hint}
              onChange={(e) => setCfg({ ...cfg, naming_hint: e.target.value })}
            />
          </div>
        </Panel>

        <Panel title={S.attribution} hint={S.attributionHint}>
          <div className="grid gap-1">
            <Label htmlFor="gs-days">{S.attribution}</Label>
            <Input
              id="gs-days"
              type="number"
              min={1}
              max={30}
              className="w-32"
              value={cfg.attribution_days}
              onChange={(e) => setCfg({ ...cfg, attribution_days: Number(e.target.value) || 0 })}
            />
          </div>
          <h4 className="pt-2 text-sm font-semibold">{S.goals}</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["visit_to_signup", "signup_to_activation", "activation_to_paid"] as const).map(
              (k) => (
                <div key={k} className="grid gap-1">
                  <Label htmlFor={`gs-goal-${k}`}>{S.goal[k]}</Label>
                  <Input
                    id={`gs-goal-${k}`}
                    type="number"
                    min={0}
                    max={100}
                    value={cfg.goals[k] ?? ""}
                    onChange={(e) =>
                      setCfg({
                        ...cfg,
                        goals: {
                          ...cfg.goals,
                          [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                        },
                      })
                    }
                  />
                </div>
              ),
            )}
          </div>
        </Panel>

        <Panel title={S.pqlTitle}>
          {(
            [
              ["pql_docs", S.pqlDocs],
              ["hot_docs", S.hotDocs],
              ["opportunity_volume", S.volume],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="grid gap-1">
              <Label htmlFor={`gs-${k}`}>{label}</Label>
              <Input
                id={`gs-${k}`}
                type="number"
                min={0}
                className="w-32"
                value={stages[k] ?? ""}
                onChange={(e) => setStages({ ...stages, [k]: num(e.target.value) })}
              />
            </div>
          ))}
        </Panel>

        <Panel title={S.internalDomains} hint={S.excludeHint}>
          <div className="grid gap-1">
            <Label htmlFor="gs-domains">{S.internalDomains}</Label>
            <Input
              id="gs-domains"
              value={text.domains}
              onChange={(e) => setText((t) => ({ ...t, domains: e.target.value }))}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="gs-orgs">{S.excludeOrgs}</Label>
            <Textarea
              id="gs-orgs"
              rows={3}
              className="font-mono text-xs"
              value={text.orgs}
              onChange={(e) => setText((t) => ({ ...t, orgs: e.target.value }))}
            />
          </div>
        </Panel>
      </div>

      <Panel title={S.access}>
        <ul className="grid gap-1 text-sm text-muted-foreground">
          <li>{S.accessText}</li>
          <li>{S.audit}</li>
          <li>{S.noPricing}</li>
        </ul>
      </Panel>

      <div className="flex justify-end">
        <Button
          className="bg-brand hover:bg-brand-strong"
          onClick={() => void save()}
          disabled={busy}
        >
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {g.save}
        </Button>
      </div>
    </div>
  );
}
