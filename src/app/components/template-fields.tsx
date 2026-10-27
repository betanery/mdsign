import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AppMessages } from "@/i18n/app/pt";
import type { AuthLevel } from "../app-config";
import { selectClass } from "../ui";
import {
  formatCnpj,
  formatCpf,
  formatPhone,
  isValidCnpj,
  isValidCpf,
  onlyDigits,
} from "../validation";

export const fieldTypes = [
  "text",
  "cpf",
  "cnpj",
  "email",
  "phone",
  "date",
  "currency",
  "number",
  "select",
  "checkbox",
] as const;
export type FieldType = (typeof fieldTypes)[number];

/** Origem do valor (preenchimento manual, signatário, remetente, contato, planilha, API, HCM). */
export const fieldSources = [
  "manual",
  "signer",
  "sender",
  "contact",
  "excel",
  "api",
  "hcm",
] as const;
export type FieldSource = (typeof fieldSources)[number];

/** Posição relativa à página (frações 0–1, origem no canto superior esquerdo; página 1 = 1). */
export type RelBox = { page: number; x: number; y: number; w: number; h: number };

export type TemplateField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  source?: FieldSource;
  options?: string[];
  /** Modelo PDF: onde o valor aparece e/ou campo de formulário do próprio PDF. */
  boxes?: RelBox[];
  pdfField?: string;
  /** Preenchido com o dado de quem ocupa o papel (ex.: nome do Signatário 2). */
  slot?: number | undefined;
  slotAttr?: "name" | "email" | "cpf" | "phone" | undefined;
};

export type TemplateRole = {
  slot: number;
  label: string;
  role: "signer" | "approver" | "witness";
  authLevel: AuthLevel;
};
export type MarkType = "signature" | "initials" | "stamp";
export type TemplateMark = RelBox & { slot: number; type: MarkType };

/**
 * O SignDoc aceita uma única posição de assinatura por pessoa (rubrica e carimbo podem
 * repetir): a assinatura `keep` substitui as outras assinaturas da mesma pessoa.
 */
export function oneSignature<T extends { type: MarkType }>(
  list: T[],
  keep: T,
  samePerson: (a: T, b: T) => boolean = () => true,
): T[] {
  if (keep.type !== "signature") return list;
  return list.filter((m) => m === keep || m.type !== "signature" || !samePerson(m, keep));
}
export type TemplateFlow = {
  sequential?: boolean;
  message?: string;
  reminders?: { enabled: boolean; firstDays: number; everyDays: number; max: number };
};

export type TemplateRow = {
  id: string;
  organization_id: string | null;
  owner_id: string | null;
  scope: "mdsign" | "organization" | "personal";
  category: string;
  locale: "pt" | "en" | "es";
  name: string;
  description: string | null;
  body: string;
  fields: TemplateField[];
  updated_at: string;
  kind: "text" | "pdf";
  file_path: string | null;
  page_count: number | null;
  participants: TemplateRole[];
  flow: TemplateFlow;
  marks: TemplateMark[];
};

export const templateSelect =
  "id, organization_id, owner_id, scope, category, locale, name, description, body, fields, updated_at, kind, file_path, page_count, participants, flow, marks";

/** Campos que quem envia/responde preenche (os de papel vêm das pessoas escolhidas). */
export const fillableFields = (fields: TemplateField[]) =>
  fields.filter((f) => !(f.slot && f.slotAttr));

/** Campos {{chave}} usados no texto (mesma regra do gerador de PDF). */
export function placeholders(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]!))];
}

const humanize = (key: string) => key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function guessType(key: string): FieldType {
  const k = key.toLowerCase();
  if (k.includes("cpf")) return "cpf";
  if (k.includes("cnpj")) return "cnpj";
  if (k.includes("email")) return "email";
  if (k.includes("telefone") || k.includes("celular") || k.includes("phone")) return "phone";
  if (k.startsWith("data") || k.includes("date") || k.includes("fecha")) return "date";
  if (k.includes("valor") || k.includes("preco") || k.includes("price")) return "currency";
  return "text";
}

/** Mantém os campos alinhados ao texto: cria os novos e remove os que saíram. */
export function syncFields(body: string, fields: TemplateField[]): TemplateField[] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  return placeholders(body).map(
    (key) =>
      byKey.get(key) ?? {
        key,
        label: humanize(key),
        type: guessType(key),
        required: true,
        source: "sender",
      },
  );
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Mesmas regras do backend (validateValues). Devolve as chaves com problema. */
export function validateValues(fields: TemplateField[], values: Record<string, string>): string[] {
  const bad: string[] = [];
  for (const f of fields) {
    const v = String(values[f.key] ?? "").trim();
    if (!v) {
      if (f.required) bad.push(f.key);
      continue;
    }
    if (f.type === "cpf" && !isValidCpf(v)) bad.push(f.key);
    if (f.type === "cnpj" && !isValidCnpj(v)) bad.push(f.key);
    if (f.type === "email" && !EMAIL.test(v)) bad.push(f.key);
    if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) bad.push(f.key);
    if (f.type === "select" && f.options?.length && !f.options.includes(v)) bad.push(f.key);
  }
  return bad;
}

/** Normaliza valores vindos de planilha/digitação (datas dd/mm/aaaa, CPF com pontos…). */
export function normalizeValue(field: TemplateField, raw: string): string {
  const v = String(raw ?? "").trim();
  if (field.type === "date") {
    const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2]!.padStart(2, "0")}-${br[1]!.padStart(2, "0")}`;
  }
  if (field.type === "cpf" || field.type === "cnpj") return onlyDigits(v);
  return v;
}

export function FieldInput({
  field,
  value,
  onChange,
  invalid,
  t,
  idPrefix = "f",
}: {
  field: TemplateField;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
  t: AppMessages;
  idPrefix?: string;
}) {
  const id = `${idPrefix}-${field.key}`;
  const label = (
    <Label htmlFor={id}>
      {field.label}
      {!field.required && (
        <span className="font-normal text-muted-foreground"> ({t.common.optional})</span>
      )}
    </Label>
  );
  let input;
  switch (field.type) {
    case "select":
      input = (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(selectClass, "h-10 w-full")}
          aria-invalid={invalid}
        >
          <option value="">{t.templates.fill.choose}</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    case "checkbox":
      input = (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(selectClass, "h-10 w-full")}
          aria-invalid={invalid}
        >
          <option value="">{t.templates.fill.choose}</option>
          <option value="true">{t.common.yes}</option>
          <option value="false">{t.common.no}</option>
        </select>
      );
      break;
    default:
      input = (
        <Input
          id={id}
          value={
            field.type === "cpf"
              ? formatCpf(value)
              : field.type === "cnpj"
                ? formatCnpj(value)
                : field.type === "phone"
                  ? formatPhone(value)
                  : value
          }
          type={
            field.type === "date"
              ? "date"
              : field.type === "email"
                ? "email"
                : field.type === "number"
                  ? "number"
                  : field.type === "phone"
                    ? "tel"
                    : "text"
          }
          inputMode={
            field.type === "cpf" || field.type === "cnpj" || field.type === "currency"
              ? "decimal"
              : undefined
          }
          onChange={(e) =>
            onChange(
              field.type === "cpf" || field.type === "cnpj"
                ? onlyDigits(e.target.value)
                : field.type === "phone"
                  ? formatPhone(e.target.value)
                  : e.target.value,
            )
          }
          aria-invalid={invalid}
          maxLength={2000}
        />
      );
  }
  return (
    <div className="grid gap-1.5">
      {label}
      {input}
      {invalid && <p className="text-xs text-destructive">{t.templates.fill.fieldInvalid}</p>}
    </div>
  );
}
