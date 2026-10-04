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
