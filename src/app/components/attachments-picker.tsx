// Anexos de apoio no envio (não precisam de assinatura): até 5 arquivos PDF, JPG ou PNG de até
// 10 MB. O servidor confere o tipo real de cada arquivo de novo.

import { Paperclip, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppI18n } from "../i18n";

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ACCEPT = /\.(pdf|jpe?g|png)$/i;

/** Junta os novos à lista, mantendo os limites; devolve o motivo quando algum ficou de fora. */
export function addAttachments(
  current: File[],
  incoming: File[],
): {
  files: File[];
  problem: "too_many_attachments" | "attachment_too_large" | "attachment_type" | null;
} {
  let problem: "too_many_attachments" | "attachment_too_large" | "attachment_type" | null = null;
  const files = [...current];
  for (const f of incoming) {
    if (!ACCEPT.test(f.name)) problem = "attachment_type";
    else if (f.size > MAX_ATTACHMENT_BYTES) problem = "attachment_too_large";
    else if (files.length >= MAX_ATTACHMENTS) problem = "too_many_attachments";
    else if (!files.some((x) => x.name === f.name && x.size === f.size)) files.push(f);
  }
  return { files, problem };
}

export function AttachmentsPicker({
  files,
  onChange,
  onError,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  onError: (code: string | null) => void;
}) {
  const { t } = useAppI18n();
  const kb = (n: number) =>
    n >= 1024 * 1024
      ? `${(n / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(n / 1024))} KB`;
  return (
    <section className="grid gap-2 rounded-2xl border bg-white p-4" aria-labelledby="att-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="att-title" className="flex items-center gap-2 text-sm font-semibold">
            <Paperclip className="size-4 text-brand" aria-hidden />
            {t.attachments.title}
          </h3>
          <p className="text-xs text-muted-foreground">{t.attachments.hint}</p>
        </div>
        {files.length < MAX_ATTACHMENTS && (
          <Button asChild variant="outline" size="sm">
            <label className="cursor-pointer">
              {t.attachments.add}
              <input
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                className="sr-only"
                onChange={(e) => {
                  const r = addAttachments(files, Array.from(e.target.files ?? []));
                  onChange(r.files);
                  onError(r.problem);
                  e.target.value = "";
                }}
              />
            </label>
          </Button>
        )}
      </div>
      {files.length > 0 && (
        <ul className="grid gap-1 text-sm">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-1.5"
            >
              <span className="min-w-0 truncate">
                {f.name} <span className="text-xs text-muted-foreground">· {kb(f.size)}</span>
              </span>
              <button
                type="button"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-white hover:text-foreground"
                aria-label={`${t.attachments.remove}: ${f.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
