import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { placeholders, syncFields, validateValues } from "@/app/components/template-fields";
import { excelSerialToIso, normalizeHeader, parseCsv, parseXlsx, toCsv } from "@/app/sheet";

describe("planilhas do envio em massa", () => {
  it("lê CSV do Excel brasileiro (ponto e vírgula, BOM, aspas e quebra de linha)", () => {
    const sheet = parseCsv(
      '\uFEFFnome;email;obs\r\n"Silva; Ana";ana@x.com;"linha 1\nlinha 2"\r\n;;\r\n',
    );
    expect(sheet.headers).toEqual(["nome", "email", "obs"]);
    expect(sheet.rows).toEqual([["Silva; Ana", "ana@x.com", "linha 1\nlinha 2"]]);
  });

  it("lê CSV com vírgula e aspas escapadas", () => {
    const sheet = parseCsv('a,b\n"x ""y""",2\n');
    expect(sheet.rows).toEqual([['x "y"', "2"]]);
  });

  it("lê XLSX (primeira aba, textos compartilhados, colunas vazias e data serial)", async () => {
    const bytes = Buffer.from(readFileSync("src/test/fixtures-sheet.b64", "utf8"), "base64");
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const sheet = await parseXlsx(buffer);
    expect(sheet.headers).toEqual(["Nome", "E-mail", "#3", "Data início"]);
    expect(sheet.rows[0]).toEqual(["Ana Souza", "ana@exemplo.com", "", "46300"]);
    expect(excelSerialToIso("46300")).toBe("2026-10-05");
  });

  it("lê XLSX com prefixo de namespace (<x:row>), texto inline e aba fora de ordem nos vínculos", async () => {
    const bytes = Buffer.from(readFileSync("src/test/fixtures-sheet-ns.b64", "utf8"), "base64");
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const sheet = await parseXlsx(buffer);
    expect(sheet.headers).toEqual(["nome", "email", "pagina"]);
    expect(sheet.rows).toEqual([["Ana Souza", "ana@exemplo.com", "1"]]);
  });

  it("normaliza cabeçalhos para o mapeamento automático", () => {
    expect(normalizeHeader("E-mail")).toBe("email");
    expect(normalizeHeader("Data Início")).toBe("datainicio");
  });

  it("gera CSV com escape de separador", () => {
    expect(toCsv(["a"], [["x;y"]])).toBe('\uFEFFa\r\n"x;y"');
  });
});

describe("campos de modelo", () => {
  it("detecta {{campos}} e cria configuração padrão pelo nome", () => {
    const body = "Eu, {{nome}}, CPF {{ cpf }}, em {{data_inicio}}. {{nome}}";
    expect(placeholders(body)).toEqual(["nome", "cpf", "data_inicio"]);
    const fields = syncFields(body, []);
    expect(fields.map((f) => f.type)).toEqual(["text", "cpf", "date"]);
  });

  it("valida obrigatórios e formatos como o backend", () => {
    const fields = syncFields("{{nome}} {{cpf}} {{email}}", []);
    expect(validateValues(fields, { nome: "Ana", cpf: "12345678900", email: "x" })).toEqual([
      "cpf",
      "email",
    ]);
    expect(validateValues(fields, { nome: "Ana", cpf: "81976153069", email: "a@b.co" })).toEqual(
      [],
    );
  });
});

describe("celular no formato do motor", () => {
  it("aceita o número como a pessoa digita", async () => {
    const { normalizePhone } = await import("@/app/validation");
    expect(normalizePhone("61991670611")).toBe("+55 61 99167-0611");
    expect(normalizePhone("061991670611")).toBe("+55 61 99167-0611");
    expect(normalizePhone("(61) 99167-0611")).toBe("+55 61 99167-0611");
    expect(normalizePhone("+55 61 99167-0611")).toBe("+55 61 99167-0611");
    expect(normalizePhone("5561991670611")).toBe("+55 61 99167-0611");
    expect(normalizePhone("6133334444")).toBe("+55 61 3333-4444");
    expect(normalizePhone("+1 415 555 0100")).toBe("+14155550100");
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("e-mails que não recebem mensagens", () => {
  it("reconhece domínios reservados para exemplos e testes", async () => {
    const { reservedEmailDomain } = await import("@/app/validation");
    for (const e of ["ana@example.com", "a@mail.example.org", "b@homologacao.test", "c@x.invalid"])
      expect(reservedEmailDomain(e)).toBe(true);
    for (const e of ["ana@gmail.com", "rh@empresa.com.br", "x@examples.com", "y@test.com"])
      expect(reservedEmailDomain(e)).toBe(false);
  });
});

describe("máscaras de celular e CEP", () => {
  it("formata celular brasileiro enquanto digita e mantém estrangeiro", async () => {
    const { formatPhone, formatCep } = await import("@/app/validation");
    expect(formatPhone("61991670611")).toBe("(61) 99167-0611");
    expect(formatPhone("6133334444")).toBe("(61) 3333-4444");
    expect(formatPhone("619")).toBe("(61) 9");
    expect(formatPhone("+1 415 555 0100")).toBe("+1 415 555 0100");
    expect(formatCep("70040010")).toBe("70040-010");
    expect(formatCep("7004")).toBe("7004");
  });
});
