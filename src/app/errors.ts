import type { AppMessages } from "@/i18n/app/pt";
import { ApiError } from "./api";

export const errorCode = (e: unknown) =>
  e instanceof ApiError ? e.code : typeof e === "string" ? e : "internal_error";

/** Mensagem humana para um erro das funções (códigos estáveis do backend). */
export function errorText(t: AppMessages, e: unknown): string {
  const code = errorCode(e);
  const text = t.errors[code] ?? t.common.genericError;
  // Recusa do motor: mostra o motivo dado pelo SignDoc para facilitar o suporte.
  if (e instanceof ApiError && code === "engine_rejected" && e.details) {
    const d = e.details as {
      code?: string | null;
      message?: string | null;
      errors?: Record<string, string[]> | null;
    };
    const fields = d.errors
      ? Object.entries(d.errors)
          .map(([k, v]) => `${k}: ${[v].flat().join(" ")}`)
          .join("; ")
      : "";
    const reason = [d.code, d.message, fields].filter(Boolean).join(" — ");
    if (reason) return `${text} (${reason})`;
  }
  // Recusa do Asaas: mostra o motivo dado pelo serviço de pagamento.
  if (e instanceof ApiError && code === "billing_rejected" && e.details) {
    const reasons = (
      (e.details as { errors?: { description?: string | null }[] | null }).errors ?? []
    )
      .map((x) => x.description)
      .filter(Boolean);
    if (reasons.length) return `${text} (${reasons.join(" ")})`;
  }
  return text;
}

/** Problemas por participante devolvidos em invalid_participants: { índice: [campos] }. */
export function participantProblems(e: unknown): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  if (e instanceof ApiError && e.code === "invalid_participants" && Array.isArray(e.details))
    for (const d of e.details as { index: number; field: string }[])
      (out[d.index] ??= []).push(d.field);
  return out;
}

/** Campos com problema devolvidos em invalid_fields. */
export function fieldProblems(e: unknown): string[] {
  return e instanceof ApiError && e.code === "invalid_fields" && Array.isArray(e.details)
    ? (e.details as string[])
    : [];
}
