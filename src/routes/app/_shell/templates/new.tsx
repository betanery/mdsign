import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/app/components/app-shell";
import { TemplateEditor } from "@/app/components/template-editor";
import { templateSelect, type TemplateRow } from "@/app/components/template-fields";
import { useAppI18n } from "@/app/i18n";
import { supabase } from "@/lib/supabase";

// Novo modelo (em branco ou duplicando um existente, ex.: da biblioteca MDSign).
export const Route = createFileRoute("/app/_shell/templates/new")({
  validateSearch: (search: Record<string, unknown>): { from?: string | undefined } => ({
    from: typeof search["from"] === "string" ? search["from"] : undefined,
  }),
  component: NewTemplate,
});

function NewTemplate() {
  const { t } = useAppI18n();
  const { from } = Route.useSearch();
  const [base, setBase] = useState<Partial<TemplateRow> | null>(from ? null : {});

  useEffect(() => {
    if (!from) return;
    supabase
      .from("templates")
      .select(templateSelect)
      .eq("id", from)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as TemplateRow | null;
        if (!row) return setBase({});
        const { name, description, category, locale, body, fields } = row;
        setBase({ name: `${name} (2)`, description, category, locale, body, fields });
      });
  }, [from]);

  return (
    <>
      <PageHeader title={t.templates.editor.titleNew} />
      {base ? <TemplateEditor initial={base} /> : <p>{t.common.loading}</p>}
    </>
  );
}
