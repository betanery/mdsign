import { describe, expect, it } from "vitest";

import {
  analyze,
  buildDocs,
  cpfsInText,
  isPending,
  isReady,
  parseRanges,
  splitDocAt,
  type Person,
} from "@/app/split";

const people: Person[] = [
  {
    key: "1",
    name: "Mariana Alves Costa",
    email: "mariana@exemplo.com",
    cpf: "52998224725",
    phone: "",
    matricula: "1001",
    custom: "",
  },
  {
    key: "2",
    name: "João Souza",
    email: "joao@exemplo.com",
    cpf: "11144477735",
    phone: "",
    matricula: "1002",
    custom: "",
  },
  {
    key: "3",
    name: "Ana Lima",
    email: "ana@exemplo.com",
    cpf: "",
    phone: "",
    matricula: "1003",
    custom: "",
  },
  {
    key: "4",
    name: "Pedro Rocha",
    email: "pedro@exemplo.com",
    cpf: "",
    phone: "",
    matricula: "",
    custom: "",
  },
];

const pages = [
  "CONTRACHEQUE Mariana Alves Costa CPF 529.982.247-25 Matrícula 1001",
  "continuação — totais do mês",
  "CONTRACHEQUE João Souza CPF 11144477735",
  "CONTRACHEQUE Ana Lima Matrícula 1003",
  "CONTRACHEQUE Pedro Rocha (sem identificador)",
  "CONTRACHEQUE Fulano Desconhecido CPF 000.000.000-00",
];

describe("separação de PDF", () => {
  it("encontra só CPFs válidos", () => {
    expect(cpfsInText("CPF 529.982.247-25 e 111.111.111-11 e 12345678900")).toEqual([
      "52998224725",
    ]);
  });

  it("intervalos manuais com validação de sobreposição", () => {
    expect(parseRanges("1-2, 3, 4-6", 6)).toEqual([
      [1, 2],
      [3, 3],
      [4, 6],
    ]);
    expect(parseRanges("1-3, 3-4", 6)).toBeNull();
    expect(parseRanges("1-9", 6)).toBeNull();
  });

  it("uma página por pessoa e N páginas por pessoa", () => {
    expect(buildDocs(pages, { mode: "page" }, { matricula: true }, people)!.length).toBe(6);
    expect(
      buildDocs(pages, { mode: "fixed", size: 2 }, { matricula: true }, people)!.map((d) => [
        d.from,
        d.to,
      ]),
    ).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it("pelo conteúdo: página com nome de outra pessoa começa outro documento", () => {
    const docs = buildDocs(pages, { mode: "content" }, { matricula: true }, people)!;
    expect(docs.map((d) => [d.from, d.to])).toEqual([
      [1, 2],
      [3, 3],
      [4, 4],
      [5, 6],
    ]);
    const ana = docs.find((d) => d.from === 4)!;
    expect([ana.to, ana.confidence, ana.personKey]).toEqual([4, "green", "3"]);
    // Pedro: só nome (amarelo); a página 6 (sem identificação) não é anexada sem confirmação.
    expect(docs.find((d) => d.from === 5)!.confidence).toBe("yellow");
  });

  it("páginas sem identificação nunca deixam o documento verde (exige confirmação)", () => {
    const docs = buildDocs(pages, { mode: "content" }, { matricula: true }, people)!;
    const mariana = docs.find((d) => d.from === 1)!;
    expect([mariana.to, mariana.confidence, mariana.reason, mariana.personKey]).toEqual([
      2,
      "yellow",
      "unlinked_pages",
      "1",
    ]);
    // Com o nome repetido na continuação, fica verde.
    const withName = [...pages];
    withName[1] = "continuação — Mariana Alves Costa — totais";
    const again = buildDocs(withName, { mode: "content" }, { matricula: true }, people)!;
    expect(again.find((d) => d.from === 1)!.confidence).toBe("green");
  });

  it("CPF novo depois de um documento sem identificador abre outro documento", () => {
    const list = [
      "CONTRACHEQUE Pedro Rocha",
      "CONTRACHEQUE Fulano CPF 390.533.447-05",
      "CONTRACHEQUE Pedro Rocha (pág. 2) e-mail pedro@exemplo.com",
    ];
    const docs = buildDocs(list, { mode: "content" }, { matricula: true }, people)!;
    expect(docs.map((d) => [d.from, d.to])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    // Mesmo dono: nome e depois o e-mail da mesma pessoa continuam juntos.
    const same = buildDocs(
      ["CONTRACHEQUE Pedro Rocha", "Pedro Rocha e-mail pedro@exemplo.com"],
      { mode: "content" },
      { matricula: true },
      people,
    )!;
    expect(same.map((d) => [d.from, d.to])).toEqual([[1, 2]]);
  });

  it("separar um documento na conferência reidentifica as duas partes", () => {
    const a = analyze(pages, { matricula: true }, people);
    const docs = buildDocs(pages, { mode: "content" }, { matricula: true }, people)!;
    const pedro = docs.find((d) => d.from === 5)!;
    const after = splitDocAt(docs, pedro.index, 6, pages, a);
    expect(after.map((d) => [d.from, d.to])).toEqual([
      [1, 2],
      [3, 3],
      [4, 4],
      [5, 5],
      [6, 6],
    ]);
    expect(after.find((d) => d.from === 6)!.confidence).toBe("red");
  });

  it("classifica verde / amarelo / vermelho com prioridade CPF > matrícula > e-mail", () => {
    const docs = buildDocs(pages, { mode: "page" }, { matricula: true }, people)!;
    expect([docs[0]!.confidence, docs[0]!.method, docs[0]!.personKey]).toEqual([
      "green",
      "cpf",
      "1",
    ]);
    expect([docs[2]!.confidence, docs[2]!.method, docs[2]!.personKey]).toEqual([
      "green",
      "cpf",
      "2",
    ]);
    expect([docs[3]!.confidence, docs[3]!.method, docs[3]!.personKey]).toEqual([
      "green",
      "matricula",
      "3",
    ]);
    // Só o nome: nunca verde.
    expect([docs[4]!.confidence, docs[4]!.reason, docs[4]!.personKey]).toEqual([
      "yellow",
      "name_only",
      "4",
    ]);
    // Nada reconhecido.
    expect(docs[1]!.confidence).toBe("red");
    expect(docs[5]!.confidence).toBe("red");
  });

  it("identificadores de pessoas diferentes no mesmo documento = conflito (amarelo)", () => {
    const docs = buildDocs(
      ["CPF 529.982.247-25 Matrícula 1002"],
      { mode: "page" },
      { matricula: true },
      people,
    )!;
    expect([docs[0]!.confidence, docs[0]!.reason]).toEqual(["yellow", "conflict"]);
  });

  it("amarelo só fica pronto depois de confirmado; excluído não conta", () => {
    const [doc] = buildDocs([pages[4]!], { mode: "page" }, { matricula: true }, people)!;
    expect(isReady(doc!)).toBe(false);
    expect(isPending(doc!)).toBe(true);
    expect(isReady({ ...doc!, confirmed: true })).toBe(true);
    expect(isPending({ ...doc!, excluded: true })).toBe(false);
  });

  it("identificador configurado (rótulo + valor)", () => {
    const withCustom = people.map((p) => (p.key === "4" ? { ...p, custom: "rx-77" } : p));
    const docs = buildDocs(
      ["Registro: RX-77 Pedro Rocha"],
      { mode: "page" },
      { matricula: false, customLabel: "Registro" },
      withCustom,
    )!;
    expect([docs[0]!.confidence, docs[0]!.method, docs[0]!.personKey]).toEqual([
      "green",
      "custom",
      "4",
    ]);
  });
});
