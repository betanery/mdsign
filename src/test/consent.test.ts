import { beforeEach, describe, expect, it } from "vitest";

import { CONSENT_KEY, consentHeadScript, readConsent, saveConsent } from "@/lib/consent";

const gtmScripts = () =>
  [...document.querySelectorAll("script")].filter((s) => s.src.includes("googletagmanager"));

function runHead() {
  document.head.innerHTML = "<script></script>";
  delete (window as { __mdsignGtm?: number }).__mdsignGtm;
  window.dataLayer = [];
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(consentHeadScript("GTM-TESTE"))();
}

describe("consentimento de cookies", () => {
  beforeEach(() => localStorage.clear());

  it("sem escolha: Consent Mode negado e GTM não carrega", () => {
    runHead();
    expect(gtmScripts()).toHaveLength(0);
    const def = (window.dataLayer as unknown[][]).find(
      (a) => a[0] === "consent" && a[1] === "default",
    );
    expect((def?.[2] as Record<string, string>)["analytics_storage"]).toBe("denied");
  });

  it("recusar mantém o GTM desligado; aceitar análise carrega", () => {
    runHead();
    saveConsent({ analytics: false, marketing: false });
    expect(gtmScripts()).toHaveLength(0);
    saveConsent({ analytics: true, marketing: false });
    expect(gtmScripts()).toHaveLength(1);
    expect(readConsent()).toMatchObject({ analytics: true, marketing: false });
  });

  it("escolha salva vale na próxima visita", () => {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ v: 1, analytics: true, marketing: true, at: "x" }),
    );
    runHead();
    expect(gtmScripts()).toHaveLength(1);
  });
});
