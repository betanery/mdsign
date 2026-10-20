// Validação pública de documentos: o que o motor devolve vira uma resposta sem dados pessoais
// além do necessário (nome de quem assinou, quando, como e se a assinatura é válida).
// Nunca sai e-mail, CPF completo, impressão digital do certificado nem evidências.

import type { EngineSignaturesInfo, EngineSigner } from "./signdoc.ts";

export type PublicSigner = {
  name: string;
  /** CPF mascarado (***.456.789-**) ou null quando não for CPF. */
  cpf: string | null;
  signedAt: string | null;
  kind: "certificate" | "electronic";
  /** true = válida; false = inválida; null = o motor não conseguiu concluir. */
  valid: boolean | null;
};

export type PublicDocument = {
  name: string | null;
  concluded: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  /** Situação no MDSign (cancelado, expirado…); null quando o documento não é deste MDSign. */
  status: "pending" | "concluded" | "refused" | "canceled" | "expired" | null;
  /** Quantas pessoas ainda precisam assinar ou aprovar; null quando não dá para saber. */
  pending: number | null;
};

/** Quem ainda não assinou nem aprovou (sem nomes: só a contagem sai na validação pública). */
export function pendingCount(participants: { status: string }[] | null | undefined) {
  if (!participants) return null;
  return participants.filter((p) => p.status === "pending" || p.status === "created").length;
}

/** Código como a pessoa digita (" abcd-1234 ") → "ABCD-1234"; null se não parecer código. */
export function cleanKey(raw: unknown): string | null {
  const key = String(raw ?? "")
    .toUpperCase()
    .replace(/[\s.]/g, "");
  return /^[A-Z0-9][A-Z0-9-]{4,46}[A-Z0-9]$/.test(key) ? key : null;
}

export function maskCpf(identifier: string | null | undefined): string | null {
  const d = String(identifier ?? "").replace(/\D/g, "");
  if (d.length !== 11) return null;
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

export function publicSigners(signers: EngineSigner[] | null | undefined): PublicSigner[] {
  return (signers ?? []).map((s) => ({
    name: String(s.subjectName ?? "").slice(0, 160),
    cpf: maskCpf(s.identifier),
    signedAt: s.signingTime ?? null,
    kind: s.isElectronic ? "electronic" : "certificate",
    valid: typeof s.validationResults?.isValid === "boolean" ? s.validationResults.isValid : null,
  }));
}

export function publicDocument(
  info: EngineSignaturesInfo,
  local: { status: PublicDocument["status"]; pending: number | null } | null = null,
): PublicDocument {
  const concluded = Boolean(info.isConcluded) || local?.status === "concluded";
  return {
    name: info.name ? String(info.name).slice(0, 200) : null,
    concluded,
    createdAt: info.creationDate ?? null,
    updatedAt: info.updateDate ?? null,
    status: local?.status ?? null,
    pending: concluded ? 0 : (local?.pending ?? null),
  };
}

/** PDF de verdade e dentro do limite (o motor faz a validação criptográfica). */
export const MAX_VALIDATE_BYTES = 10 * 1024 * 1024;
export function looksLikePdf(bytes: Uint8Array) {
  return (
    bytes.length > 4 &&
    bytes.length <= MAX_VALIDATE_BYTES &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 // F
  );
}
