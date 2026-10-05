// Gera o PDF de um modelo (PRD §13): marcação simples (# título, ## subtítulo, - lista,
// **negrito**) com campos {{chave}} preenchidos. Fonte Helvetica (cobre acentos do PT/ES).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";
import { AppError } from "./http.ts";
import { boxToPdfRect, fillFormField, loadPdf, type RelBox, type RelMark } from "./pdf.ts";

export type TemplateField = {
  key: string;
  label: string;
  type:
    | "text"
    | "cpf"
    | "cnpj"
    | "email"
    | "phone"
    | "date"
    | "currency"
    | "number"
    | "select"
    | "checkbox";
  required?: boolean;
  /** Origem do valor (PRD): manual/remetente, signatário, contato, planilha, API, HCM. */
  source?: "manual" | "sender" | "signer" | "contact" | "excel" | "hcm" | "api" | "fixed";
  options?: string[];
  value?: string;
  /** Modelo PDF: onde o valor é escrito (frações da página) e/ou campo de formulário do PDF. */
  boxes?: RelBox[];
  pdfField?: string;
  /** Variável de um participante do fluxo (ex.: nome do papel 2), preenchida no envio. */
  slot?: number;
  slotAttr?: "name" | "email" | "cpf" | "phone";
};

const digits = (v: string) => v.replace(/\D/g, "");

/** Formata o valor conforme o tipo do campo e o idioma. */
export function formatValue(field: TemplateField, raw: string, locale: string): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  switch (field.type) {
    case "cpf": {
      const d = digits(v);
      return d.length === 11
        ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
        : v;
    }
    case "cnpj": {
      const d = digits(v);
      return d.length === 14
        ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
        : v;
    }
    case "date": {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return v;
      return locale === "en" ? `${m[2]}/${m[3]}/${m[1]}` : `${m[3]}/${m[2]}/${m[1]}`;
    }
    case "currency": {
      const n = Number(
        v
          .replace(/[^\d,.-]/g, "")
          .replace(/\.(?=\d{3}(\D|$))/g, "")
          .replace(",", "."),
      );
      return Number.isFinite(n)
        ? new Intl.NumberFormat(locale === "pt" ? "pt-BR" : locale, {
            style: "currency",
            currency: "BRL",
          }).format(n)
        : v;
    }
    case "checkbox":
      return ["true", "1", "sim", "yes", "sí", "x"].includes(v.toLowerCase())
        ? locale === "en"
          ? "Yes"
          : "Sim"
        : locale === "en"
          ? "No"
          : "Não";
    default:
      return v;
  }
}

/** Confere obrigatórios e formatos. Devolve as chaves com problema. */
export function validateValues(fields: TemplateField[], values: Record<string, string>): string[] {
  const bad: string[] = [];
  for (const f of fields) {
    const v = String(values[f.key] ?? "").trim();
    if (!v) {
      if (f.required) bad.push(f.key);
      continue;
    }
    if (f.type === "cpf" && digits(v).length !== 11) bad.push(f.key);
    if (f.type === "cnpj" && digits(v).length !== 14) bad.push(f.key);
    if (f.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) bad.push(f.key);
    if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) bad.push(f.key);
    if (f.type === "select" && f.options?.length && !f.options.includes(v)) bad.push(f.key);
  }
  return bad;
}

/** Campos {{chave}} usados no texto. */
export function placeholders(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]!))];
}

// Helvetica (WinAnsi) não tem todos os caracteres Unicode: troca os que faltam.
export function sanitize(text: string, font: PDFFont): string {
  return [...text.normalize("NFC")]
    .map((ch) => {
      try {
        font.encodeText(ch);
        return ch;
      } catch {
        return ch === "\t" ? " " : "?";
      }
    })
    .join("");
}

type Run = { text: string; bold: boolean };

function parseInline(text: string): Run[] {
  const runs: Run[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**"))
      runs.push({ text: part.slice(2, -2), bold: true });
    else runs.push({ text: part, bold: false });
  }
  return runs;
}

export async function renderTemplatePdf(opts: {
  title: string;
  body: string;
  fields: TemplateField[];
  values: Record<string, string>;
  locale: string;
  footer: string;
}): Promise<Uint8Array> {
  const missing = validateValues(opts.fields, opts.values);
  if (missing.length) throw new AppError("invalid_fields", 422, missing);

  const byKey = new Map(opts.fields.map((f) => [f.key, f]));
  const filled = opts.body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const field = byKey.get(key) ?? ({ key, label: key, type: "text" } as TemplateField);
    return formatValue(field, opts.values[key] ?? field.value ?? "", opts.locale) || "________";
  });

  const pdf = await PDFDocument.create();
  pdf.setTitle(opts.title);
  pdf.setProducer("MDSign — Mundo Digital Tech");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const A4 = { w: 595.28, h: 841.89 };
  const margin = 64;
  const width = A4.w - margin * 2;
  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - margin;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < margin + 24) {
      page = pdf.addPage([A4.w, A4.h]);
      y = A4.h - margin;
    }
  };

  // Escreve parágrafos com quebra de linha por largura, mantendo negrito por trecho.
  const writeRuns = (runs: Run[], size: number, indent = 0, bullet = false) => {
    const lineHeight = size * 1.45;
    const words: { text: string; bold: boolean }[] = [];
    for (const r of runs)
      for (const w of r.text.split(/(\s+)/))
        if (w) words.push({ text: sanitize(w, r.bold ? bold : regular), bold: r.bold });
    let line: typeof words = [];
    let lineWidth = 0;
    let first = true;
    const flush = () => {
      newPageIfNeeded(lineHeight);
      let x = margin + indent;
      if (bullet && first)
        page.drawText("•", {
          x: margin + indent - 12,
          y,
          size,
          font: regular,
          color: rgb(0.2, 0.2, 0.25),
        });
      for (const w of line) {
        const font = w.bold ? bold : regular;
        page.drawText(w.text, { x, y, size, font, color: rgb(0.12, 0.12, 0.16) });
        x += font.widthOfTextAtSize(w.text, size);
      }
      y -= lineHeight;
      line = [];
      lineWidth = 0;
      first = false;
    };
    for (const w of words) {
      const font = w.bold ? bold : regular;
      const ww = font.widthOfTextAtSize(w.text, size);
      if (lineWidth + ww > width - indent && line.length) {
        flush();
        if (/^\s+$/.test(w.text)) continue;
      }
      line.push(w);
      lineWidth += ww;
    }
    if (line.length) flush();
  };

  for (const raw of filled.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      y -= 8;
      continue;
    }
    if (line.startsWith("# ")) {
      y -= 4;
      writeRuns([{ text: line.slice(2), bold: true }], 17);
      y -= 6;
    } else if (line.startsWith("## ")) {
      y -= 6;
      writeRuns([{ text: line.slice(3), bold: true }], 12.5);
      y -= 2;
    } else if (/^[-*]\s+/.test(line)) {
      writeRuns(parseInline(line.replace(/^[-*]\s+/, "")), 10.5, 16, true);
    } else {
      writeRuns(parseInline(line), 10.5);
    }
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const text = sanitize(`${opts.footer} · ${i + 1}/${pages.length}`, regular);
    p.drawText(text, { x: margin, y: 32, size: 8, font: regular, color: rgb(0.45, 0.45, 0.5) });
  });
  return await pdf.save();
}

const isChecked = (v: string) => ["true", "1", "sim", "yes", "sí", "x"].includes(v.toLowerCase());

/** Quebra o texto em linhas que caibam na largura, no tamanho dado. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Escreve o texto dentro da caixa: fonte ajustada à altura, quebra se couber mais linhas. */
function drawInBox(page: PDFPage, box: RelBox, text: string, font: PDFFont) {
  const r = boxToPdfRect(page, box);
  const pad = Math.min(2, r.width * 0.05);
  const width = r.width - pad * 2;
  let size = Math.min(Math.max(r.height * 0.7, 6), 12);
  let lines = wrap(text, font, size, width);
  while (
    size > 6 &&
    (lines.length * size * 1.2 > r.height ||
      lines.some((l) => font.widthOfTextAtSize(l, size) > width))
  ) {
    size -= 0.5;
    lines = wrap(text, font, size, width);
  }
  const maxLines = Math.max(1, Math.floor(r.height / (size * 1.2)));
  lines = lines.slice(0, maxLines);
  const total = lines.length * size * 1.2;
  let y = r.y + (r.height + total) / 2 - size;
  for (const line of lines) {
    let out = line;
    while (out && font.widthOfTextAtSize(out, size) > width) out = out.slice(0, -1);
    page.drawText(out, { x: r.x + pad, y, size, font, color: rgb(0.08, 0.08, 0.12) });
    y -= size * 1.2;
  }
}

/**
 * Preenche um modelo PDF: campos de formulário do próprio PDF e caixas posicionadas.
 * Ao final "congela" o formulário para os valores não serem alterados depois.
 * `previewMarks` desenha onde ficarão assinatura/rubrica (só na prévia; o SignDoc aplica as reais).
 */
export async function renderPdfTemplate(opts: {
  pdf: Uint8Array;
  fields: TemplateField[];
  values: Record<string, string>;
  locale: string;
  previewMarks?: (RelMark & { label: string })[];
}): Promise<Uint8Array> {
  const missing = validateValues(opts.fields, opts.values);
  if (missing.length) throw new AppError("invalid_fields", 422, missing);

  const doc = await loadPdf(opts.pdf);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  let hasForm = false;

  for (const field of opts.fields) {
    const raw = opts.values[field.key] ?? field.value ?? "";
    const text = sanitize(formatValue(field, raw, opts.locale), font);
    if (field.pdfField) {
      try {
        fillFormField(doc, field.pdfField, text, isChecked(String(raw)));
        hasForm = true;
      } catch {
        // campo do PDF com formato inesperado: segue com as caixas
      }
    }
    if (!text) continue;
    for (const box of field.boxes ?? []) {
      const page = pages[box.page - 1];
      if (page)
        drawInBox(
          page,
          box,
          field.type === "checkbox" && isChecked(String(raw)) ? "X" : text,
          font,
        );
    }
  }

  if (hasForm) {
    try {
      const form = doc.getForm();
      form.updateFieldAppearances(font);
      form.flatten();
    } catch {
      // formulários malformados: mantém o que foi preenchido
    }
  }

  for (const mark of opts.previewMarks ?? []) {
    const page = pages[mark.page - 1];
    if (!page) continue;
    const r = boxToPdfRect(page, mark);
    page.drawRectangle({
      ...r,
      borderColor: rgb(0.45, 0.2, 0.65),
      borderWidth: 1,
      borderDashArray: [4, 3],
      color: rgb(0.45, 0.2, 0.65),
      opacity: 0.06,
    });
    drawInBox(page, { ...mark, h: Math.min(mark.h, 0.025) }, sanitize(mark.label, font), font);
  }
  return await doc.save();
}
