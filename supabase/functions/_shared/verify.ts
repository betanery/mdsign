// Conferência no servidor de que o documento separado é mesmo da pessoa associada:
// o identificador usado na associação (CPF, matrícula, e-mail ou identificador configurado)
// precisa aparecer no texto daquela parte. Regra determinística, sem IA.

import { extractText, getDocumentProxy } from "npm:unpdf@1.3.2";

export type MatchMethod = "cpf" | "matricula" | "email" | "custom" | "manual";

export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : String(text ?? "");
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** CPFs (com ou sem pontuação) encontrados no texto, só dígitos. */
export function cpfsIn(text: string): string[] {
  return [...text.matchAll(/(?<!\d)(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})(?!\d)/g)].map(
    (m) => `${m[1]}${m[2]}${m[3]}${m[4]}`,
  );
}

export function identifierPresent(text: string, method: MatchMethod, value: string): boolean {
  const v = String(value ?? "").trim();
  if (!v) return false;
  switch (method) {
    case "cpf":
      return cpfsIn(text).includes(v.replace(/\D/g, ""));
    case "email":
      return text.toLowerCase().includes(v.toLowerCase());
    case "matricula":
    case "custom":
      return new RegExp(`(?<![\\p{L}\\p{N}])${escape(v)}(?![\\p{L}\\p{N}])`, "iu").test(text);
    default:
      return false;
  }
}
