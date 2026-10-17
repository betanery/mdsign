export type BulkJob = {
  id: string;
  name: string;
  status: "draft" | "sending" | "done" | "canceled";
  total: number;
  sent: number;
  failed: number;
  created_at: string;
};

export type BulkLabel = BulkJob["status"] | "partial" | "failed";

/** Situação para mostrar: "Concluído" só quando nada falhou. */
export function bulkLabel(job: Pick<BulkJob, "status" | "sent" | "failed">): BulkLabel {
  if (job.status !== "done" || job.failed === 0) return job.status;
  return job.sent === 0 ? "failed" : "partial";
}

export const bulkTone: Record<BulkLabel, string> = {
  draft: "bg-muted text-muted-foreground",
  sending: "bg-orange-100 text-orange-700",
  done: "bg-success/15 text-green-800",
  canceled: "bg-muted text-muted-foreground",
  partial: "bg-orange-100 text-orange-700",
  failed: "bg-destructive/10 text-destructive",
};
