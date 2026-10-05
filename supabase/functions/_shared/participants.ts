// Validação de participantes e níveis de autenticação (PRD §9 e §10).

import { AppError } from "./http.ts";

export type AuthLevel =
  | "basic"
  | "reinforced"
  | "reinforced_whatsapp"
  | "identity"
  | "identity_datavalid"
  | "high"
  | "qualified";

/**
 * Métodos contratados/ativos na instância (segredo SIGNDOC_AUTH_METHODS, ex.:
 * "sms,whatsapp,selfie,datavalid"; "liveness" libera a prova de vida). Sem configuração, só
 * e-mail e certificado. "Não prometer método não confirmado" (PRD §10).
 */
const methods = new Set(
  (Deno.env.get("SIGNDOC_AUTH_METHODS") ?? "")
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean),
);

/** Participantes sem CPF exigem General.CountryIdentifierMode=Nullable no motor. */
export const identifierOptional = Deno.env.get("SIGNDOC_IDENTIFIER_OPTIONAL") === "true";

/** Cada nível usa um método do motor (nomes conferidos no Swagger do SignDoc 2.9). */
const levelMethods: [AuthLevel, string, Record<string, boolean>][] = [
  ["reinforced", "sms", { requireSmsAuthenticationToSignElectronically: true }],
  ["reinforced_whatsapp", "whatsapp", { requireWhatsappAuthenticationToSignElectronically: true }],
  ["identity", "selfie", { requireSelfieAuthenticationToSignElectronically: true }],
  ["identity_datavalid", "datavalid", { requireDatavalidAuthenticationToSignElectronically: true }],
  ["high", "liveness", { requireLivenessAuthenticationToSignElectronically: true }],
];

export function availableAuthLevels(): AuthLevel[] {
  return [
    "basic",
    ...levelMethods.filter(([, method]) => methods.has(method)).map(([level]) => level),
    "qualified",
  ];
}

/** Níveis que exigem celular do participante. */
export const needsPhone = (level: AuthLevel) =>
  level === "reinforced" || level === "reinforced_whatsapp";

/** Flags do motor para cada nível. */
export function authFlags(level: AuthLevel): Record<string, boolean> {
  if (level === "qualified") return { allowElectronicSignature: false };
  const extra = levelMethods.find(([l]) => l === level)?.[2] ?? {};
  return { allowElectronicSignature: true, ...extra };
}

export function isValidCpf(value: string): boolean {
  const cpf = value.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type ParticipantInput = {
  name: string;
  email: string;
  cpf?: string | null;
  noCpf?: boolean;
  phone?: string | null;
  role?: "signer" | "approver";
  authLevel?: AuthLevel;
};

export type CleanParticipant = {
  name: string;
  email: string;
  cpf: string | null;
  noCpf: boolean;
  phone: string | null;
  role: "signer" | "approver";
  authLevel: AuthLevel;
  step: number;
};

/** Valida e normaliza. Devolve a lista com o problema de cada linha, se houver. */
export function cleanParticipants(
  list: ParticipantInput[],
  sequential: boolean,
): CleanParticipant[] {
  if (!Array.isArray(list) || list.length === 0) throw new AppError("participants_required");
  if (list.length > 30) throw new AppError("too_many_participants");
  const levels = availableAuthLevels();
  const problems: { index: number; field: string }[] = [];
  const seen = new Set<string>();
  const clean = list.map((p, index) => {
    const name = String(p.name ?? "").trim();
    const email = String(p.email ?? "")
      .trim()
      .toLowerCase();
    const cpf = p.noCpf ? null : String(p.cpf ?? "").replace(/\D/g, "");
    const authLevel = (p.authLevel ?? "basic") as AuthLevel;
    if (name.length < 2) problems.push({ index, field: "name" });
    if (!EMAIL.test(email)) problems.push({ index, field: "email" });
    if (p.noCpf ? !identifierOptional : !isValidCpf(cpf ?? ""))
      problems.push({ index, field: "cpf" });
    if (!levels.includes(authLevel)) problems.push({ index, field: "authLevel" });
    if (needsPhone(authLevel) && String(p.phone ?? "").replace(/\D/g, "").length < 10)
      problems.push({ index, field: "phone" });
    // Datavalid consulta a base do governo pelo CPF: não serve para estrangeiros.
    if (authLevel === "identity_datavalid" && p.noCpf) problems.push({ index, field: "authLevel" });
    if (seen.has(email)) problems.push({ index, field: "duplicate" });
    seen.add(email);
    return {
      name,
      email,
      cpf: cpf || null,
      noCpf: Boolean(p.noCpf),
      phone: p.phone ? String(p.phone).trim().slice(0, 30) : null,
      role: p.role === "approver" ? "approver" : "signer",
      authLevel,
      step: sequential ? index + 1 : 1,
    } as CleanParticipant;
  });
  if (problems.length) throw new AppError("invalid_participants", 422, problems);
  return clean;
}

export const notificationLanguage: Record<string, string> = { pt: "Pt", en: "En", es: "Es" };

/** Monta o flowAction do motor para um participante. */
export function toFlowAction(p: CleanParticipant, locale: string) {
  return {
    type: p.role === "approver" ? "Approver" : "Signer",
    step: p.step,
    user: {
      name: p.name,
      email: p.email,
      ...(p.cpf ? { identifier: p.cpf } : {}),
      ...(p.phone ? { phone: p.phone } : {}),
    },
    ...(p.role === "signer" ? authFlags(p.authLevel) : {}),
    notificationLanguage: notificationLanguage[locale] ?? "Pt",
  };
}
