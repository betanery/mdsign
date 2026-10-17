// Funcionalidades: catálogo (estado de implementação) e disponibilidade por plano na versão.

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { selectClass } from "../ui";
import { Panel } from "../growth/ui";
import { effectiveMode, rpcErrorCode, type CatalogFeature, type CatalogMode } from "./api";
import { VersionBar, type VersionProps } from "./matrix";
import { fill, usePlansAdminTexts } from "./texts";

const IMPLS = ["functional", "partial", "in_development", "not_applicable"] as const;

export function PlansFeatures(props: VersionProps & { reload: () => Promise<void> }) {
  const P = usePlansAdminTexts();
  const X = P.features;
  const { catalog, version, reload } = props;
  const plans = version.plans ?? [];
  const draft = version.status === "draft";
  const [pending, setPending] = useState<{ f: CatalogFeature; impl: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (e: { message?: string } | null) => {
    const code = rpcErrorCode(e);
    toast.error((code && P.matrix.errors[code]) || P.error);
  };

  const setMode = async (planId: string, code: string, m: string) => {
    const { error } = await supabase.rpc("admin_plan_version_set_feature", {
      vid: version.id,
      pid: planId,
      code,
      m,
    });
    if (error) return fail(error);
    await reload();
  };

  const saveImpl = async () => {
    if (!pending) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_feature_save", {
      code: pending.f.code,
      p: { implementation: pending.impl },
    });
    setBusy(false);
    setPending(null);
    if (error) return fail(error);
    toast.success(P.saved);
    await reload();
  };

  const modeClass: Record<string, string> = {
    available: "bg-green-50 text-green-800",
    preview: "bg-brand-soft text-brand-strong",
    hidden: "bg-muted text-muted-foreground",
    contract: "bg-orange-50 text-orange-800",
  };

  return (
    <div className="grid gap-4">
      <VersionBar {...props} />
      <Panel title={fill(X.byPlan, { version: version.name })} hint={X.implHint}>
        <div className="relative overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="p-2 font-semibold">{P.sections.features}</th>
                <th className="p-2 font-semibold">{X.implementation}</th>
                {plans.map((p) => (
                  <th key={p.plan_id} className="p-2 font-semibold">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {catalog.features.map((f) => (
                <tr key={f.code} className="border-b align-top last:border-0">
                  <th scope="row" className="p-2 text-left font-medium">
                    <span className="block">{f.name}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {f.code}
                      {f.core && ` · ${X.core}`}
                      {f.exclusive_plan && ` · ${fill(X.exclusive, { plan: f.exclusive_plan })}`}
                      {f.permission && ` · ${X.permission}: ${f.permission}`}
                    </span>
                    {f.implementation_note && (
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {f.implementation_note}
                      </span>
                    )}
                  </th>
                  <td className="p-2">
                    <label className="sr-only" htmlFor={`impl-${f.code}`}>
                      {X.implementation}: {f.name}
                    </label>
                    <select
                      id={`impl-${f.code}`}
                      className={cn(selectClass, "w-full")}
                      value={f.implementation}
                      onChange={(e) => setPending({ f, impl: e.target.value })}
                    >
                      {IMPLS.map((i) => (
                        <option key={i} value={i}>
                          {X.implementations[i]}
                        </option>
                      ))}
                    </select>
                  </td>
                  {plans.map((p) => {
                    const configured = p.features[f.code] as CatalogMode | undefined;
                    const eff = effectiveMode(f, p.plan_id, configured);
                    const shown = configured === "contract" ? "contract" : eff;
                    const forced = configured && configured !== "contract" && configured !== eff;
                    const options = [
                      "available",
                      "preview",
                      "hidden",
                      ...(p.plan_id === "mogno" ? ["contract"] : []),
                    ];
                    return (
                      <td key={p.plan_id} className="p-2">
                        {draft && !f.core ? (
                          <>
                            <label className="sr-only" htmlFor={`m-${p.plan_id}-${f.code}`}>
                              {f.name} · {p.name}
                            </label>
                            <select
                              id={`m-${p.plan_id}-${f.code}`}
                              className={cn(
                                selectClass,
                                "w-full",
                                modeClass[configured ?? "hidden"],
                              )}
                              value={configured ?? ""}
                              onChange={(e) => void setMode(p.plan_id, f.code, e.target.value)}
                            >
                              {!configured && <option value="">—</option>}
                              {options.map((m) => (
                                <option key={m} value={m}>
                                  {X.modes[m]}
                                </option>
                              ))}
                            </select>
                          </>
                        ) : (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold",
                              modeClass[shown],
                            )}
                          >
                            {shown === "preview" && <Lock className="size-3" aria-hidden />}
                            {X.modes[shown]}
                          </span>
                        )}
                        {forced && (
                          <span className="mt-1 flex gap-1 text-xs text-orange-700">
                            <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                            {f.implementation !== "functional"
                              ? X.forcedHidden
                              : fill(X.exclusive, { plan: f.exclusive_plan ?? "" })}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending &&
                fill(X.confirmImpl, {
                  name: pending.f.name,
                  state: X.implementations[pending.impl] ?? pending.impl,
                })}
            </DialogTitle>
            <DialogDescription>
              {X.confirmImplText} {X.implHint}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setPending(null)}>
              {P.cancel}
            </Button>
            <Button
              className="bg-brand hover:bg-brand-strong"
              disabled={busy}
              onClick={() => void saveImpl()}
            >
              {P.settings.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
