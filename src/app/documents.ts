import type { AppMessages } from "@/i18n/app/pt";

export type DocStatus = "pending" | "concluded" | "refused" | "canceled" | "expired";

export type ParticipantRow = {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  role: "signer" | "approver" | "witness";
  step: number;
  phone?: string | null;
  status: "created" | "pending" | "completed" | "refused" | "skipped";
  /** Age em delegação de outra pessoa (só aprovações). */
  delegated_from_name?: string | null;
  /** Quórum: grupo e quantas pessoas do grupo precisam agir. */
  rule_name?: string | null;
  rule_required?: number | null;
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
  folder_id?: string | null;
  document_participants: ParticipantRow[];
};

export const documentSelect =
  "id, name, kind, status, created_at, updated_at, concluded_at, created_by, folder_id, document_participants (id, user_id, name, email, phone, role, step, status, delegated_from_name, rule_name, rule_required)";

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
  concluded: "bg-success/15 text-green-800",
  refused: "bg-destructive/10 text-destructive",
  canceled: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

/** Só a data (ex.: prazo de disponibilidade). */
export function formatDay(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale, { dateStyle: "short" }).format(
    new Date(iso),
  );
}

export function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

/**
 * Fila "Assinar todos": documentos com ação minha pendente, assinaturas (e testemunhos)
 * primeiro e aprovações depois, mantendo a ordem da lista.
 */
export function pendingQueue<T>(
  docs: T[],
  myAction: (d: T) => { role: ParticipantRow["role"] } | undefined,
): T[] {
  const mine = docs.filter((d) => myAction(d));
  return [
    ...mine.filter((d) => myAction(d)!.role !== "approver"),
    ...mine.filter((d) => myAction(d)!.role === "approver"),
  ];
}
