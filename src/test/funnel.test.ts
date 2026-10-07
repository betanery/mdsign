import { beforeEach, describe, expect, it } from "vitest";

import { cedroMessage, freeUsage } from "@/app/components/free-plan-card";
import type { OrgUsage } from "@/app/components/plan-usage";
import pt from "@/i18n/app/pt";
import { acquisition, CAMPAIGN_SLUGS, DEFAULT_VARIANT } from "@/content/acquisition";
import { captureUtm, getAttribution, setCampaign } from "@/lib/analytics";

const usage = (plan: string, used: number): OrgUsage => ({
  plan_id: plan,
  plan_name: plan,
  status: "active",
  billing_status: "free",
  documents_total_limit: plan === "cedro" ? 5 : null,
  documents_total_used: used,
  documents_month_limit: null,
  documents_month_used: used,
  users_max: 1,
  users_used: 1,
  has_total_limit: plan === "cedro",
  has_month_limit: false,
});

describe("Cedro: consumo e mensagens do funil", () => {
  it("só existe para o plano grátis", () => {
    expect(freeUsage(usage("ipe", 3))).toBeNull();
    expect(freeUsage(usage("cedro", 3))).toEqual({ used: 3, limit: 5, left: 2 });
  });
  it("mensagens no 2º, 4º e 5º documento", () => {
    expect(cedroMessage(pt, 1, 5)).toBeNull();
    expect(cedroMessage(pt, 2, 5)?.text).toBe(pt.cedro.keepGoing);
    expect(cedroMessage(pt, 3, 5)?.text).toBe(pt.cedro.keepGoing);
    expect(cedroMessage(pt, 4, 5)?.text).toBe(pt.cedro.oneLeft);
    expect(cedroMessage(pt, 5, 5)?.tone).toBe("danger");
  });
});

describe("landing de aquisição", () => {
  it("tem a variante padrão e as de campanha nos três idiomas", () => {
    for (const l of ["pt", "en", "es"] as const) {
      for (const slug of [DEFAULT_VARIANT, ...CAMPAIGN_SLUGS])
        expect(acquisition[l].variants[slug]?.campaign).toBe(slug);
    }
    expect(acquisition.pt.variants[DEFAULT_VARIANT]?.title).toBe(
      "Assine documentos online gratuitamente.",
    );
  });
});

describe("origem da campanha (first-touch)", () => {
  beforeEach(() => sessionStorage.clear());
  it("guarda UTMs, página de entrada e campanha, uma vez por sessão", () => {
    window.history.replaceState(null, "", "/pt/assinar-gratis?utm_source=google&utm_campaign=out");
    captureUtm();
    setCampaign("assinar-gratis");
    window.history.replaceState(null, "", "/pt?utm_source=outra");
    captureUtm();
    setCampaign("outra");
    const a = getAttribution();
    expect(a.landing_page).toBe("/pt/assinar-gratis");
    expect(a.campaign).toBe("assinar-gratis");
    expect(a.utm_campaign).toBe("out");
    expect(a.first_seen_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
