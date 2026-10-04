import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/app/components/app-shell";
import { TemplateEditor } from "@/app/components/template-editor";
import { templateSelect, type TemplateRow } from "@/app/components/template-fields";
import { useAppI18n } from "@/app/i18n";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/app/_shell/templates/edit/$id")({ component: EditTemplate });

function EditTemplate() {
  const { t } = useAppI18n();
  const { id } = Route.useParams();
  const [row, setRow] = useState<TemplateRow | null | undefined>(undefined);

  useEffect(() => {
    supabase
      .from("templates")
      .select(templateSelect)
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setRow((data as TemplateRow | null) ?? null));
  }, [id]);

  return (
    <>
      <PageHeader title={t.templates.editor.titleEdit} />
      {row === undefined ? (
        <p>{t.common.loading}</p>
      ) : row === null || row.scope === "mdsign" ? (
        <p>{t.errors["template_not_found"]}</p>
      ) : (
        <TemplateEditor initial={row} id={row.id} />
      )}
    </>
  );
}
