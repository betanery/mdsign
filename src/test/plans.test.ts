import { describe, expect, it } from "vitest";

import { featureTexts } from "@/app/features";
import { planDirection } from "@/app/components/plan-chooser";
import { navItems, MAX_MENU_PREVIEWS } from "@/app/components/app-shell";
import {
  docsOf,
  effectiveMode,
  hiddenNavItems,
  parseMoney,
  simulateNav,
  type Catalog,
  type CatalogFeature,
  type CatalogPlan,
} from "@/app/plans-admin/api";
import { plansAdminTexts } from "@/app/plans-admin/texts";
import { planPageTexts } from "@/routes/app/_shell/plan";
import { validateTexts } from "@/routes/$lang/validar";

const shape = (o: unknown, prefix = ""): string[] =>
  o && typeof o === "object" && !Array.isArray(o)
    ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => shape(v, `${prefix}.${k}`))
    : [prefix];

const feature = (code: string, extra: Partial<CatalogFeature> = {}): CatalogFeature => ({
  code,
  name: code,
  description: "",
  benefit: null,
  category: "produtividade",
  implementation: "functional",
  implementation_note: null,
  depends_on: [],
  permission: null,
  nav_keys: [],
  core: false,
  exclusive_plan: null,
  sort: 0,
  ...extra,
});

const plan = (
  plan_id: string,
  features: CatalogPlan["features"],
  entitlements = {},
): CatalogPlan => ({
  plan_id,
  name: plan_id,
  price_cents: 0,
  period: plan_id === "mogno" ? "contract" : "month",
  description: null,
  benefits: [],
  sort: 0,
  highlight: false,
  is_public: true,
  cta: null,
  audience: null,
  entitlements,
  features,
});

const ALL = [
  "documents.view",
  "documents.create",
  "bulk.send",
  "reports.export",
  "integrations.manage",
  "templates.manage",
];

const cedro = plan(
  "cedro",
  {
    contacts: "available",
    templates: "preview",
    bulk_send: "preview",
    reports: "preview",
    api_webhooks: "preview",
  },
  { documents_total: 5, users_max: 1 },
);
const ipe = plan(
  "ipe",
  {
    contacts: "available",
    templates: "available",
    bulk_send: "available",
    reports: "available",
    api_webhooks: "available",
  },
  { users_max: 10 },
);
const mogno = plan("mogno", {
  contacts: "available",
  templates: "available",
  bulk_send: "available",
  reports: "available",
  api_webhooks: "contract",
});

const catalog: Catalog = {
  current: "v1",
  versions: [],
  features: [
    feature("contacts"),
    feature("templates"),
    feature("bulk_send"),
    feature("reports"),
    feature("api_webhooks", { exclusive_plan: "mogno" }),
    feature("whatsapp", { implementation: "in_development" }),
  ],
  roles: { owner: ALL, viewer: ["documents.view"] },
  cost: {},
};

const keys = (nav: { item: { key: string }; locked: boolean }[]) =>
  nav.map((n) => (n.locked ? `${n.item.key}*` : n.item.key));

describe("Planos & Funcionalidades: mesma regra do servidor", () => {
  it("contrato só vale no Mogno; exclusividade vira prévia; não funcional fica oculto", () => {
    const api = catalog.features[4]!;
    expect(effectiveMode(api, "mogno", "contract")).toBe("available");
    expect(effectiveMode(api, "ipe", "contract")).toBe("hidden");
    expect(effectiveMode(api, "ipe", "available")).toBe("preview");
    expect(effectiveMode(catalog.features[5]!, "ipe", "available")).toBe("hidden");
    expect(effectiveMode(catalog.features[0]!, "ipe", undefined)).toBe("hidden");
  });

  it("Cedro: no máximo 2 recursos com cadeado no menu, na ordem do menu", () => {
    const { nav } = simulateNav(catalog, cedro, "owner");
    expect(nav.filter((n) => n.locked)).toHaveLength(MAX_MENU_PREVIEWS);
    expect(keys(nav)).toEqual([
      "home",
      "documents",
      "contacts",
      "templates*",
      "bulk*",
      "organization",
      "plan",
      "settings",
    ]);
    expect(hiddenNavItems(navItems, nav).map((i) => i.key)).toEqual(["reports", "integrations"]);
  });

  it("Ipê: tudo disponível menos API (exclusiva do Mogno, aparece com cadeado)", () => {
    const { nav } = simulateNav(catalog, ipe, "owner");
    expect(keys(nav)).toContain("reports");
    expect(keys(nav)).toContain("integrations*");
  });

  it("Mogno com API por contrato: Integrações liberadas", () => {
    expect(keys(simulateNav(catalog, mogno, "owner").nav)).toContain("integrations");
  });

  it("permissão do papel vem antes do plano (visualizador não vê envio em massa nem relatórios)", () => {
    const k = keys(simulateNav(catalog, ipe, "viewer").nav);
    expect(k).not.toContain("bulk");
    expect(k).not.toContain("reports");
    expect(k).not.toContain("integrations*");
  });

  it("franquia e preço digitados", () => {
    expect(docsOf(cedro)).toEqual({ mode: "total", value: 5 });
    expect(docsOf(ipe)).toEqual({ mode: "unlimited", value: null });
    expect(docsOf(mogno)).toEqual({ mode: "contract", value: null });
    expect(parseMoney("39,90")).toBe(3990);
    expect(parseMoney("R$ 1.999,70")).toBe(199970);
    expect(parseMoney("0,03")).toBe(3);
    expect(parseMoney("1,999")).toBeNull();
    expect(parseMoney("-1")).toBeNull();
  });

  it("textos com as mesmas chaves nos 3 idiomas", () => {
    for (const T of [plansAdminTexts, planPageTexts, featureTexts, validateTexts] as Record<
      string,
      unknown
    >[]) {
      expect(shape(T["en"])).toEqual(shape(T["pt"]));
      expect(shape(T["es"])).toEqual(shape(T["pt"]));
    }
  });

  it("mudar de plano: atual, mais recursos ou plano menor pela ordem da matriz", () => {
    const order = [
      { id: "cedro", sort: 10 },
      { id: "jacaranda", sort: 20 },
      { id: "angico", sort: 30 },
      { id: "mogno", sort: 60 },
    ];
    expect(planDirection(order, "jacaranda", "jacaranda")).toBe("current");
    expect(planDirection(order, "jacaranda", "angico")).toBe("up");
    expect(planDirection(order, "jacaranda", "mogno")).toBe("up");
    expect(planDirection(order, "angico", "jacaranda")).toBe("down");
    expect(planDirection(order, "angico", "cedro")).toBe("down");
  });
});
