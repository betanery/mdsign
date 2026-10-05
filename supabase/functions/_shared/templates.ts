// Carrega um modelo e gera o PDF com os valores (PRD §13). Dois tipos:
// - texto: marcação simples com {{campos}}, o PDF é gerado aqui;
// - pdf: PDF pronto da organização, com campos posicionados e marcas de assinatura por papel.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { admin } from "./auth.ts";
import { AppError } from "./http.ts";
import { footerText } from "./options.ts";
import {
  cleanParticipants,
  type AuthLevel,
  type CleanParticipant,
  type ParticipantInput,
} from "./participants.ts";
import { cleanBox, type MarkType, type RelMark } from "./pdf.ts";
import { renderPdfTemplate, renderTemplatePdf, type TemplateField } from "./render.ts";

export type TemplateRole = {
  slot: number;
  label: string;
  role: "signer" | "approver" | "witness";
  authLevel: AuthLevel;
};
export type TemplateMark = RelMark & { slot: number };
export type TemplateFlow = {
  sequential?: boolean;
  message?: string;
  reminders?: { enabled: boolean; firstDays: number; everyDays: number; max: number };
};

export type Template = {
  id: string;
  organization_id: string | null;
  scope: "mdsign" | "organization" | "personal";
  kind: "text" | "pdf";
  file_path: string | null;
  page_count: number | null;
  name: string;
  locale: string;
  body: string;
  fields: TemplateField[];
  participants: TemplateRole[];
  flow: TemplateFlow;
  marks: TemplateMark[];
};

export const TEMPLATE_COLUMNS =
  "id, organization_id, scope, kind, file_path, page_count, name, locale, body, fields, participants, flow, marks";

const markTypes: MarkType[] = ["signature", "initials", "stamp"];
const markNames: Record<string, Record<MarkType, string>> = {
  pt: { signature: "Assinatura", initials: "Rubrica", stamp: "Carimbo" },
  en: { signature: "Signature", initials: "Initials", stamp: "Stamp" },
  es: { signature: "Firma", initials: "Rúbrica", stamp: "Sello" },
};

/** Normaliza o que veio do banco ou do navegador (rascunho em teste). */
export function normalizeTemplate(raw: Record<string, unknown>): Template {
  const pages = Number(raw["page_count"]) || 200;
  const fields = (Array.isArray(raw["fields"]) ? raw["fields"] : []) as TemplateField[];
  const roles = (Array.isArray(raw["participants"]) ? raw["participants"] : []) as TemplateRole[];
  const marks = (Array.isArray(raw["marks"]) ? raw["marks"] : []) as TemplateMark[];
  return {
    ...(raw as unknown as Template),
    kind: raw["kind"] === "pdf" ? "pdf" : "text",
    body: String(raw["body"] ?? ""),
    fields: fields
      .filter((f) => f && /^[a-zA-Z0-9_]{1,60}$/.test(String(f.key)))
      .slice(0, 200)
      .map((f) => ({
        ...f,
        boxes: (f.boxes ?? [])
          .map((b) => cleanBox(b, pages))
          .filter((b) => b !== null)
          .slice(0, 50),
      })),
    participants: roles
      .filter((r) => Number.isInteger(r?.slot) && r.slot >= 1 && r.slot <= 10)
      .map((r) => ({
        slot: r.slot,
        label: String(r.label ?? "").slice(0, 60),
        role: r.role === "approver" ? "approver" : r.role === "witness" ? "witness" : "signer",
        authLevel: (r.authLevel ?? "basic") as AuthLevel,
      })),
    flow: (raw["flow"] && typeof raw["flow"] === "object" ? raw["flow"] : {}) as TemplateFlow,
    marks: marks
      .filter((m) => markTypes.includes(m?.type))
      .map((m) => {
        const box = cleanBox(m, pages);
        return box ? { ...box, type: m.type, slot: Math.trunc(Number(m.slot)) || 1 } : null;
      })
      .filter((m) => m !== null)
      .slice(0, 400),
  };
}

/** Com o cliente do usuário, as políticas decidem se ele pode usar o modelo. */
export async function loadTemplate(
  client: SupabaseClient,
  id: string,
  organizationId: string,
): Promise<Template> {
  const { data } = await client
    .from("templates")
    .select(TEMPLATE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new AppError("template_not_found", 404);
  // Modelo de outra organização nunca é usado, mesmo que a política permita lê-lo.
  if (data.scope !== "mdsign" && data.organization_id !== organizationId)
    throw new AppError("template_not_found", 404);
  return normalizeTemplate(data as Record<string, unknown>);
}

export function cleanValues(values: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (values && typeof values === "object")
    for (const [k, v] of Object.entries(values as Record<string, unknown>))
      if (/^[a-zA-Z0-9_]{1,60}$/.test(k) && v != null) out[k] = String(v).slice(0, 2000);
  return out;
}

/** Arquivo do modelo PDF, sempre da pasta da organização. */
export async function templateFile(path: string, organizationId: string): Promise<Uint8Array> {
  if (!path.startsWith(`${organizationId}/`)) throw new AppError("template_not_found", 404);
  const { data, error } = await admin.storage.from("templates").download(path);
  if (error || !data) throw new AppError("template_not_found", 404);
  return new Uint8Array(await data.arrayBuffer());
}

/** Variáveis ligadas a um papel (ex.: nome do Signatário 2) vêm de quem ocupa o papel. */
export function slotValues(
  t: Template,
  values: Record<string, string>,
  bySlot: Map<number, CleanParticipant>,
): Record<string, string> {
  const out = { ...values };
  for (const f of t.fields) {
    const p = f.slot ? bySlot.get(f.slot) : undefined;
    if (p && f.slotAttr) out[f.key] = String(p[f.slotAttr] ?? "");
  }
  return out;
}

/** Campos de papel são preenchidos no envio: não são exigidos de quem preenche os dados. */
export const fillableFields = (t: Template) => t.fields.filter((f) => !(f.slot && f.slotAttr));

/** Pessoas por papel, na ordem dos papéis do modelo. */
export function roleParticipants(
  t: Template,
  roles: Record<string, ParticipantInput>,
  sequential: boolean,
) {
  const ordered = [...t.participants].sort((a, b) => a.slot - b.slot);
  const list = cleanParticipants(
    ordered.map((r) => ({
      ...(roles[String(r.slot)] ?? { name: "", email: "" }),
      role: r.role,
      authLevel: roles[String(r.slot)]?.authLevel ?? r.authLevel,
    })),
    sequential,
  );
  const bySlot = new Map<number, CleanParticipant>(ordered.map((r, i) => [r.slot, list[i]!]));
  return { list, slots: ordered.map((r) => r.slot), bySlot };
}

/** Primeiro papel do fluxo (quem responde o link ou a linha da planilha). */
export const firstSlot = (t: Template) => Math.min(...t.participants.map((r) => r.slot)) || 1;

/** Marcas do modelo alinhadas à lista de participantes do envio. */
export function marksFor(t: Template, slots: number[]): RelMark[][] {
  return slots.map((slot) => t.marks.filter((m) => m.slot === slot).map(({ slot: _s, ...m }) => m));
}

export async function renderTemplate(
  t: Template,
  values: Record<string, string>,
  /** `optional`: teste de rascunho — campos vazios saem em branco; o formato continua conferido. */
  opts: { previewMarks?: boolean; skipSlotFields?: boolean; optional?: boolean } = {},
) {
  const base = opts.skipSlotFields ? fillableFields(t) : t.fields;
  const fields = opts.optional ? base.map((f) => ({ ...f, required: false })) : base;
  if (t.kind === "pdf") {
    if (!t.file_path || !t.organization_id) throw new AppError("template_not_found", 404);
    const labels = new Map(t.participants.map((r) => [r.slot, r.label]));
    return renderPdfTemplate({
      pdf: await templateFile(t.file_path, t.organization_id),
      fields,
      values,
      locale: t.locale,
      ...(opts.previewMarks
        ? {
            previewMarks: t.marks.map((m) => ({
              ...m,
              label: `${(markNames[t.locale] ?? markNames["pt"]!)[m.type]} · ${labels.get(m.slot) ?? m.slot}`,
            })),
          }
        : {}),
    });
  }
  return renderTemplatePdf({
    title: t.name,
    body: t.body,
    fields,
    values,
    locale: t.locale,
    footer: footerText[t.locale] ?? footerText["pt"]!,
  });
}

export const pdfFilename = (name: string) =>
  `${
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\w.-]+/g, "-")
      .slice(0, 80) || "documento"
  }.pdf`;
