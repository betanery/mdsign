// Matriz de planos: preços, franquias, usuários e apresentação. Só o rascunho é editável;
// publicar exige confirmação e passa pela validação do servidor.

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Send } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useMoney } from "../features";
import { selectClass } from "../ui";
import { bigSwitch, Panel } from "../growth/ui";
import {
  centsToInput,
  docsOf,
  parseMoney,
  rpcErrorCode,
  type Catalog,
  type CatalogPlan,
  type CatalogVersion,
} from "./api";
import { VersionSelect } from "./shared";
import { fill, usePlansAdminTexts } from "./texts";

export type VersionProps = {
  catalog: Catalog;
  version: CatalogVersion;
  onVersion: (id: string) => void;
};

/** Ações de versão: criar rascunho (se não houver) e publicar o rascunho. */
export function VersionBar({
  catalog,
  version,
  onVersion,
  reload,
}: VersionProps & { reload: () => Promise<void> }) {
  const P = usePlansAdminTexts();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasDraft = catalog.versions.some((v) => v.status === "draft");

  const fail = (e: { message?: string } | null) => {
    const code = rpcErrorCode(e);
    toast.error((code && P.matrix.errors[code]) || P.error);
  };

  const createDraft = async () => {
    if (!catalog.current) return;
    setBusy(true);
    const d = new Date();
    const id = `rascunho_${d.toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
    const { error } = await supabase.rpc("admin_plan_version_clone", {
      from_id: catalog.current,
      new_id: id,
      new_name: fill(P.draftName, { date: d.toLocaleDateString("pt-BR") }),
    });
    setBusy(false);
    if (error) return fail(error);
    await reload();
    onVersion(id);
  };

  const publish = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_publish_plan_version", { vid: version.id });
    setBusy(false);
    setConfirm(false);
    if (error) return fail(error);
    toast.success(P.published);
    await reload();
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <VersionSelect catalog={catalog} value={version.id} onChange={onVersion} />
      <div className="flex flex-wrap gap-2">
        {!hasDraft && (
          <Button variant="outline" disabled={busy} onClick={() => void createDraft()}>
            <Plus aria-hidden />
            {P.newDraft}
          </Button>
        )}
        {version.status === "draft" && (
          <Button
            className="bg-brand hover:bg-brand-strong"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            <Send aria-hidden />
            {P.publish}
          </Button>
        )}
      </div>
      {version.status !== "draft" && (
        <p className="w-full text-xs text-muted-foreground">{P.readOnly}</p>
      )}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fill(P.publishTitle, { name: version.name })}</DialogTitle>
            <DialogDescription>{P.publishText}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {P.cancel}
            </Button>
            <Button
              className="bg-brand hover:bg-brand-strong"
              disabled={busy}
              onClick={() => void publish()}
            >
              {P.publish}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PlansMatrix(props: VersionProps & { reload: () => Promise<void> }) {
  const P = usePlansAdminTexts();
  const M = P.matrix;
  const money = useMoney();
  const [editing, setEditing] = useState<CatalogPlan | null>(null);
  const { version } = props;
  const draft = version.status === "draft";
  const plans = version.plans ?? [];

  const priceLabel = (p: CatalogPlan) =>
    p.plan_id === "mogno" || p.period === "contract"
      ? M.contract
      : !p.price_cents
        ? M.free
        : money(p.price_cents);
  const docsLabel = (p: CatalogPlan) => {
    const d = docsOf(p);
    return d.value ? `${d.value} · ${M.docsModes[d.mode]}` : M.docsModes[d.mode];
  };

  return (
    <div className="grid gap-4">
      <VersionBar {...props} />
      <Panel title={P.sections.matrix}>
        <div className="relative overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                {[M.plan, M.price, M.period, M.docs, M.users, M.public, M.highlight, ""].map(
                  (h, i) => (
                    <th key={i} className="p-2 font-semibold">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.plan_id} className="border-b last:border-0">
                  <th scope="row" className="p-2 text-left font-semibold">
                    {p.name}
                  </th>
                  <td className="p-2 tabular-nums">{priceLabel(p)}</td>
                  <td className="p-2">{M.periods[p.period ?? "month"] ?? p.period}</td>
                  <td className="p-2">{docsLabel(p)}</td>
                  <td className="p-2 tabular-nums">
                    {typeof p.entitlements["users_max"] === "number"
                      ? p.entitlements["users_max"]
                      : M.contract}
                  </td>
                  <td className="p-2">{p.is_public ? "✓" : "—"}</td>
                  <td className="p-2">{p.highlight ? "★" : "—"}</td>
                  <td className="p-2 text-right">
                    {draft && (
                      <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                        <Pencil aria-hidden />
                        {M.edit}
                        <span className="sr-only"> {p.name}</span>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {editing && (
        <PlanEditor
          key={editing.plan_id}
          plan={editing}
          versionId={version.id}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await props.reload();
          }}
        />
      )}
    </div>
  );
}

function PlanEditor({
  plan,
  versionId,
  onClose,
  onSaved,
}: {
  plan: CatalogPlan;
  versionId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const P = usePlansAdminTexts();
  const F = P.matrix.fields;
  const isCedro = plan.plan_id === "cedro";
  const isMogno = plan.plan_id === "mogno";
  const d0 = docsOf(plan);
  const [price, setPrice] = useState(centsToInput(plan.price_cents ?? 0));
  const [dMode, setDMode] = useState(d0.mode);
  const [dValue, setDValue] = useState(d0.value ? String(d0.value) : "");
  const [users, setUsers] = useState(
    typeof plan.entitlements["users_max"] === "number"
      ? String(plan.entitlements["users_max"])
      : "",
  );
  const [description, setDescription] = useState(plan.description ?? "");
  const [audience, setAudience] = useState(plan.audience ?? "");
  const [benefits, setBenefits] = useState((plan.benefits ?? []).join("\n"));
  const [sort, setSort] = useState(String(plan.sort));
  const [highlight, setHighlight] = useState(plan.highlight);
  const [isPublic, setIsPublic] = useState(plan.is_public);
  const [cta, setCta] = useState(plan.cta ?? "");
  const [busy, setBusy] = useState(false);

  const modes = isCedro
    ? (["total"] as const)
    : isMogno
      ? (["contract", "month", "unlimited"] as const)
      : (["month", "unlimited"] as const);

  const save = async () => {
    const cents = isMogno ? null : parseMoney(price);
    if (!isMogno && cents === null) return void toast.error(P.matrix.errors["invalid_plan"]);
    const p = {
      price_cents: cents,
      documents: {
        mode: dMode,
        value: dMode === "total" || dMode === "month" ? Number(dValue) : null,
      },
      users_max: users.trim() ? Number(users) : null,
      description,
      audience,
      benefits: benefits
        .split("\n")
        .map((b) => b.trim())
        .filter(Boolean),
      sort: Number(sort) || plan.sort,
      highlight,
      is_public: isPublic,
      cta,
    };
    setBusy(true);
    const { error } = await supabase.rpc("admin_plan_version_save_plan", {
      vid: versionId,
      pid: plan.plan_id,
      p,
    });
    setBusy(false);
    if (error) {
      const code = rpcErrorCode(error);
      return void toast.error((code && P.matrix.errors[code]) || P.error);
    }
    toast.success(P.saved);
    await onSaved();
  };

  const id = (k: string) => `plan-${plan.plan_id}-${k}`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {P.matrix.edit}: {plan.name}
          </DialogTitle>
          <DialogDescription>{P.subtitle}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          {!isMogno && (
            <div className="grid gap-1">
              <Label htmlFor={id("price")}>{F.price}</Label>
              <Input
                id={id("price")}
                inputMode="decimal"
                value={price}
                disabled={isCedro}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor={id("dmode")}>{F.docsMode}</Label>
              <select
                id={id("dmode")}
                className={cn(selectClass, "w-full")}
                value={dMode}
                onChange={(e) => setDMode(e.target.value as typeof dMode)}
              >
                {modes.map((m) => (
                  <option key={m} value={m}>
                    {P.matrix.docsModes[m]}
                  </option>
                ))}
              </select>
            </div>
            {(dMode === "total" || dMode === "month") && (
              <div className="grid gap-1">
                <Label htmlFor={id("dval")}>{F.docsValue}</Label>
                <Input
                  id={id("dval")}
                  inputMode="numeric"
                  value={dValue}
                  onChange={(e) => setDValue(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            )}
          </div>
          <div className="grid gap-1">
            <Label htmlFor={id("users")}>{F.users}</Label>
            <Input
              id={id("users")}
              inputMode="numeric"
              value={users}
              placeholder={isMogno ? F.usersContract : undefined}
              onChange={(e) => setUsers(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={id("desc")}>{F.description}</Label>
            <Textarea
              id={id("desc")}
              maxLength={300}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={id("aud")}>{F.audience}</Label>
            <Input
              id={id("aud")}
              maxLength={200}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={id("ben")}>{F.benefits}</Label>
            <Textarea
              id={id("ben")}
              rows={4}
              value={benefits}
              onChange={(e) => setBenefits(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor={id("cta")}>{F.cta}</Label>
              <Input
                id={id("cta")}
                maxLength={40}
                value={cta}
                onChange={(e) => setCta(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={id("sort")}>{F.sort}</Label>
              <Input
                id={id("sort")}
                inputMode="numeric"
                value={sort}
                onChange={(e) => setSort(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>
          <label className="flex items-center justify-between gap-3">
            <span>{F.highlight}</span>
            <Switch className={bigSwitch} checked={highlight} onCheckedChange={setHighlight} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>{F.isPublic}</span>
            <Switch className={bigSwitch} checked={isPublic} onCheckedChange={setIsPublic} />
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>
            {P.cancel}
          </Button>
          <Button
            className="bg-brand hover:bg-brand-strong"
            disabled={busy}
            onClick={() => void save()}
          >
            {P.settings.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
