import { useCallback, useEffect, useRef, useState } from "react";
import { FeatureGate } from "@/app/components/feature-preview";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Loader2, RotateCcw, Save, XCircle } from "lucide-react";
import { toast } from "sonner";

import { callFunction } from "@/app/api";
import { bulkLabel, bulkTone, type BulkJob } from "@/app/bulk";
import { PageHeader } from "@/app/components/app-shell";
import { FormMessage } from "@/app/components/auth-layout";
import { useConfirm } from "@/app/components/confirm-dialog";
import { SaveProcessDialog } from "@/app/components/save-process-dialog";
import { errorText } from "@/app/errors";
import { useAppI18n } from "@/app/i18n";
import { downloadCsv, toCsv } from "@/app/sheet";
import { formatCpf, isValidCpf, onlyDigits } from "@/app/validation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// Acompanhamento de um envio em massa: status de cada documento, central de erros,
// reenvio só dos itens com erro e "Salvar como Processo MDSign".
export const Route = createFileRoute("/app/_shell/bulk/$id")({
  // Recurso do plano: fora dele, a prévia de upgrade no lugar da tela (o backend recusa).
  component: () => (
    <FeatureGate code="bulk_send">
      <BulkJobPage />
    </FeatureGate>
  ),
});

type Item = {
  row_number: number;
  status: "pending" | "processing" | "sent" | "failed";
  error: string | null;
  document_id: string | null;
  page_from: number | null;
  page_to: number | null;
  data: { name: string; email: string; cpf?: string | null };
  documents: { status: string } | null;
};
type Job = BulkJob & { source: "template" | "pdf"; source_name: string | null };

const itemState = (i: Item, jobStatus: string) =>
  i.status === "failed"
    ? "failed"
    : i.status === "processing"
      ? "sending"
      : i.status === "sent"
        ? i.documents?.status === "concluded"
          ? "signed"
          : i.documents?.status === "pending"
            ? "waiting"
            : "sent"
        : jobStatus === "sending"
          ? "sending"
          : "ready";

const stateTone: Record<string, string> = {
  ready: "bg-muted text-muted-foreground",
  sending: "bg-orange-100 text-orange-700",
  sent: "bg-sky-100 text-sky-800",
  waiting: "bg-orange-100 text-orange-700",
  signed: "bg-success/15 text-green-800",
  failed: "bg-destructive/10 text-destructive",
};

function BulkJobPage() {
  const { id } = Route.useParams();
  const { t, f } = useAppI18n();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [items, setItems] = useState<Item[]>([]);
  const [fixing, setFixing] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const working = useRef(false);
  // Reinicia o processamento na tela após um reenvio.
  const [kick, setKick] = useState(0);

  const load = useCallback(async () => {
    const [j, list] = await Promise.all([
      supabase
        .from("bulk_jobs")
        .select("id, name, status, total, sent, failed, created_at, source, source_name")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("bulk_items")
        .select(
          "row_number, status, error, document_id, page_from, page_to, data, documents (status)",
        )
        .eq("job_id", id)
        .order("row_number")
        .limit(1000),
    ]);
    setJob((j.data as Job | null) ?? null);
    setItems((list.data as unknown as Item[] | null) ?? []);
    return (j.data as Job | null)?.status;
  }, [id]);

  // Enquanto a página estiver aberta, processa em lotes pequenos (o agendador continua se fechar).
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const status = await load();
      if (stop || status !== "sending" || working.current) return;
      working.current = true;
      try {
        await callFunction("bulk-jobs", { action: "process", jobId: id });
      } catch {
        // o agendador tenta de novo
      } finally {
        working.current = false;
      }
      if (!stop) setTimeout(() => void tick(), 1500);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [id, load, kick]);

  async function run(action: string, success?: string) {
    setBusy(action);
    try {
      await callFunction("bulk-jobs", { action, jobId: id });
      if (success) toast.success(success);
      await load();
      // Reenvio: volta a processar enquanto a página estiver aberta.
      if (action === "retry-failed") setKick((k) => k + 1);
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setBusy(null);
    }
  }

  if (job === undefined) return <p>{t.common.loading}</p>;
  if (job === null) return <p>{t.common.forbidden}</p>;
  const done = job.sent + job.failed;
  const pct = job.total ? Math.round((done / job.total) * 100) : 0;
  const failures = items.filter((i) => i.status === "failed");

  return (
    <>
      <PageHeader
        title={job.name}
        subtitle={job.source_name ? `${t.bulk.title} · ${job.source_name}` : t.bulk.title}
        actions={
          <div className="flex flex-wrap gap-2">
            {(job.status === "done" || job.status === "sending") && (
              <Button variant="outline" onClick={() => setSaving(true)}>
                <Save aria-hidden />
                {t.processes.save}
              </Button>
            )}
            {(job.status === "sending" || job.status === "draft") && (
              <Button
                variant="outline"
                onClick={() =>
                  void confirm({
                    title: t.bulk.cancel,
                    text: t.bulk.cancelConfirm,
                    action: t.bulk.cancel,
                  }).then((ok) => ok && void run("cancel"))
                }
              >
                <XCircle aria-hidden />
                {t.bulk.cancel}
              </Button>
            )}
          </div>
        }
      />
      <section className="grid gap-3 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold",
              bulkTone[bulkLabel(job)],
            )}
          >
            {t.bulk.status[bulkLabel(job)]}
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
        <section className="mt-6 rounded-2xl border border-destructive/30 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <h2 className="font-display text-lg font-semibold">
              {t.bulkJob.errorCenter} ({failures.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-brand hover:bg-brand-strong"
                disabled={busy !== null || job.status === "canceled"}
                onClick={() => void run("retry-failed", t.bulkJob.retried)}
              >
                {busy === "retry-failed" ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <RotateCcw aria-hidden />
                )}
                {t.bulkJob.retryFailed}
              </Button>
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
          </div>
          <ul className="divide-y text-sm">
            {failures.map((x) => (
              <li key={x.row_number} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3">
                <span className="text-muted-foreground">
                  {t.bulk.row} {x.row_number}
                </span>
                <span className="font-medium">{x.data.name}</span>
                <span>{x.data.email}</span>
                <span className="flex-1 text-destructive">
                  {t.errors[x.error ?? ""] ?? x.error}
                </span>
                <Button size="sm" variant="outline" onClick={() => setFixing(x)}>
                  {t.bulkJob.fix}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-2xl border bg-white shadow-sm">
        <h2 className="border-b p-4 font-display text-lg font-semibold">{t.bulkJob.items}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">{t.bulk.row}</th>
                {job.source === "pdf" && <th className="p-2 font-medium">{t.split.pages}</th>}
                <th className="p-2 font-medium">{t.participants.name}</th>
                <th className="p-2 font-medium">{t.participants.email}</th>
                <th className="p-2 font-medium">{t.admin.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.slice(0, 500).map((x) => {
                const state = itemState(x, job.status);
                return (
                  <tr key={x.row_number}>
                    <td className="p-2 text-muted-foreground">{x.row_number}</td>
                    {job.source === "pdf" && (
                      <td className="p-2 whitespace-nowrap">
                        {x.page_from === x.page_to ? x.page_from : `${x.page_from}–${x.page_to}`}
                      </td>
                    )}
                    <td className="p-2 font-medium">
                      {x.document_id ? (
                        <Link
                          to="/app/documents/$id"
                          params={{ id: x.document_id }}
                          className="hover:text-brand"
                        >
                          {x.data.name}
                        </Link>
                      ) : (
                        x.data.name
                      )}
                    </td>
                    <td className="p-2">{x.data.email}</td>
                    <td className="p-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
                          stateTone[state],
                        )}
                      >
                        {t.bulkJob.itemStatus[state]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {fixing && (
        <FixDialog
          jobId={job.id}
          item={fixing}
          onClose={() => setFixing(null)}
          onSaved={() => {
            setFixing(null);
            void load();
          }}
        />
      )}
      {saving && (
        <SaveProcessDialog jobId={job.id} name={job.name} onClose={() => setSaving(false)} />
      )}
      {confirmDialog}
    </>
  );
}

function FixDialog({
  jobId,
  item,
  onClose,
  onSaved,
}: {
  jobId: string;
  item: Item;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, f } = useAppI18n();
  const [name, setName] = useState(item.data.name);
  const [email, setEmail] = useState(item.data.email);
  const [cpf, setCpf] = useState(item.data.cpf ? formatCpf(item.data.cpf) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError(t.participants.fieldErrors["name"]!);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
      return setError(t.participants.fieldErrors["email"]!);
    if (!isValidCpf(cpf)) return setError(t.participants.fieldErrors["cpf"]!);
    setBusy(true);
    try {
      await callFunction("bulk-jobs", {
        action: "update-item",
        jobId,
        row: item.row_number,
        recipient: { name: name.trim(), email: email.trim().toLowerCase(), cpf: onlyDigits(cpf) },
      });
      onSaved();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{f(t.bulkJob.fixTitle, { row: String(item.row_number) })}</DialogTitle>
          <DialogDescription>{t.bulkJob.fixHint}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void save(e)} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="fix-name">{t.participants.name}</Label>
            <Input id="fix-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fix-email">{t.participants.email}</Label>
            <Input
              id="fix-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fix-cpf">{t.participants.cpf}</Label>
            <Input
              id="fix-cpf"
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
            />
          </div>
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={busy} className="bg-brand hover:bg-brand-strong">
              {t.common.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
