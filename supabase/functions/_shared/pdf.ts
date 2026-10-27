// Utilitários de PDF no servidor (pdf-lib): leitura segura, campos de formulário, conversão de
// posições relativas (0–1, origem no canto superior esquerdo) para pontos do PDF e separação.

import {
  PDFArray,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFDropdown,
  PDFRadioGroup,
  PDFTextField,
  type PDFPage,
} from "npm:pdf-lib@1.17.1";
import { AppError } from "./http.ts";

export const MAX_TEMPLATE_PAGES = 200;

export type PageSize = { width: number; height: number };
export type DetectedField = {
  name: string;
  type: "text" | "checkbox" | "select";
  options?: string[];
};
/** Caixa relativa à página (frações). `page` começa em 1. */
export type RelBox = { page: number; x: number; y: number; w: number; h: number };
export type MarkType = "signature" | "initials" | "stamp";
export type RelMark = RelBox & { type: MarkType };

const engineMarkType: Record<MarkType, string> = {
  signature: "SignatureVisualRepresentation",
  initials: "SignatureInitials",
  stamp: "AuthenticationStamp",
};

/** Abre o PDF; senha, corrupção ou páginas demais viram pdf_unreadable. */
export async function loadPdf(
  bytes: Uint8Array,
  maxPages = MAX_TEMPLATE_PAGES,
): Promise<PDFDocument> {
  let doc: PDFDocument;
  let pages = 0;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
    pages = doc.getPageCount();
    if (pages > 0) doc.getPage(0).getCropBox();
  } catch {
    throw new AppError("pdf_unreadable", 422);
  }
  if (pages < 1 || pages > maxPages)
    throw new AppError("pdf_unreadable", 422, { pages, max: maxPages });
  return doc;
}

// Conteúdo ativo que um PDF para assinatura não deve ter (auditoria 16/10/2026, Fase 5):
// scripts, ações que abrem programas ou endereços, arquivos anexados e formulários XFA.
const ACTIVE_ACTIONS = new Set(["JavaScript", "Launch", "ImportData", "Rendition", "GoToE"]);

/**
 * Procura conteúdo ativo em todos os objetos do PDF (inclusive dentro de fluxos de objetos).
 * Devolve os tipos encontrados; lista vazia = PDF limpo. A análise é local: o arquivo não sai
 * do servidor.
 */
export function findActiveContent(doc: PDFDocument): string[] {
  const found = new Set<string>();
  const name = (v: unknown) => (v instanceof PDFName ? v.decodeText() : null);
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    const s = name(obj.get(PDFName.of("S")));
    if (s && ACTIVE_ACTIONS.has(s)) found.add(s === "JavaScript" ? "javascript" : "action");
    if (obj.has(PDFName.of("JS"))) found.add("javascript");
    const type = name(obj.get(PDFName.of("Type")));
    const subtype = name(obj.get(PDFName.of("Subtype")));
    if (
      type === "EmbeddedFile" ||
      obj.has(PDFName.of("EF")) ||
      obj.has(PDFName.of("EmbeddedFiles"))
    )
      found.add("attachment");
    if (subtype === "FileAttachment") found.add("attachment");
    if (subtype === "RichMedia" || subtype === "Movie" || subtype === "Sound") found.add("media");
    if (obj.has(PDFName.of("XFA"))) found.add("xfa");
  }
  // Dicionários diretos no catálogo (sem objeto indireto próprio).
  const names = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  if (names?.has(PDFName.of("JavaScript"))) found.add("javascript");
  if (names?.has(PDFName.of("EmbeddedFiles"))) found.add("attachment");
  const open = doc.catalog.get(PDFName.of("OpenAction"));
  if (open instanceof PDFDict) {
    const s = name(open.get(PDFName.of("S")));
    if (s && ACTIVE_ACTIONS.has(s)) found.add(s === "JavaScript" ? "javascript" : "action");
  } else if (open instanceof PDFArray) {
    // Destino de abertura (página/zoom): permitido.
  }
  return [...found].sort();
}

/** Bloqueia PDF com conteúdo ativo, com orientação para salvar de novo. */
export async function assertSafePdf(bytes: Uint8Array) {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: false });
  } catch {
    throw new AppError("pdf_unreadable", 422);
  }
  const kinds = findActiveContent(doc);
  if (kinds.length) throw new AppError("pdf_active_content", 422, { kinds });
}

/** Área visível da página (CropBox), a mesma que o navegador desenha. */
export function pageBox(page: PDFPage) {
  const c = page.getCropBox();
  return { x: c.x, y: c.y, width: c.width, height: c.height };
}

export function pageSizes(doc: PDFDocument): PageSize[] {
  return doc.getPages().map((p) => {
    const b = pageBox(p);
    return { width: Math.round(b.width * 100) / 100, height: Math.round(b.height * 100) / 100 };
  });
}

/** Campos de formulário (AcroForm) que o PDF já traz. */
export function detectFields(doc: PDFDocument): DetectedField[] {
  try {
    return doc
      .getForm()
      .getFields()
      .map((f) => {
        const name = f.getName();
        if (f instanceof PDFCheckBox) return { name, type: "checkbox" as const };
        if (f instanceof PDFDropdown || f instanceof PDFRadioGroup)
          return { name, type: "select" as const, options: f.getOptions() };
        return { name, type: "text" as const };
      })
      .filter((f) => f.name)
      .slice(0, 200);
  } catch {
    return [];
  }
}

export function fillFormField(doc: PDFDocument, name: string, value: string, checked: boolean) {
  const form = doc.getForm();
  const field = form.getFieldMaybe(name);
  if (!field) return;
  if (field instanceof PDFTextField) field.setText(value);
  else if (field instanceof PDFCheckBox) checked ? field.check() : field.uncheck();
  else if (field instanceof PDFDropdown || field instanceof PDFRadioGroup) {
    if (field.getOptions().includes(value)) field.select(value);
  }
}

const clamp = (v: number) => Math.min(Math.max(Number(v) || 0, 0), 1);

/** `page` 0 = última página (documentos gerados, cujo número de páginas varia). */
export function cleanBox(b: Partial<RelBox>, pageCount: number): RelBox | null {
  const page = Math.trunc(Number(b.page));
  if (!(page === 0 || (page >= 1 && page <= pageCount))) return null;
  const x = clamp(b.x ?? 0);
  const y = clamp(b.y ?? 0);
  const w = Math.min(clamp(b.w ?? 0), 1 - x);
  const h = Math.min(clamp(b.h ?? 0), 1 - y);
  return w > 0.005 && h > 0.005 ? { page, x, y, w, h } : null;
}

/** Caixa relativa → retângulo em pontos com origem embaixo (para desenhar com pdf-lib). */
export function boxToPdfRect(page: PDFPage, b: RelBox) {
  const p = pageBox(page);
  return {
    x: p.x + b.x * p.width,
    y: p.y + p.height - (b.y + b.h) * p.height,
    width: b.w * p.width,
    height: b.h * p.height,
  };
}

/** Marcas no formato do SignDoc (topLeftX/Y em pontos, a partir do canto superior esquerdo). */
/** O motor recusa mais de uma posição de assinatura por pessoa (rubrica e carimbo podem repetir). */
export function assertOneSignature(marks: { type: MarkType }[]) {
  if (marks.filter((m) => m.type === "signature").length > 1)
    throw new AppError("signature_mark_repeated", 422);
}

export function toEngineMarks(marks: RelMark[], sizes: PageSize[]) {
  assertOneSignature(marks);
  return marks
    .map((m) => (m.page === 0 ? { ...m, page: sizes.length } : m))
    .filter((m) => sizes[m.page - 1])
    .map((m) => {
      const s = sizes[m.page - 1]!;
      return {
        type: engineMarkType[m.type],
        pageNumber: m.page,
        topLeftX: Math.round(m.x * s.width * 100) / 100,
        topLeftY: Math.round(m.y * s.height * 100) / 100,
        width: Math.round(m.w * s.width * 100) / 100,
        height: Math.round(m.h * s.height * 100) / 100,
      };
    });
}

/** Copia as páginas [from, to] (1 = primeira) para um PDF novo. */
export async function extractPages(
  source: PDFDocument,
  from: number,
  to: number,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const indexes = Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i);
  const pages = await out.copyPages(source, indexes);
  pages.forEach((p) => out.addPage(p));
  return await out.save();
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Marcas por participante vindas do navegador: [[{ type, page, x, y, w, h }], ...]. */
export function cleanParticipantMarks(raw: unknown, count: number): RelMark[][] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const types: MarkType[] = ["signature", "initials", "stamp"];
  return Array.from({ length: count }, (_, i) =>
    (Array.isArray(raw[i]) ? (raw[i] as Partial<RelMark>[]) : [])
      .slice(0, 200)
      .map((m) => {
        const box = cleanBox(m, MAX_TEMPLATE_PAGES);
        return box && types.includes(m.type as MarkType)
          ? { ...box, type: m.type as MarkType }
          : null;
      })
      .filter((m): m is RelMark => m !== null),
  );
}
