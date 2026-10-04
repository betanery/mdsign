import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, Info, LayoutTemplate, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/app/auth";
import { PageHeader } from "@/app/components/app-shell";
import { templateSelect, type TemplateRow } from "@/app/components/template-fields";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { friendlyError } from "@/app/validation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";

// Modelos (PRD §13): biblioteca MDSign, da organização e pessoais.
export const Route = createFileRoute("/app/_shell/templates/")({ component: TemplatesPage });

type Tab = "library" | "organization" | "mine";

function TemplatesPage() {
  const { t, f } = useAppI18n();
  const { user } = useAuth();
  const { current, can } = useOrg();
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [tab, setTab] = useState<Tab>("library");

  const load = useCallback(async () => {
    if (!current) return;
    const { data } = await supabase
      .from("templates")
      .select(templateSelect)
      .or(`scope.eq.mdsign,organization_id.eq.${current.id}`)
      .order("name");
    setTemplates((data as TemplateRow[] | null) ?? []);
  }, [current]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(tpl: TemplateRow) {
    if (!window.confirm(f(t.templates.removeConfirm, { name: tpl.name }))) return;
    const { error } = await supabase.from("templates").delete().eq("id", tpl.id);
    if (error) {
      toast.error(error.code === "23503" ? t.templates.inUse : friendlyError(error, t));
      return;
    }
    toast.success(t.templates.removed);
    void load();
  }

  const byTab: Record<Tab, TemplateRow[]> = {
    library: (templates ?? []).filter((x) => x.scope === "mdsign"),
    organization: (templates ?? []).filter((x) => x.scope === "organization"),
    mine: (templates ?? []).filter((x) => x.scope === "personal" && x.owner_id === user?.id),
  };
  const canEdit = (x: TemplateRow) =>
    x.scope === "personal"
      ? x.owner_id === user?.id
      : x.scope === "organization" && can("templates.manage");

  if (!current) return <p>{t.notFoundOrg}</p>;
  return (
    <>
      <PageHeader
        title={t.templates.title}
        subtitle={t.templates.subtitle}
        actions={
          can("documents.create") && (
            <Button asChild className="bg-brand hover:bg-brand-strong">
              <Link to="/app/templates/new">
                <Plus aria-hidden />
                {t.templates.new}
              </Link>
            </Button>
          )
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
          {(["library", "organization", "mine"] as const).map((k) => (
            <TabsTrigger key={k} value={k}>
              {t.templates.tabs[k]} ({byTab[k].length})
            </TabsTrigger>
          ))}
        </TabsList>
        {(["library", "organization", "mine"] as const).map((k) => (
          <TabsContent key={k} value={k}>
            {k === "library" && (
              <p className="mb-4 flex items-start gap-2 rounded-xl border border-brand/20 bg-brand-soft px-4 py-3 text-sm text-brand-strong">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t.templates.libraryNotice}
              </p>
            )}
            {templates === null ? (
              <p className="text-muted-foreground">{t.common.loading}</p>
            ) : byTab[k].length === 0 ? (
              <p className="rounded-2xl border bg-white p-5 text-muted-foreground">
                {t.templates.empty}
              </p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {byTab[k].map((tpl) => (
                  <li
                    key={tpl.id}
                    className="flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft">
                        <LayoutTemplate className="size-5 text-brand" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <h2 className="font-display font-semibold">{tpl.name}</h2>
                        <p className="text-xs text-muted-foreground">
                          {t.templates.categories[tpl.category] ?? tpl.category} ·{" "}
                          {f(t.templates.fieldsCount, { n: String(tpl.fields.length) })}
                        </p>
                      </div>
                    </div>
                    {tpl.description && (
                      <p className="flex-1 text-sm text-muted-foreground">{tpl.description}</p>
                    )}
                    <div className="mt-auto flex flex-wrap gap-2">
                      {can("documents.create") && (
                        <Button asChild size="sm" className="bg-brand hover:bg-brand-strong">
                          <Link to="/app/templates/$id" params={{ id: tpl.id }}>
                            {t.templates.use}
                          </Link>
                        </Button>
                      )}
                      {canEdit(tpl) && (
                        <Button asChild size="sm" variant="outline">
                          <Link to="/app/templates/edit/$id" params={{ id: tpl.id }}>
                            <Pencil aria-hidden />
                            {t.templates.edit}
                          </Link>
                        </Button>
                      )}
                      {can("documents.create") && (
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/app/templates/new" search={{ from: tpl.id }}>
                            <Copy aria-hidden />
                            {t.templates.duplicate}
                          </Link>
                        </Button>
                      )}
                      {canEdit(tpl) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void remove(tpl)}
                          aria-label={`${t.templates.remove} ${tpl.name}`}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
