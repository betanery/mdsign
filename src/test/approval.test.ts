import { describe, expect, it } from "vitest";

import { appMessages } from "@/app/i18n";
import { humanStatus, isReturned, type ParticipantRow } from "@/app/documents";
import { planComparison, plans } from "@/content/landing";

const t = appMessages.pt;
const f = (text: string, v: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");
const jur: ParticipantRow = {
  id: "1",
  user_id: null,
  name: "Jurídico",
  email: "j@ex.com",
  role: "approver",
  step: 1,
  status: "refused",
};

describe("devolução e rejeição", () => {
  it("recusa sem tipo (tela do motor) conta como devolução, que aceita nova versão", () => {
    expect(isReturned({ status: "refused", refusal_kind: null })).toBe(true);
    expect(isReturned({ status: "refused", refusal_kind: "return" })).toBe(true);
    expect(isReturned({ status: "refused", refusal_kind: "reject" })).toBe(false);
    expect(isReturned({ status: "pending", refusal_kind: null })).toBe(false);
  });

  it("situação mostra quem devolveu ou rejeitou", () => {
    const doc = { status: "refused" as const, document_participants: [jur] };
    expect(humanStatus({ ...doc, refusal_kind: "return" }, undefined, t, f)).toBe(
      "Devolvido para correção por Jurídico",
    );
    expect(humanStatus({ ...doc, refusal_kind: "reject" }, undefined, t, f)).toBe(
      "Rejeitado definitivamente por Jurídico",
    );
  });
});

describe("página de planos", () => {
  it("só os 4 planos do lançamento, com o Ipê em destaque", () => {
    expect(plans.map((p) => p.id)).toEqual(["cedro", "jacaranda", "ipe", "mogno"]);
    expect(plans.filter((p) => p.featured).map((p) => p.id)).toEqual(["ipe"]);
    expect(plans.find((p) => p.id === "ipe")?.price).toBe("R$ 99,97");
  });

  it("API, envio em massa e suporte contratual só no Mogno; certificado ainda não anunciado", () => {
    const row = (r: string) => planComparison.find((x) => x.row === r)!.cells;
    for (const r of ["api", "bulk"]) {
      expect(row(r)).toEqual({ cedro: "no", jacaranda: "no", ipe: "no", mogno: "yes" });
    }
    expect(Object.values(row("certificate"))).not.toContain("yes");
    expect(row("templates").cedro).toBe("no");
  });
});
