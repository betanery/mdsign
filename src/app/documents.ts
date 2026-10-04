import type { AppMessages } from "@/i18n/app/pt";

export type DocStatus = "pending" | "concluded" | "refused" | "canceled" | "expired";

export type ParticipantRow = {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  role: "signer" | "approver";
  step: number;
  status: "created" | "pending" | "completed" | "refused";
};

export type DocumentRow = {
  id: string;
  name: string;
  kind: "self" | "send";
  status: DocStatus;
  created_at: string;
  updated_at: string;
  concluded_at: string | null;
  created_by: string | null;
  document_participants: ParticipantRow[];
};

export const documentSelect =
  "id, name, kind, status, created_at, updated_at, concluded_at, created_by, document_participants (id, user_id, name, email, role, step, status)";

/** Status em linguagem humana (PRD §26): "Aguardando assinatura de João Silva". */
export function humanStatus(
  doc: Pick<DocumentRow, "status" | "document_participants">,
  userId: string | undefined,
  t: AppMessages,
  f: (text: string, values: Record<string, string>) => string,
): string {
  const parts = [...doc.document_participants].sort((a, b) => a.step - b.step);
  if (doc.status === "pending") {
    const next = parts.find((p) => p.status === "pending");
    if (next)
      return next.user_id === userId
        ? t.documents.waitingForYou
        : f(t.documents.waitingFor, { name: next.name });
  }
  if (doc.status === "refused") {
    const who = parts.find((p) => p.status === "refused");
    if (who) return f(t.documents.refusedBy, { name: who.name });
  }
  return t.documents.status[doc.status] ?? doc.status;
}

export const statusTone: Record<DocStatus, string> = {
  pending: "bg-orange-100 text-orange-700",
  concluded: "bg-success/15 text-success",
  refused: "bg-destructive/10 text-destructive",
  canceled: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

export function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}
