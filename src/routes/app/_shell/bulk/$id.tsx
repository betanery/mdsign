import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { callFunction } from "@/app/api";
import { bulkTone, type BulkJob } from "@/app/bulk";
import { PageHeader } from "@/app/components/app-shell";
import { errorText } from "@/app/errors";
import { useAppI18n } from "@/app/i18n";
import { downloadCsv, toCsv } from "@/app/sheet";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// Acompanhamento de um envio em massa: progresso, erros por linha e cancelamento.
export const Route = createFileRoute("/app/_shell/bulk/$id")({ component: BulkJobPage });

type Item = {
  row_number: number;
  status: string;
  error: string | null;
  document_id: string | null;
  data: { name: string; email: string };
};

function BulkJobPage() {
  const { id } = Route.useParams();
  const { t, f } = useAppI18n();
  const [job, setJob] = useState<BulkJob | null | undefined>(undefined);
  const [failures, setFailures] = useState<Item[]>([]);
  const busy = useRef(false);

  const load = useCallback(async () => {
    const [j, items] = await Promise.all([
      supabase
        .from("bulk_jobs")
        .select("id, name, status, total, sent, failed, created_at")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("bulk_items")
        .select("row_number, status, error, document_id, data")
        .eq("job_id", id)
        .eq("status", "failed")
        .order("row_number")
        .limit(1000),
    ]);
    setJob((j.data as BulkJob | null) ?? null);
    setFailures((items.data as Item[] | null) ?? []);
    return (j.data as BulkJob | null)?.status;
  }, [id]);

  // Enquanto a página estiver aberta, processa em lotes pequenos (o agendador continua se fechar).
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const status = await load();
      if (stop || status !== "sending" || busy.current) return;
      busy.current = true;
      try {
        await callFunction("bulk-jobs", { action: "process", jobId: id });
      } catch {
        // o agendador tenta de novo
      } finally {
        busy.current = false;
      }
      if (!stop) setTimeout(() => void tick(), 1500);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [id, load]);

  async function cancel() {
    if (!window.confirm(t.bulk.cancelConfirm)) return;
    try {
      await callFunction("bulk-jobs", { action: "cancel", jobId: id });
      void load();
    } catch (e) {
      toast.error(errorText(t, e));
    }
  }

  if (job === undefined) return <p>{t.common.loading}</p>;
  if (job === null) return <p>{t.common.forbidden}</p>;
  const done = job.sent + job.failed;
  const pct = job.total ? Math.round((done / job.total) * 100) : 0;

  return (
    <>
      <PageHeader
        title={job.name}
        subtitle={t.bulk.title}
        actions={
          (job.status === "sending" || job.status === "draft") && (
            <Button variant="outline" onClick={() => void cancel()}>
              <XCircle aria-hidden />
              {t.bulk.cancel}
            </Button>
          )
        }
      />
      <section className="grid gap-3 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", bulkTone[job.status])}
          >
            {t.bulk.status[job.status]}
          </span>
          {job.status === "sending" && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          )}
          <p className="text-sm" role="status">
            {f(t.bulk.progress, {
              sent: String(job.sent),
              failed: String(job.failed),
              total: String(job.total),
            })}
          </p>
        </div>
        <Progress value={pct} aria-label={`${pct}%`} />
        {job.status === "sending" && (
          <p className="text-sm text-muted-foreground">{t.bulk.keepOpen}</p>
        )}
        <Link to="/app/documents" className="w-fit text-sm font-semibold text-brand">
          {t.nav.documents}
        </Link>
      </section>

      {failures.length > 0 && (
        <section className="mt-6 rounded-2xl border bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <h2 className="font-display text-lg font-semibold">{t.bulk.failures}</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadCsv(
                  `mdsign-erros-${job.id.slice(0, 8)}.csv`,
                  toCsv(
                    [t.bulk.row, t.participants.name, t.participants.email, t.bulk.error],
                    failures.map((x) => [
                      String(x.row_number),
                      x.data.name,
                      x.data.email,
                      t.errors[x.error ?? ""] ?? x.error ?? "",
                    ]),
                  ),
                )
              }
            >
              <Download aria-hidden />
              {t.bulk.downloadFailures}
            </Button>
          </div>
          <ul className="divide-y text-sm">
            {failures.map((x) => (
              <li key={x.row_number} className="flex flex-wrap gap-x-4 gap-y-1 p-3">
                <span className="text-muted-foreground">
                  {t.bulk.row} {x.row_number}
                </span>
                <span className="font-medium">{x.data.name}</span>
                <span>{x.data.email}</span>
                <span className="text-destructive">{t.errors[x.error ?? ""] ?? x.error}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
