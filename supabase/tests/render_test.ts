// Testes do preenchimento de modelos PDF (Deno). Rodam no CI; localmente, numa cópia da pasta supabase (ver server_test.ts).
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { renderPdfTemplate, type TemplateField } from "../functions/_shared/render.ts";

const blank = async () => {
  const doc = await PDFDocument.create();
  doc.addPage([595.28, 841.89]);
  return await doc.save();
};
const box = { page: 1, x: 0.1, y: 0.1, w: 0.4, h: 0.04 };
const fields: TemplateField[] = [
  { key: "cpf", label: "CPF", type: "cpf", required: true, boxes: [box] },
  { key: "numero", label: "Número", type: "number", required: true, boxes: [box] },
] as TemplateField[];
const optional = fields.map((f) => ({ ...f, required: false }));

async function problems(f: TemplateField[], values: Record<string, string>) {
  try {
    await renderPdfTemplate({ pdf: await blank(), fields: f, values, locale: "pt" });
    return [];
  } catch (e) {
    return (e as { details?: string[] }).details ?? ["?"];
  }
}

function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

Deno.test("envio: campos obrigatórios vazios são recusados", async () => {
  equal(await problems(fields, {}), ["cpf", "numero"]);
});

Deno.test("teste de rascunho: campos vazios saem em branco", async () => {
  equal(await problems(optional, {}), []);
});

Deno.test("teste de rascunho: formato errado continua recusado", async () => {
  equal(await problems(optional, { cpf: "123" }), ["cpf"]);
});
