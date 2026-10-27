import { describe, expect, it } from "vitest";

import { oneSignature } from "@/app/components/template-fields";
import { addAttachments, MAX_ATTACHMENT_BYTES } from "@/app/components/attachments-picker";
import {
  flowStages,
  newParticipant,
  participantsFromDocument,
  withApprover,
  type ParticipantDraft,
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

describe("aprovador no fluxo", () => {
  const person = (name: string, role: ParticipantDraft["role"] = "signer") => ({
    ...newParticipant(role),
    name,
  });

  it("novo aprovador entra antes de quem assina, depois dos aprovadores já incluídos", () => {
    const list = withApprover([person("Jurídico", "approver"), person("Ana"), person("Bruno")]);
    expect(list.map((p) => p.role)).toEqual(["approver", "approver", "signer", "signer"]);
    expect(withApprover([]).map((p) => p.role)).toEqual(["approver"]);
  });

  it("em ordem, cada pessoa é uma etapa; sem ordem, aprovação antes e assinaturas juntas", () => {
    const list = [person("Jurídico", "approver"), person("Ana"), person("Bruno")];
    const inOrder = flowStages(list, true);
    expect(inOrder.map((s) => s.people.map((p) => `${p.role}:${p.name}`))).toEqual([
      ["approver:Jurídico"],
      ["signer:Ana"],
      ["signer:Bruno"],
    ]);
    // Sem ordem: aprovação antes, depois todos que assinam juntos.
    expect(flowStages(list, false).map((s) => s.people.map((p) => p.name))).toEqual([
      ["Jurídico"],
      ["Ana", "Bruno"],
    ]);
    expect(flowStages([person("Ana"), person("Bruno")], false)).toHaveLength(1);
  });
});

describe("fluxo salvo e cópia do documento", () => {
  it("salva só quem tem nome ou e-mail, sem a chave da tela, e reaplica com chaves novas", async () => {
    const { flowToSave, flowFromSaved } = await import("@/app/components/saved-flows");
    const list = [
      { ...newParticipant("approver"), name: "Jurídico", email: "j@ex.com" },
      newParticipant(),
    ];
    const saved = flowToSave(list);
    expect(saved).toHaveLength(1);
    expect(saved[0]).not.toHaveProperty("key");
    const back = flowFromSaved(saved);
    expect(back[0]!.role).toBe("approver");
    expect(back[0]!.key).not.toBe(list[0]!.key);
  });

  it("aceita e-mails separados por vírgula, ponto e vírgula ou linha, sem repetir", async () => {
    const { parseEmails } = await import("@/app/components/share-dialog");
    expect(parseEmails("A@x.com, b@y.com;\nb@y.com  c@z.com")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
  });
});

describe("oneSignature", () => {
  const box = { page: 1, x: 0, y: 0, w: 0.1, h: 0.1 };
  it("a nova assinatura substitui a anterior da mesma pessoa; rubrica repete", () => {
    const old = { ...box, slot: 1, type: "signature" as const };
    const other = { ...box, slot: 2, type: "signature" as const };
    const ini = { ...box, slot: 1, type: "initials" as const };
    const added = { ...box, page: 2, slot: 1, type: "signature" as const };
    const same = (a: { slot: number }, b: { slot: number }) => a.slot === b.slot;
    expect(oneSignature([old, other, ini, added], added, same)).toEqual([other, ini, added]);
    const ini2 = { ...ini, page: 2 };
    expect(oneSignature([ini, ini2], ini2, same)).toEqual([ini, ini2]);
  });
});
