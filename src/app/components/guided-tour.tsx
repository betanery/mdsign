import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppI18n } from "../i18n";
import type { TourStop } from "../onboarding";

// Tour guiado sem biblioteca: navega até a tela do passo, destaca o elemento [data-tour] com um
// recorte e mostra um balão com o texto. Sem alvo (ex.: no celular), o balão fica centralizado.

export type TourItem = { stop: TourStop; title: string; text: string };

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 6;

/** Onde o balão fica: abaixo do alvo se couber, senão acima; sempre dentro da tela. */
export function bubblePosition(rect: Rect | null, vw: number, vh: number, w = 340, h = 190) {
  if (!rect || vw < 640) return null; // centralizado (ou embaixo no celular)
  const below = rect.top + rect.height + PAD + 12;
  const top = below + h <= vh ? below : Math.max(12, rect.top - PAD - 12 - h);
  const left = Math.min(Math.max(12, rect.left), vw - w - 12);
  return { top, left };
}

export function GuidedTour({
  items,
  onClose,
  onFinish,
}: {
  items: TourItem[];
  onClose: () => void;
  onFinish: () => void;
}) {
  const { t, f } = useAppI18n();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [view, setView] = useState({ w: 1024, h: 768 });
  const bubble = useRef<HTMLDivElement>(null);
  const item = items[index]!;
  const last = index === items.length - 1;

  // Vai para a tela do passo.
  useEffect(() => {
    const { to, search } = item.stop;
    const here = pathname.replace(/\/$/, "") || "/";
    if (here !== to.replace(/\/$/, "") || search)
      void navigate({ to, ...(search ? { search } : {}) } as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Procura o alvo (até 3 s) e acompanha rolagem e redimensionamento.
  const measure = useCallback(() => {
    setView({ w: window.innerWidth, h: window.innerHeight });
    const target = item.stop.target;
    const el = target ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null;
    if (!el || !el.offsetParent) return setRect(null);
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [item]);

  useLayoutEffect(() => {
    setRect(null);
    let tries = 0;
    let scrolled = false;
    const timer = window.setInterval(() => {
      tries++;
      const target = item.stop.target;
      const el = target ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null;
      if (el && el.offsetParent) {
        if (!scrolled) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          scrolled = true;
        }
        measure();
      } else if (tries > 30) {
        measure();
        window.clearInterval(timer);
      }
      if (tries > 40) window.clearInterval(timer);
    }, 100);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [item, measure]);

  useEffect(() => {
    bubble.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") {
        if (last) onFinish();
        else setIndex((i) => i + 1);
      }
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, last, onClose, onFinish]);

  const pos = bubblePosition(rect, view.w, view.h);
  const mobile = view.w < 640;

  return (
    <div className="fixed inset-0 z-[60]" aria-hidden={false}>
      {rect ? (
        <>
          {/* Quatro faixas escuras em volta do alvo (mais confiável que uma sombra gigante). */}
          {[
            { top: 0, left: 0, right: 0, height: Math.max(0, rect.top - PAD) },
            { top: rect.top + rect.height + PAD, left: 0, right: 0, bottom: 0 },
            {
              top: rect.top - PAD,
              left: 0,
              width: Math.max(0, rect.left - PAD),
              height: rect.height + PAD * 2,
            },
            {
              top: rect.top - PAD,
              left: rect.left + rect.width + PAD,
              right: 0,
              height: rect.height + PAD * 2,
            },
          ].map((style, i) => (
            <div key={i} aria-hidden className="fixed bg-[rgba(15,10,40,0.55)]" style={style} />
          ))}
          <div
            aria-hidden
            className="pointer-events-none fixed rounded-xl ring-2 ring-brand transition-all duration-200"
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
            }}
          />
        </>
      ) : (
        <div aria-hidden className="fixed inset-0 bg-[rgba(15,10,40,0.55)]" />
      )}
      <div
        ref={bubble}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        tabIndex={-1}
        className={
          mobile
            ? "fixed inset-x-3 bottom-3 rounded-2xl bg-white p-4 shadow-2xl outline-none"
            : pos
              ? "fixed w-[340px] rounded-2xl bg-white p-4 shadow-2xl outline-none"
              : "fixed top-1/2 left-1/2 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl outline-none"
        }
        style={!mobile && pos ? { top: pos.top, left: pos.left } : undefined}
      >
        <div className="flex items-start gap-2">
          <h2 id="tour-title" className="flex-1 font-display text-base font-semibold">
            {item.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.guide.skip}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <p id="tour-text" aria-live="polite" className="mt-1 text-sm text-muted-foreground">
          {item.text}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <span className="flex-1 text-xs text-muted-foreground">
            {f(t.guide.counter, { n: String(index + 1), total: String(items.length) })}
          </span>
          {index > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setIndex((i) => i - 1)}>
              {t.guide.back}
            </Button>
          )}
          <Button
            size="sm"
            className="bg-brand hover:bg-brand-strong"
            onClick={() => (last ? onFinish() : setIndex((i) => i + 1))}
          >
            {last ? t.guide.finish : t.guide.next}
          </Button>
        </div>
      </div>
    </div>
  );
}
