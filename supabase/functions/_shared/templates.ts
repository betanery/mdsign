// Carrega um modelo e gera o PDF com os valores (PRD §13).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { AppError } from "./http.ts";
import { footerText } from "./options.ts";
import { renderTemplatePdf, type TemplateField } from "./render.ts";

export type Template = {
  id: string;
  organization_id: string | null;
  scope: "mdsign" | "organization" | "personal";
  name: string;
  locale: string;
  body: string;
  fields: TemplateField[];
};

/** Com o cliente do usuário, as políticas decidem se ele pode usar o modelo. */
export async function loadTemplate(
  client: SupabaseClient,
  id: string,
  organizationId: string,
): Promise<Template> {
  const { data } = await client
    .from("templates")
    .select("id, organization_id, scope, name, locale, body, fields")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new AppError("template_not_found", 404);
  // Modelo de outra organização nunca é usado, mesmo que a política permita lê-lo.
  if (data.scope !== "mdsign" && data.organization_id !== organizationId)
    throw new AppError("template_not_found", 404);
  return { ...data, fields: Array.isArray(data.fields) ? data.fields : [] } as Template;
}

export function cleanValues(values: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (values && typeof values === "object")
    for (const [k, v] of Object.entries(values as Record<string, unknown>))
      if (/^[a-zA-Z0-9_]{1,60}$/.test(k) && v != null) out[k] = String(v).slice(0, 2000);
  return out;
}

export function renderTemplate(t: Template, values: Record<string, string>) {
  return renderTemplatePdf({
    title: t.name,
    body: t.body,
    fields: t.fields,
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
