import { useEffect, useState } from "react";
import { FeatureGate } from "@/app/components/feature-preview";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, FileUp } from "lucide-react";

import { callFunction } from "@/app/api";
import { PageHeader } from "@/app/components/app-shell";
import { FormMessage } from "@/app/components/auth-layout";
import { PdfTemplateEditor } from "@/app/components/pdf-template-editor";
import { TemplateEditor } from "@/app/components/template-editor";
import { templateSelect, type TemplateRow } from "@/app/components/template-fields";
import { errorText } from "@/app/errors";
import { useAppI18n } from "@/app/i18n";
import { useAuth } from "@/app/auth";
import { useOrg } from "@/app/org";
import { clearTemplateDraft, loadTemplateDraft, type TemplateDraft } from "@/app/template-draft";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

type Search = { from?: string | undefined; kind?: "text" | "pdf" | undefined };

// Novo modelo: no editor de texto ou a partir de um PDF pronto (ou duplicando um existente).
export const Route = createFileRoute("/app/_shell/templates/new")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    from: typeof search["from"] === "string" ? search["from"] : undefined,
    kind: search["kind"] === "pdf" || search["kind"] === "text" ? search["kind"] : undefined,
  }),
  // Recurso do plano: fora dele, a prévia de upgrade no lugar da tela (o backend recusa).
  component: () => (
    <FeatureGate code="templates">
      <NewTemplate />
    </FeatureGate>
  ),
});

function NewTemplate() {
  const { t } = useAppI18n();
  const { current } = useOrg();
  const { from, kind } = Route.useSearch();
  const [base, setBase] = useState<Partial<TemplateRow> | null>(from ? null : {});
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  // Modelo PDF começado e não salvo: oferece continuar de onde parou.
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [resumed, setResumed] = useState<TemplateDraft | null>(null);
  useEffect(() => {
    if (from || kind !== "pdf" || !current || !user) return;
    setDraft(loadTemplateDraft(current.id, user.id));
  }, [from, kind, current, user]);

  useEffect(() => {
    if (!from || !current) return;
    supabase
      .from("templates")
      .select(templateSelect)
      .eq("id", from)
      .maybeSingle()
      .then(async ({ data }) => {
        const row = data as TemplateRow | null;
        if (!row) return setBase({});
        const { name, description, category, locale, body, fields, participants, flow, marks } =
          row;
        const copy = { name: `${name} (2)`, description, category, locale, body, fields };
        if (row.kind !== "pdf") return setBase({ ...copy, kind: "text" });
        // Modelo PDF: duplica também o arquivo.
        try {
          const r = await callFunction<{ path: string }>("templates-pdf", {
            action: "copy",
            organizationId: current.id,
            templateId: row.id,
          });
          setBase({
            ...copy,
            kind: "pdf",
            file_path: r.path,
            page_count: row.page_count,
            participants,
            flow,
            marks,
          });
        } catch (e) {
          setError(errorText(t, e));
        }
      });
  }, [from, current, t]);

  if (error) return <FormMessage kind="error">{error}</FormMessage>;
  const chosen = base?.kind ?? kind;

  if (!from && !kind)
    return (
      <>
        <PageHeader title={t.templates.editor.titleNew} subtitle={t.pdf.howTitle} />
        <ul className="grid max-w-3xl gap-4 sm:grid-cols-2">
          {(
            [
              ["text", FileText, t.pdf.fromEditor, t.pdf.fromEditorText],
              ["pdf", FileUp, t.pdf.fromPdf, t.pdf.fromPdfText],
            ] as const
          ).map(([value, Icon, title, text]) => (
            <li key={value}>
              <Link
                to="/app/templates/new"
                search={{ kind: value }}
                className="flex h-full flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm transition-colors hover:border-brand"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft">
                  <Icon className="size-5 text-brand" aria-hidden />
                </span>
                <span className="font-display text-base font-semibold">{title}</span>
                <span className="text-sm text-muted-foreground">{text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </>
    );

  return (
    <>
      <PageHeader title={t.templates.editor.titleNew} />
      {draft && !resumed && (
        <div
          className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand-soft px-4 py-3 text-sm"
          role="status"
        >
          <p className="flex-1">
            {t.pdf.draftFound
              .replace("{name}", draft.row.name?.trim() || t.pdf.draftUnnamed)
              .replace("{when}", new Date(draft.savedAt).toLocaleString())}
          </p>
          <Button
            size="sm"
            className="bg-brand hover:bg-brand-strong"
            onClick={() => setResumed(draft)}
          >
            {t.pdf.draftResume}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (current && user) clearTemplateDraft(current.id, user.id);
              setDraft(null);
            }}
          >
            {t.pdf.draftDiscard}
          </Button>
        </div>
      )}
      {!base ? (
        <p>{t.common.loading}</p>
      ) : chosen === "pdf" ? (
        resumed ? (
          <PdfTemplateEditor key="resumed" initial={resumed.row} initialStep={resumed.step} />
        ) : (
          <PdfTemplateEditor initial={base} />
        )
      ) : (
        <TemplateEditor initial={base} />
      )}
    </>
  );
}
