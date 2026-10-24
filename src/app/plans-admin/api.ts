// Super Admin → Planos & Funcionalidades: tipos do catálogo e as regras puras usadas pelo
// simulador e pela navegação por plano (as mesmas do servidor e do menu do app).

import { useCallback, useEffect, useState } from "react";

import { buildNav, type NavItem } from "../components/app-shell";
import type { FeatureCode, FeatureMode } from "../features";
import type { OrgRole, Permission } from "../org";
import { supabase } from "@/lib/supabase";

export type CatalogMode = FeatureMode | "contract";

export type CatalogPlan = {
  plan_id: string;
  name: string;
  price_cents: number | null;
  period: "one_time" | "month" | "contract" | null;
  description: string | null;
  benefits: string[] | null;
  sort: number;
  highlight: boolean;
  is_public: boolean;
  cta: string | null;
  audience: string | null;
  entitlements: Record<string, number | boolean>;
  features: Record<string, CatalogMode>;
};

export type CatalogVersion = {
  id: string;
  name: string;
  status: "draft" | "published" | "retired";
  notes: string | null;
  created_at: string;
  published_at: string | null;
  subscriptions: number;
  plans: CatalogPlan[] | null;
};

export type CatalogFeature = {
  code: string;
  name: string;
  description: string;
  benefit: string | null;
  category: string;
  implementation: "functional" | "partial" | "in_development" | "not_applicable";
  implementation_note: string | null;
  depends_on: string[];
  permission: string | null;
  nav_keys: string[];
  core: boolean;
  exclusive_plan: string | null;
  sort: number;
};

export type Catalog = {
  current: string | null;
  versions: CatalogVersion[];
  features: CatalogFeature[];
  roles: Record<string, string[]>;
  cost: { cents_per_document?: number; exceptional_month_docs?: number };
};

export const ROLES: OrgRole[] = [
  "owner",
  "admin",
  "manager",
  "operator",
  "member",
  "viewer",
  "finance",
];

/** Mensagem de erro conhecida do servidor (ex.: "invalid_plan") ou null. */
export function rpcErrorCode(error: { message?: string } | null | undefined) {
  const m = error?.message ?? "";
  return /^[a-z_]+$/.test(m) ? m : null;
}

export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState(false);
  const reload = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("admin_plans_catalog");
    if (e) return setError(true);
    setError(false);
    // Planos fora do catálogo naquela versão (ex.: Angico e Aroeira no lançamento) não aparecem
    // na matriz, no simulador nem nos indicadores: ficam só para o histórico.
    const c = data as Catalog;
    setCatalog({
      ...c,
      versions: c.versions.map((v) => ({
        ...v,
        plans: v.plans?.filter((p) => p.is_public) ?? null,
      })),
    });
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { catalog, error, reload };
}

/**
 * Modo efetivo de uma funcionalidade num plano, igual a feature_mode() no servidor (sem
 * condições individuais de contrato): contrato só vale no Mogno; exclusividade vira prévia;
 * recurso não funcional nunca aparece como disponível.
 */
export function effectiveMode(
  feature: Pick<CatalogFeature, "implementation" | "exclusive_plan">,
  planId: string,
  configured: CatalogMode | undefined,
): FeatureMode {
  let m: CatalogMode = configured ?? "hidden";
  if (m === "contract") m = planId === "mogno" ? "available" : "hidden";
  if (feature.exclusive_plan && feature.exclusive_plan !== planId && m === "available")
    m = "preview";
  if (feature.implementation !== "functional" && m === "available") m = "hidden";
  return m;
}

export function planModes(catalog: Catalog, plan: CatalogPlan) {
  const out = {} as Record<string, FeatureMode>;
  for (const f of catalog.features)
    out[f.code] = effectiveMode(f, plan.plan_id, plan.features[f.code]);
  return out;
}

/** Menu que a pessoa veria no app, com a mesma função do menu real. */
export function simulateNav(catalog: Catalog, plan: CatalogPlan, role: OrgRole) {
  const modes = planModes(catalog, plan);
  const perms = new Set(catalog.roles[role] ?? []);
  const nav = buildNav(
    (code: FeatureCode) => modes[code] ?? "hidden",
    (p: Permission) => perms.has(p),
  );
  return { modes, nav };
}

/** Itens do menu fora da visão (por permissão, por plano ou pelo limite de 2 prévias). */
export function hiddenNavItems(all: NavItem[], shown: { item: NavItem }[]) {
  const keys = new Set(shown.map((s) => s.item.key));
  return all.filter((i) => !keys.has(i.key));
}

/** Reais digitados ("39,90", "39.9") → centavos inteiros; null se inválido. */
export function parseMoney(v: string): number | null {
  const s = v
    .trim()
    .replace(/\s|R\$/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export const centsToInput = (c: number | null | undefined) =>
  c === null || c === undefined ? "" : (c / 100).toFixed(2).replace(".", ",");

export function docsOf(plan: CatalogPlan): {
  mode: "total" | "month" | "unlimited" | "contract";
  value: number | null;
} {
  const e = plan.entitlements;
  if (typeof e["documents_total"] === "number")
    return { mode: "total", value: e["documents_total"] };
  if (typeof e["documents_month"] === "number")
    return { mode: "month", value: e["documents_month"] };
  if (plan.period === "contract") return { mode: "contract", value: null };
  return { mode: "unlimited", value: null };
}
