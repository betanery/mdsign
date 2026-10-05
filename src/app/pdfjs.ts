/**
 * pdf.js (Mozilla) para desenhar páginas e extrair texto no navegador.
 * Carregado do cdnjs com verificação de integridade (SRI), uma única vez, como o widget de
 * assinatura. O worker também é conferido (fetch com integrity) e usado via blob URL.
 */

const BASE = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";
const LIB = {
  src: `${BASE}/pdf.min.js`,
  integrity: "sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e",
};
const WORKER = {
  src: `${BASE}/pdf.worker.min.js`,
  integrity: "sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2",
};

export type PdfViewport = { width: number; height: number };
export type PdfPage = {
  getViewport: (o: { scale: number }) => PdfViewport;
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => {
    promise: Promise<void>;
    cancel: () => void;
  };
  getTextContent: () => Promise<{ items: { str?: string; hasEOL?: boolean }[] }>;
};
export type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: Uint8Array } | { url: string }) => { promise: Promise<PdfDocument> };
};

declare global {
  interface Window {
    pdfjsLib?: PdfJs;
  }
}

let loading: Promise<PdfJs> | null = null;

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = LIB.src;
    script.integrity = LIB.integrity;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("pdfjs_load_failed"));
    document.head.appendChild(script);
  });
}

export function loadPdfJs(): Promise<PdfJs> {
  if (window.pdfjsLib?.GlobalWorkerOptions.workerSrc) return Promise.resolve(window.pdfjsLib);
  loading ??= (async () => {
    const [, worker] = await Promise.all([
      window.pdfjsLib ? Promise.resolve() : loadScript(),
      fetch(WORKER.src, { integrity: WORKER.integrity, mode: "cors" }).then((r) => {
        if (!r.ok) throw new Error("pdfjs_worker_failed");
        return r.blob();
      }),
    ]);
    const lib = window.pdfjsLib;
    if (!lib) throw new Error("pdfjs_missing");
    lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(worker);
    return lib;
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

export async function openPdf(source: ArrayBuffer | Uint8Array | string): Promise<PdfDocument> {
  const lib = await loadPdfJs();
  // O pdf.js transfere o buffer para o worker: sempre uma cópia, para poder abrir de novo.
  const src =
    typeof source === "string"
      ? { url: source }
      : { data: (source instanceof Uint8Array ? source : new Uint8Array(source)).slice() };
  return lib.getDocument(src).promise;
}

/** Texto de cada página (para localizar CPF, matrícula, e-mail). Índice 0 = página 1. */
export async function pageTexts(doc: PdfDocument): Promise<string[]> {
  const out: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { items } = await page.getTextContent();
    out.push(items.map((i) => (i.str ?? "") + (i.hasEOL ? "\n" : " ")).join(""));
  }
  return out;
}
