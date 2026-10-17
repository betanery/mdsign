import { useCallback, useEffect, useState } from "react";
import { FeatureGate } from "@/app/components/feature-preview";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, Play, Save, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, SectionTabs } from "@/app/components/app-shell";
import { useConfirm } from "@/app/components/confirm-dialog";
import { SaveProcessDialog } from "@/app/components/save-process-dialog";
import { formatDate } from "@/app/documents";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { friendlyError } from "@/app/validation";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

// Processos MDSign: configurações de envio em massa salvas para repetir ("Fazer de novo").
// Um envio concluído só vira processo quando alguém o salva; por isso a página também lista os
// envios concluídos ainda não salvos, com o botão de salvar ali mesmo.
export const Route = createFileRoute("/app/_shell/processes")({
  // Recurso do plano: fora dele, a prévia de upgrade no lugar da tela (o backend recusa).
  component: () => (
    <FeatureGate code="bulk_send">
      <ProcessesPage />
    </FeatureGate>
  ),
});

type ProcessRow = {
  id: string;
  name: string;
  kind: "bulk_pdf" | "bulk_template";
  updated_at: string;
  last_run_at: string | null;
  config: { jobId?: string } | null;
};
type JobRow = {
  id: string;
  name: string;
  source: "pdf" | "template";
  total: number;
  updated_at: string;
};

function ProcessesPage() {
  const { t, f, locale } = useAppI18n();
  const { current, can } = useOrg();
  const [rows, setRows] = useState<ProcessRow[] | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [saving, setSaving] = useState<JobRow | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const orgId = current?.id;

  const load = useCallback(async () => {
    if (!orgId) return;
    const [p, j] = await Promise.all([
      supabase
        .from("processes")
        .select("id, name, kind, updated_at, last_run_at, config")
        .eq("organization_id", orgId)
        .order("name"),
      supabase
        .from("bulk_jobs")
        .select("id, name, source, total, updated_at")
        .eq("organization_id", orgId)
        .eq("status", "done")
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);
    setRows((p.data as ProcessRow[] | null) ?? []);
    setJobs((j.data as JobRow[] | null) ?? []);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(p: ProcessRow) {
    const ok = await confirm({
      title: t.processes.removeTitle,
      text: f(t.processes.removeText, { name: p.name }),
      action: t.common.remove,
    });
    if (!ok) return;
    const { error } = await supabase.from("processes").delete().eq("id", p.id);
    if (error) {
      toast.error(friendlyError(error, t));
      return;
    }
    toast.success(t.processes.removed);
    void load();
  }

  if (!current) return <p>{t.notFoundOrg}</p>;
  if (!can("bulk.send")) return <p>{t.common.forbidden}</p>;

  // Processos salvos antes de guardarem o lote de origem: compara pelo nome.
  const savedJobs = new Set((rows ?? []).map((p) => p.config?.jobId).filter(Boolean));
  const savedNames = new Set((rows ?? []).filter((p) => !p.config?.jobId).map((p) => p.name));
  const unsaved = jobs.filter((j) => !savedJobs.has(j.id) && !savedNames.has(j.name));

  return (
    <>
      <PageHeader title={t.processes.title} subtitle={t.processes.subtitle} />
      <SectionTabs
        tabs={[
          { to: "/app/bulk", label: t.sections.bulk },
          { to: "/app/processes", label: t.sections.processes },
        ]}
      />
      {rows === null ? (
        <p className="text-muted-foreground">{t.common.loading}</p>
      ) : (
        <div className="grid gap-8">
          <section aria-labelledby="proc-saved" className="grid gap-3">
            <h2 id="proc-saved" className="font-display text-lg font-semibold">
              {t.processes.saved_}
            </h2>
            {rows.length === 0 ? (
              <p className="rounded-2xl border bg-white p-5 text-muted-foreground">
                {unsaved.length ? t.processes.noneSaved : t.processes.empty2}
              </p>
            ) : (
              <ul className="grid gap-3">
                {rows.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm"
                  >
                    <Workflow className="size-5 shrink-0 text-brand" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {t.processes.kinds[p.kind]} · {t.processes.lastUpdate}{" "}
                        {formatDate(p.last_run_at ?? p.updated_at, locale)}
                      </p>
                    </div>
                    <Button asChild className="bg-brand hover:bg-brand-strong">
                      <Link to="/app/bulk/new" search={{ process: p.id }}>
                        <Play aria-hidden />
                        {t.processes.runAgain}
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void remove(p)}
                      aria-label={`${t.common.remove} ${p.name}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {unsaved.length > 0 && (
            <section aria-labelledby="proc-recent" className="grid gap-3">
              <div>
                <h2 id="proc-recent" className="font-display text-lg font-semibold">
                  {t.processes.recent}
                </h2>
                <p className="text-sm text-muted-foreground">{t.processes.recentHint}</p>
              </div>
              <ul className="grid gap-3">
                {unsaved.map((j) => (
                  <li
                    key={j.id}
                    className="flex flex-wrap items-center gap-4 rounded-2xl border border-dashed bg-white p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{j.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {t.processes.kinds[j.source === "pdf" ? "bulk_pdf" : "bulk_template"]} ·{" "}
                        {f(j.total === 1 ? t.processes.doc1 : t.processes.docs, {
                          n: String(j.total),
                        })}{" "}
                        · {formatDate(j.updated_at, locale)}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/app/bulk/$id" params={{ id: j.id }}>
                        <Eye aria-hidden />
                        {t.processes.viewJob}
                      </Link>
                    </Button>
                    <Button variant="outline" onClick={() => setSaving(j)}>
                      <Save aria-hidden />
                      {t.processes.saveThis}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {saving && (
        <SaveProcessDialog
          jobId={saving.id}
          name={saving.name}
          onClose={() => setSaving(null)}
          onSaved={() => void load()}
        />
      )}
      {confirmDialog}
    </>
  );
}
