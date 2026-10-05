/**
 * pdf-lib no navegador para separar um PDF em documentos individuais (envio em massa).
 * Carregado do cdnjs com verificação de integridade (SRI), uma única vez.
 */

const SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
const INTEGRITY = "sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI";

type PdfLibDoc = {
  getPageCount: () => number;
  copyPages: (src: PdfLibDoc, indexes: number[]) => Promise<unknown[]>;
  addPage: (page: unknown) => void;
  save: () => Promise<Uint8Array>;
};
type PdfLib = {
  PDFDocument: {
    load: (bytes: Uint8Array, o?: Record<string, unknown>) => Promise<PdfLibDoc>;
    create: () => Promise<PdfLibDoc>;
  };
};

declare global {
  interface Window {
    PDFLib?: PdfLib;
  }
}

let loading: Promise<PdfLib> | null = null;

export function loadPdfLib(): Promise<PdfLib> {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  loading ??= new Promise<PdfLib>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SRC;
    script.integrity = INTEGRITY;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = () =>
      window.PDFLib ? resolve(window.PDFLib) : reject(new Error("pdflib_missing"));
    script.onerror = () => {
      loading = null;
      reject(new Error("pdflib_load_failed"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export type PdfSplitter = {
  pages: number;
  part: (from: number, to: number) => Promise<Uint8Array>;
};

/** Abre o PDF uma vez e gera cada parte [from, to] (1 = primeira página) sob demanda. */
export async function openSplitter(bytes: Uint8Array): Promise<PdfSplitter> {
  const { PDFDocument } = await loadPdfLib();
  const src = await PDFDocument.load(bytes, { updateMetadata: false });
  return {
    pages: src.getPageCount(),
    async part(from, to) {
      const out = await PDFDocument.create();
      const pages = await out.copyPages(
        src,
        Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i),
      );
      pages.forEach((p) => out.addPage(p));
      return out.save();
    },
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
