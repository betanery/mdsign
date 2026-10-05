import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppI18n } from "../i18n";
import { openPdf, type PdfDocument } from "../pdfjs";

/** Caixa sobre o PDF. Posição relativa à página (0–1, origem no canto superior esquerdo). */
export type PlacedBox = {
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** "field" = variável escrita no PDF; "mark" = assinatura/rubrica de um participante. */
  kind: "field" | "mark";
  label: string;
  tone?: number;
};

export type PlacerTool = { kind: PlacedBox["kind"]; label: string; tone?: number; key: string };

const MIN = 0.015;

/** Mantém o arrasto mesmo se o ponteiro sair da caixa (ignora navegadores sem suporte). */
function capture(e: ReactPointerEvent) {
  try {
    (e.target as Element).setPointerCapture(e.pointerId);
  } catch {
    // sem captura: o arrasto continua pelos eventos da área do PDF
  }
}
const clamp = (v: number, min = 0, max = 1) => Math.min(Math.max(v, min), max);
const tones = [
  "border-brand bg-brand/15 text-brand-strong",
  "border-sky-600 bg-sky-500/15 text-sky-800",
  "border-emerald-600 bg-emerald-500/15 text-emerald-800",
  "border-amber-600 bg-amber-500/20 text-amber-900",
  "border-rose-600 bg-rose-500/15 text-rose-800",
];

type Drag =
  | { mode: "draw"; page: number; x0: number; y0: number; id: string }
  | { mode: "move" | "resize"; id: string; px: number; py: number; start: PlacedBox };

/**
 * Mostra as páginas do PDF e deixa desenhar, mover e redimensionar caixas.
 * `tool` = o que será desenhado ao arrastar numa área vazia (campo ou marca selecionado).
 */
export function PdfPlacer({
  source,
  boxes,
  onChange,
  tool,
  onCreate,
  selected,
  onSelect,
  onPages,
  maxPages,
}: {
  source: string | ArrayBuffer | null;
  boxes: PlacedBox[];
  onChange: (boxes: PlacedBox[]) => void;
  tool: PlacerTool | null;
  /** Cria a caixa nova com o id do item da ferramenta (ex.: chave do campo). */
  onCreate: (box: Omit<PlacedBox, "id" | "kind" | "label">, tool: PlacerTool) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onPages?: (pages: { width: number; height: number }[]) => void;
  /** Mostra só as primeiras páginas (amostras longas). */
  maxPages?: number;
}) {
  const { t } = useAppI18n();
  const wrap = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [error, setError] = useState(false);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<PlacedBox | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pagesCb = useRef(onPages);
  pagesCb.current = onPages;

  useEffect(() => {
    if (!source) return;
    let alive = true;
    let opened: PdfDocument | null = null;
    setError(false);
    openPdf(source)
      .then(async (d) => {
        opened = d;
        if (!alive) return void d.destroy();
        setDoc(d);
        const sizes = [];
        for (let n = 1; n <= d.numPages; n++) {
          const vp = (await d.getPage(n)).getViewport({ scale: 1 });
          sizes.push({ width: vp.width, height: vp.height });
        }
        if (alive) pagesCb.current?.(sizes);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
      void opened?.destroy();
    };
  }, [source]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pointIn = (page: number, e: { clientX: number; clientY: number }) => {
    const r = pageRefs.current.get(page)!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };

  function startDraw(page: number, e: ReactPointerEvent) {
    if (!tool || e.button !== 0) return onSelect(null);
    const p = pointIn(page, e);
    capture(e);
    setDrag({ mode: "draw", page, x0: p.x, y0: p.y, id: "draft" });
    setDraft({ id: "draft", page, x: p.x, y: p.y, w: 0, h: 0, kind: tool.kind, label: tool.label });
  }

  function startBox(box: PlacedBox, mode: "move" | "resize", e: ReactPointerEvent) {
    e.stopPropagation();
    if (e.button !== 0) return;
    capture(e);
    onSelect(box.id);
    setDrag({ mode, id: box.id, px: e.clientX, py: e.clientY, start: box });
  }

  function onMove(e: ReactPointerEvent) {
    if (!drag) return;
    if (drag.mode === "draw") {
      const p = pointIn(drag.page, e);
      setDraft(
        (d) =>
          d && {
            ...d,
            x: Math.min(drag.x0, p.x),
            y: Math.min(drag.y0, p.y),
            w: Math.abs(p.x - drag.x0),
            h: Math.abs(p.y - drag.y0),
          },
      );
      return;
    }
    const r = pageRefs.current.get(drag.start.page)!.getBoundingClientRect();
    const dx = (e.clientX - drag.px) / r.width;
    const dy = (e.clientY - drag.py) / r.height;
    const s = drag.start;
    const next =
      drag.mode === "move"
        ? { ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) }
        : { ...s, w: clamp(s.w + dx, MIN, 1 - s.x), h: clamp(s.h + dy, MIN, 1 - s.y) };
    onChange(boxes.map((b) => (b.id === s.id ? next : b)));
  }

  function onUp() {
    if (drag?.mode === "draw" && draft && tool) {
      // Clique sem arrastar: caixa com tamanho padrão.
      const box =
        draft.w < MIN || draft.h < MIN
          ? {
              ...draft,
              w: tool.kind === "mark" ? 0.25 : 0.3,
              h: tool.kind === "mark" ? 0.07 : 0.03,
            }
          : draft;
      onCreate(
        {
          page: box.page,
          x: clamp(box.x, 0, 1 - box.w),
          y: clamp(box.y, 0, 1 - box.h),
          w: box.w,
          h: box.h,
          ...(tool.tone !== undefined ? { tone: tool.tone } : {}),
        },
        tool,
      );
    }
    setDrag(null);
    setDraft(null);
  }

  function onKey(box: PlacedBox, e: React.KeyboardEvent) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onChange(boxes.filter((b) => b.id !== box.id));
      onSelect(null);
    } else if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key]!;
      onChange(
        boxes.map((b) =>
          b.id === box.id
            ? { ...b, x: clamp(b.x + dx, 0, 1 - b.w), y: clamp(b.y + dy, 0, 1 - b.h) }
            : b,
        ),
      );
    }
  }

  const pageCount = doc ? Math.min(doc.numPages, maxPages ?? doc.numPages) : 0;

  return (
    <div ref={wrap} className="w-full" onPointerMove={onMove} onPointerUp={onUp}>
      {error && <p className="p-4 text-sm text-destructive">{t.errors["pdf_unreadable"]}</p>}
      {!doc && !error && (
        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t.common.loading}
        </p>
      )}
      {doc &&
        width > 0 &&
        Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
          <div key={n} className="mb-4">
            <p className="mb-1 text-xs text-muted-foreground">
              {t.pdf.page} {n} / {doc.numPages}
            </p>
            <div
              ref={(el) => {
                if (el) pageRefs.current.set(n, el);
              }}
              className={cn(
                "relative overflow-hidden rounded-md border bg-white shadow-sm select-none",
                tool && "cursor-crosshair",
              )}
              onPointerDown={(e) => startDraw(n, e)}
            >
              <PageCanvas doc={doc} n={n} width={width} />
              {[...boxes.filter((b) => b.page === n), ...(draft?.page === n ? [draft] : [])].map(
                (b) => (
                  <div
                    key={b.id}
                    role="button"
                    tabIndex={0}
                    aria-label={b.label}
                    aria-pressed={selected === b.id}
                    onPointerDown={(e) => startBox(b, "move", e)}
                    onKeyDown={(e) => onKey(b, e)}
                    onFocus={() => onSelect(b.id)}
                    className={cn(
                      "absolute flex cursor-move items-center overflow-hidden rounded-sm border-2 px-1 text-[11px] leading-tight font-semibold focus:outline-none",
                      tones[(b.tone ?? 0) % tones.length],
                      b.kind === "mark" && "border-dashed",
                      selected === b.id && "ring-2 ring-offset-1 ring-brand",
                    )}
                    style={{
                      left: `${b.x * 100}%`,
                      top: `${b.y * 100}%`,
                      width: `${b.w * 100}%`,
                      height: `${b.h * 100}%`,
                    }}
                  >
                    <span className="truncate">{b.label}</span>
                    {b.id !== "draft" && (
                      <span
                        aria-hidden
                        onPointerDown={(e) => startBox(b, "resize", e)}
                        className="absolute right-0 bottom-0 size-3 cursor-se-resize bg-current opacity-60"
                      />
                    )}
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

function PageCanvas({ doc, n, width }: { doc: PdfDocument; n: number; width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let task: { cancel: () => void } | null = null;
    let alive = true;
    void doc.getPage(n).then((page) => {
      if (!alive || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      const ratio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (width / base.width) * ratio });
      const c = canvas.current;
      c.width = viewport.width;
      c.height = viewport.height;
      c.style.width = `${width}px`;
      c.style.height = `${viewport.height / ratio}px`;
      const r = page.render({ canvasContext: c.getContext("2d")!, viewport });
      task = r;
      r.promise.catch(() => undefined);
    });
    return () => {
      alive = false;
      task?.cancel();
    };
  }, [doc, n, width]);
  return <canvas ref={canvas} className="block" aria-hidden />;
}
