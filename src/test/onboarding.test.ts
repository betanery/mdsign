import { describe, expect, it } from "vitest";

import { bubblePosition } from "@/app/components/guided-tour";
import { appMessages } from "@/app/i18n";
import { GUIDE_STEPS, type GuideProgress, visibleSteps } from "@/app/onboarding";

const progress = (over: Partial<GuideProgress> = {}): GuideProgress => ({
  track: "full",
  dismissed: false,
  completed: false,
  team: true,
  steps: Object.fromEntries(
    [...GUIDE_STEPS.map((s) => s.id), "has_pending"].map((k) => [k, false]),
  ) as GuideProgress["steps"],
  ...over,
});
const all = () => true;

describe("onboarding: passos por trilha, permissão e plano", () => {
  it("dono vê o essencial, ganhe tempo e equipe", () => {
    const ids = visibleSteps(progress(), all).map((s) => s.id);
    expect(ids).toEqual([
      "profile",
      "self_sign",
      "send",
      "track_status",
      "remind",
      "contacts",
      "template",
      "form",
      "invite",
      "group",
    ]);
  });
  it("plano de 1 usuário esconde os passos de equipe", () => {
    const ids = visibleSteps(progress({ team: false }), all).map((s) => s.id);
    expect(ids).not.toContain("invite");
    expect(ids).not.toContain("group");
  });
  it("visualizador convidado recebe só o roteiro curto do papel", () => {
    const can = (p: string) => p === "documents.view";
    const ids = visibleSteps(progress({ track: "invited" }), can).map((s) => s.id);
    expect(ids).toEqual(["profile", "track_status", "download"]);
  });
  it("'assinar o que espera por você' só aparece com pendência", () => {
    const p = progress({ track: "invited" });
    expect(visibleSteps(p, all).map((s) => s.id)).not.toContain("sign_pending");
    p.steps.has_pending = true;
    expect(visibleSteps(p, all).map((s) => s.id)).toContain("sign_pending");
  });
});

describe("onboarding: textos e tours completos nos 3 idiomas", () => {
  it("cada passo tem título, texto e um texto por parada do tour", () => {
    for (const t of Object.values(appMessages)) {
      for (const s of GUIDE_STEPS) {
        expect(t.guide.steps[s.id]?.title, s.id).toBeTruthy();
        expect(t.guide.tours[s.id]?.length, s.id).toBe(s.tour.length);
      }
    }
  });
});

describe("tour: posição do balão", () => {
  it("abaixo do alvo quando cabe, acima quando não, sempre dentro da tela", () => {
    expect(
      bubblePosition({ top: 100, left: 50, width: 200, height: 40 }, 1280, 800)?.top,
    ).toBeGreaterThan(140);
    expect(
      bubblePosition({ top: 700, left: 50, width: 200, height: 40 }, 1280, 800)!.top,
    ).toBeLessThan(700);
    expect(
      bubblePosition({ top: 100, left: 1200, width: 60, height: 40 }, 1280, 800)!.left,
    ).toBeLessThanOrEqual(1280 - 340 - 12);
    expect(bubblePosition({ top: 100, left: 50, width: 200, height: 40 }, 375, 800)).toBeNull();
  });
});
