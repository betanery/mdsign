import { describe, expect, it } from "vitest";

import { growthTexts } from "@/app/growth/texts";
import {
  buildTrackedUrl,
  CAMPAIGN_SLUG,
  landingOptions,
  slugify,
  UTM_VALUE,
} from "@/app/growth/api";

const shape = (o: unknown, prefix = ""): string[] =>
  o && typeof o === "object"
    ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => shape(v, `${prefix}.${k}`))
    : [prefix];

describe("Growth & Aquisição", () => {
  it("textos com as mesmas chaves nos 3 idiomas", () => {
    expect(shape(growthTexts.en)).toEqual(shape(growthTexts.pt));
    expect(shape(growthTexts.es)).toEqual(shape(growthTexts.pt));
  });

  it("identificador padronizado a partir do nome", () => {
    expect(slugify("Lançamento MDSign Outubro!")).toBe("lancamento_mdsign_outubro");
    expect(CAMPAIGN_SLUG.test(slugify("Lançamento MDSign Outubro"))).toBe(true);
    expect(CAMPAIGN_SLUG.test("Com Espaço")).toBe(false);
    expect(UTM_VALUE.test("paid_social")).toBe(true);
    expect(UTM_VALUE.test("Paid Social")).toBe(false);
  });

  it("gera o link no domínio do ambiente, com as UTMs e sem campos vazios", () => {
    const url = new URL(
      buildTrackedUrl({
        landing_path: "/pt/assinar-gratis",
        utm_source: "instagram",
        utm_medium: "paid_social",
        utm_campaign: "lancamento_mdsign_outubro",
        utm_content: "",
      }),
    );
    expect(url.pathname).toBe("/pt/assinar-gratis");
    expect(url.searchParams.get("utm_source")).toBe("instagram");
    expect(url.searchParams.get("utm_medium")).toBe("paid_social");
    expect(url.searchParams.get("utm_campaign")).toBe("lancamento_mdsign_outubro");
    expect(url.searchParams.has("utm_content")).toBe(false);
  });

  it("destinos são as landings existentes nos 3 idiomas", () => {
    const paths = landingOptions().map((o) => o.path);
    expect(paths).toContain("/pt/assinar-gratis");
    expect(paths).toContain("/es/lp/assinar-pdf-gratis");
    expect(paths.every((p) => /^\/[a-z0-9/_-]+$/.test(p))).toBe(true);
  });
});

describe("Cedro: avisos da franquia gratuita", () => {
  it("3º mostra o Jacarandá, 4º avisa que resta 1, 5º destaca o upgrade", async () => {
    const { cedroMessage } = await import("@/app/components/free-plan-card");
    const { appMessages } = await import("@/app/i18n");
    const t = appMessages.pt;
    const offer = { price_cents: 3990, documents_month: 50 };
    expect(cedroMessage(t, 1, 5, offer)).toBeNull();
    expect(cedroMessage(t, 3, 5, offer)?.text).toContain("50 documentos por mês");
    expect(cedroMessage(t, 3, 5, offer)?.text).toContain("39,90");
    expect(cedroMessage(t, 4, 5, offer)?.tone).toBe("warn");
    expect(cedroMessage(t, 5, 5, offer)?.tone).toBe("danger");
    // Sem a oferta carregada, o 3º não inventa números.
    expect(cedroMessage(t, 3, 5, null)?.text).toBe(t.cedro.keepGoing);
  });
});

describe("Matriz comercial (Super Admin)", () => {
  it("textos com as mesmas chaves nos 3 idiomas", async () => {
    const { commercialTexts } = await import("@/app/components/admin-commercial");
    expect(shape(commercialTexts.en)).toEqual(shape(commercialTexts.pt));
    expect(shape(commercialTexts.es)).toEqual(shape(commercialTexts.pt));
  });
});
