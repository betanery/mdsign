import type { AppMessages } from "@/i18n/app/pt";
import { ApiError } from "./api";

export const errorCode = (e: unknown) =>
  e instanceof ApiError ? e.code : typeof e === "string" ? e : "internal_error";

/** Mensagem humana para um erro das funções (códigos estáveis do backend). */
export function errorText(t: AppMessages, e: unknown): string {
  const code = errorCode(e);
  return t.errors[code] ?? t.common.genericError;
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
