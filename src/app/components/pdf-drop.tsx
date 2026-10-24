import { useRef, useState } from "react";
import { FileUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppI18n } from "../i18n";

const MAX_BYTES = 20 * 1024 * 1024;

/** Área para arrastar/escolher um PDF (até 20 MB). */
export function PdfDrop({
  file,
  onFile,
  onError,
  maxBytes = MAX_BYTES,
  hint,
}: {
  file: File | null;
  onFile: (f: File) => void;
  onError: (code: string) => void;
  maxBytes?: number;
  hint?: string;
}) {
  const { t } = useAppI18n();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function pick(f: File | undefined) {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"))
      return onError("file_not_pdf");
    if (f.size > maxBytes) return onError("file_too_large");
    onFile(f);
  }

  return (
    <div
      data-tour="pdf-drop"
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        pick(e.dataTransfer.files[0]);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-white p-10 text-center transition-colors",
        drag ? "border-brand bg-brand-soft" : "border-border hover:border-brand/60",
      )}
    >
      <FileUp className="size-10 text-brand" aria-hidden />
      {file ? (
        <p className="font-medium">{file.name}</p>
      ) : (
        <>
          <p className="font-medium">{t.sign.dropTitle}</p>
          <p className="text-sm text-muted-foreground">{hint ?? t.sign.dropHint}</p>
        </>
      )}
      <span className="text-sm font-semibold text-brand">
        {file ? t.sign.change : t.sign.choose}
      </span>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </div>
  );
}

/** Indicador de passos do assistente. */
export function Stepper({
  steps,
  hints,
  current,
  onStep,
}: {
  steps: readonly string[];
  /** O que cada etapa pede: mostrado desde o início, para ninguém ser pego de surpresa. */
  hints?: readonly string[] | undefined;
  current: number;
  /** Passos já concluídos ficam clicáveis para voltar e editar. */
  onStep?: ((step: number) => void) | undefined;
}) {
  const { t } = useAppI18n();
  return (
    <ol
      className={cn(
        "mb-6 text-sm",
        hints
          ? "grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-2"
          : "flex flex-wrap gap-2",
      )}
      aria-label={t.common.steps}
    >
      {steps.map((label, i) => {
        const hint = hints?.[i];
        const className = cn(
          hint
            ? "grid h-full w-full content-start gap-1 rounded-xl border bg-white p-3 text-left"
            : "flex items-center gap-2 rounded-full border px-3 py-1",
          i === current && "border-brand bg-brand-soft font-semibold text-brand-strong",
          i < current && "border-success/40 text-success",
          i > current && (hint ? "text-foreground/80" : "text-muted-foreground"),
        );
        const number = (
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              hint ? "bg-muted" : "bg-white",
              hint && i === current && "bg-brand text-white",
              hint && i < current && "bg-success text-white",
            )}
          >
            {i + 1}
          </span>
        );
        const content = hint ? (
          <>
            <span className="flex items-center gap-2">
              {number}
              {label}
            </span>
            <span
              className={cn(
                "text-xs font-normal",
                i === current ? "text-brand-strong/80" : "text-muted-foreground",
              )}
            >
              {hint}
            </span>
          </>
        ) : (
          <>
            {number}
            {label}
          </>
        );
        return (
          <li key={label} aria-current={i === current ? "step" : undefined} className="min-w-0">
            {onStep && i < current ? (
              <button
                type="button"
                onClick={() => onStep(i)}
                className={cn(className, "hover:bg-success/10")}
                title={`${t.common.back}: ${label}`}
              >
                {content}
              </button>
            ) : (
              <span className={className}>{content}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
