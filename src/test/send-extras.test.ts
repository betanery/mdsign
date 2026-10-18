import { describe, expect, it } from "vitest";

import { addAttachments, MAX_ATTACHMENT_BYTES } from "@/app/components/attachments-picker";
import {
  participantsFromDocument,
  type PastParticipant,
} from "@/app/components/participants-editor";

const row = (p: Partial<PastParticipant>): PastParticipant => ({
  name: "Pessoa",
  email: "p@ex.com",
  cpf: null,
  no_cpf: false,
  phone: null,
  role: "signer",
  auth_level: "basic",
  step: 1,
  rule_name: null,
  rule_required: null,
  ...p,
});

describe("Repetir participantes de um documento", () => {
  it("mantém ordem, papel, autenticação e quórum (mesmo grupo junto)", () => {
    const list = participantsFromDocument(
      [
        row({ name: "C", step: 3, role: "approver" }),
        row({
          name: "A",
          step: 1,
          cpf: "12345678909",
          auth_level: "reinforced",
          phone: "61999990000",
        }),
        row({ name: "B1", step: 2, rule_name: "Diretoria", rule_required: 1 }),
        row({ name: "B2", step: 2, rule_name: "Diretoria", rule_required: 1 }),
      ],
      (v) => `fmt:${v}`,
    );
    expect(list.map((p) => p.name)).toEqual(["A", "B1", "B2", "C"]);
    expect(list[0]).toMatchObject({
      cpf: "fmt:12345678909",
      authLevel: "reinforced",
      phone: "61999990000",
    });
    expect(list[3]!.role).toBe("approver");
    expect(list[1]!.rule?.key).toBe(list[2]!.rule?.key);
    expect(list[1]!.rule).toMatchObject({ name: "Diretoria", required: 1 });
    expect(new Set(list.map((p) => p.key)).size).toBe(4);
  });
});

describe("Anexos no envio", () => {
  const f = (name: string, size = 10) => new File([new Uint8Array(size)], name);
  it("aceita PDF, JPG e PNG até 5, sem repetir", () => {
    const r = addAttachments([], [f("a.pdf"), f("b.JPG"), f("c.png"), f("a.pdf")]);
    expect(r.files.map((x) => x.name)).toEqual(["a.pdf", "b.JPG", "c.png"]);
    expect(r.problem).toBeNull();
  });
  it("avisa o motivo quando algum fica de fora", () => {
    expect(addAttachments([], [f("x.exe")]).problem).toBe("attachment_type");
    expect(addAttachments([], [f("g.pdf", MAX_ATTACHMENT_BYTES + 1)]).problem).toBe(
      "attachment_too_large",
    );
    const five = ["1", "2", "3", "4", "5"].map((n) => f(`${n}.pdf`));
    const r = addAttachments(five, [f("6.pdf")]);
    expect(r.files).toHaveLength(5);
    expect(r.problem).toBe("too_many_attachments");
  });
});

describe("Pastas", () => {
  it("conta documentos por pasta, com os sem pasta em 'none'", async () => {
    const { folderCounts } = await import("@/app/folders");
    expect(folderCounts([{ folder_id: "a" }, { folder_id: "a" }, { folder_id: null }, {}])).toEqual(
      { a: 2, none: 2 },
    );
  });
});
