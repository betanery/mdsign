export type BulkJob = {
  id: string;
  name: string;
  status: "draft" | "sending" | "done" | "canceled";
  total: number;
  sent: number;
  failed: number;
  created_at: string;
};

export const bulkTone: Record<BulkJob["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  sending: "bg-orange-100 text-orange-700",
  done: "bg-success/15 text-green-800",
  canceled: "bg-muted text-muted-foreground",
};
