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

/**
 * Celular no formato internacional que o motor exige ("+55 11 91234-5678"). Aceita o número
 * como a pessoa digita: com ou sem DDI, com 0 na frente do DDD, com pontuação.
 * Devolve null se não der para entender o número.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  let d = value.replace(/\D/g, "");
  if (value.startsWith("+") && !d.startsWith("55")) {
    // Estrangeiro: mantém o DDI informado.
    return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
  }
  if (!value.startsWith("+")) d = d.replace(/^0+/, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = d.slice(0, 2);
  const local = d.slice(2);
  return `+55 ${ddd} ${local.slice(0, local.length - 4)}-${local.slice(-4)}`;
}

export type ParticipantInput = {
  name: string;
  email: string;
  cpf?: string | null;
  noCpf?: boolean;
  phone?: string | null;
  role?: "signer" | "approver" | "witness";
  authLevel?: AuthLevel;
};

export type CleanParticipant = {
  name: string;
  email: string;
  cpf: string | null;
  noCpf: boolean;
  phone: string | null;
  role: "signer" | "approver" | "witness";
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
    const phone = normalizePhone(p.phone);
    if (String(p.phone ?? "").trim() && !phone) problems.push({ index, field: "phone" });
    else if (needsPhone(authLevel) && !phone) problems.push({ index, field: "phone" });
    // Datavalid consulta a base do governo pelo CPF: não serve para estrangeiros.
    if (authLevel === "identity_datavalid" && p.noCpf) problems.push({ index, field: "authLevel" });
    if (seen.has(email)) problems.push({ index, field: "duplicate" });
    seen.add(email);
    return {
      name,
      email,
      cpf: cpf || null,
      noCpf: Boolean(p.noCpf),
      phone,
      role: p.role === "approver" ? "approver" : p.role === "witness" ? "witness" : "signer",
      authLevel,
      step: sequential ? index + 1 : 1,
    } as CleanParticipant;
  });
  if (problems.length) throw new AppError("invalid_participants", 422, problems);
  return clean;
}

export const notificationLanguage: Record<string, string> = { pt: "Pt", en: "En", es: "Es" };

/** No SignDoc a testemunha é um signatário com título (aparece no registro da assinatura). */
const witnessTitle: Record<string, string> = { pt: "Testemunha", en: "Witness", es: "Testigo" };

export type ObserverInput = { name: string; email: string; cpf: string | null };

/** Observadores: acompanham e recebem as notificações, sem assinar. */
export function cleanObservers(list: unknown): ObserverInput[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: ObserverInput[] = [];
  for (const o of list.slice(0, 20)) {
    const email = String(o?.email ?? "")
      .trim()
      .toLowerCase();
    const name =
      String(o?.name ?? "")
        .trim()
        .slice(0, 160) || email;
    const cpf = String(o?.cpf ?? "").replace(/\D/g, "") || null;
    if (!EMAIL.test(email)) throw new AppError("invalid_observers", 422, { email });
    // O SignDoc exige o CPF de todos (inclusive observadores), salvo com estrangeiros liberados.
    if (cpf ? !isValidCpf(cpf) : !identifierOptional)
      throw new AppError("invalid_observers", 422, { email, field: "cpf" });
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ name, email, cpf });
  }
  return out;
}

export const toObserver = (o: ObserverInput, locale: string) => ({
  user: { name: o.name, email: o.email, ...(o.cpf ? { identifier: o.cpf } : {}) },
  notificationLanguage: notificationLanguage[locale] ?? "Pt",
});

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
    ...(p.role !== "approver" ? authFlags(p.authLevel) : {}),
    ...(p.role === "witness" ? { title: witnessTitle[locale] ?? witnessTitle["pt"] } : {}),
    notificationLanguage: notificationLanguage[locale] ?? "Pt",
  };
}
