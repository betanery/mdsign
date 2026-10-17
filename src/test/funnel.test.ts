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

describe("Cedro: disponibilidade de 6 meses", () => {
  it("soma os meses como o banco, inclusive no fim do mês", async () => {
    const { availableUntil } = await import("@/app/availability");
    expect(availableUntil("2026-10-14T12:00:00", 6).getMonth()).toBe(3); // abril
    const end = availableUntil("2026-08-31T12:00:00", 6);
    expect([end.getMonth(), end.getDate()]).toEqual([1, 28]); // 28/02
  });
});

describe("origem da campanha: primeira e última, com consentimento", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  const visit = (url: string, referrer = "") => {
    Object.defineProperty(document, "referrer", { value: referrer, configurable: true });
    window.history.replaceState(null, "", url);
    captureUtm();
  };

  it("primeira origem fica; última muda só com UTM ou referência externa", async () => {
    const { getLastTouch, getAcquisitionPayload } = await import("@/lib/analytics");
    visit("/pt/assinar-gratis?utm_source=instagram&utm_medium=paid_social&utm_campaign=outubro");
    visit("/pt/precos");
    expect(getLastTouch()?.utm_campaign).toBe("outubro");
    visit("/pt/lp/assinar-pdf-gratis?utm_source=google&utm_medium=cpc&utm_campaign=busca");
    expect(getAttribution().utm_campaign).toBe("outubro");
    expect(getLastTouch()?.utm_campaign).toBe("busca");
    const acq = getAcquisitionPayload();
    expect(acq.utm_source).toBe("instagram");
    expect(acq.last?.utm_source).toBe("google");
    expect(acq.session_id).toMatch(/^[0-9a-f]{24}$/);
  });

  it("sem consentimento nada vai para o navegador; com consentimento guarda; retirar apaga", async () => {
    const { saveConsent } = await import("@/lib/consent");
    const { SAVED_KEY } = await import("@/lib/attribution-store");
    visit("/pt/assinar-gratis?utm_source=linkedin&utm_campaign=b2b");
    expect(localStorage.getItem(SAVED_KEY)).toBeNull();
    saveConsent({ analytics: true, marketing: false });
    expect(JSON.parse(localStorage.getItem(SAVED_KEY)!).first.utm_campaign).toBe("b2b");
    // Nova aba (sessão vazia): a origem guardada volta.
    sessionStorage.clear();
    visit("/pt");
    expect(getAttribution().utm_campaign).toBe("b2b");
    saveConsent({ analytics: false, marketing: false });
    expect(localStorage.getItem(SAVED_KEY)).toBeNull();
  });

  it("ambiente de teste e ?interno=1 marcam tráfego interno", async () => {
    const { isInternalTraffic, getAcquisitionPayload } = await import("@/lib/analytics");
    // jsdom roda em localhost: ambiente de teste.
    expect(isInternalTraffic()).toBe(true);
    expect(getAcquisitionPayload().internal).toBe("1");
    visit("/pt?interno=1");
    expect(localStorage.getItem("mdsign_internal")).toBe("1");
    visit("/pt?interno=0");
    expect(localStorage.getItem("mdsign_internal")).toBeNull();
  });
});
