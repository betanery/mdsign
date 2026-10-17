import { useEffect, useState } from "react";
import { FeatureGate } from "@/app/components/feature-preview";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { bulkLabel, bulkTone, type BulkJob } from "@/app/bulk";
import { PageHeader, SectionTabs } from "@/app/components/app-shell";
import { formatDate } from "@/app/documents";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// Envio em massa (PRD §17–§19): lotes da organização.
export const Route = createFileRoute("/app/_shell/bulk/")({
  // Recurso do plano: fora dele, a prévia de upgrade no lugar da tela (o backend recusa).
  component: () => (
    <FeatureGate code="bulk_send">
      <BulkList />
    </FeatureGate>
  ),
});

function BulkList() {
  const { t, f, locale } = useAppI18n();
  const { current, can } = useOrg();
  const [jobs, setJobs] = useState<BulkJob[] | null>(null);

  useEffect(() => {
    if (!current) return;
    supabase
      .from("bulk_jobs")
      .select("id, name, status, total, sent, failed, created_at")
      .eq("organization_id", current.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setJobs((data as BulkJob[] | null) ?? []));
  }, [current]);

  if (!current) return <p>{t.notFoundOrg}</p>;
  if (!can("bulk.send")) return <p>{t.common.forbidden}</p>;
  return (
    <>
      <PageHeader
        title={t.bulk.title}
        subtitle={t.bulk.subtitle}
        actions={
          <Button asChild className="bg-brand hover:bg-brand-strong">
            <Link to="/app/bulk/new">
              <Plus aria-hidden />
              {t.bulk.new}
            </Link>
          </Button>
        }
      />
      <SectionTabs
        tabs={[
          { to: "/app/bulk", label: t.sections.bulk },
          { to: "/app/processes", label: t.sections.processes },
        ]}
      />
      {jobs === null ? (
        <p className="text-muted-foreground">{t.common.loading}</p>
      ) : jobs.length === 0 ? (
        <p className="rounded-2xl border bg-white p-5 text-muted-foreground">{t.bulk.empty}</p>
      ) : (
        <ul className="divide-y rounded-2xl border bg-white shadow-sm">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                to="/app/bulk/$id"
                params={{ id: job.id }}
                className="flex flex-wrap items-center gap-3 p-4 hover:bg-brand-soft/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{job.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {f(t.bulk.progress, {
                      sent: String(job.sent),
                      failed: String(job.failed),
                      total: String(job.total),
                    })}{" "}
                    · {formatDate(job.created_at, locale)}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    bulkTone[bulkLabel(job)],
                  )}
                >
                  {t.bulk.status[bulkLabel(job)]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
