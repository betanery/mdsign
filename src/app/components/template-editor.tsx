import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { locales, localeNames } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../auth";
import { useAppI18n } from "../i18n";
import { useOrg } from "../org";
import { selectClass } from "../ui";
import { friendlyError } from "../validation";
import { FormMessage } from "./auth-layout";
import {
  fieldTypes,
  syncFields,
  type FieldType,
  type TemplateField,
  type TemplateRow,
} from "./template-fields";

const categories = ["hr", "commercial", "legal", "health", "finance", "other"] as const;

/** Editor de modelo: texto com {{campos}} + configuração de cada campo (PRD §13). */
export function TemplateEditor({ initial, id }: { initial?: Partial<TemplateRow>; id?: string }) {
  const { t, locale } = useAppI18n();
  const { user } = useAuth();
  const { current, can } = useOrg();
  const navigate = useNavigate();
  const canOrg = can("templates.manage");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? "other");
  const [docLocale, setDocLocale] = useState(initial?.locale ?? locale);
  const [scope, setScope] = useState<"organization" | "personal">(
    initial?.scope !== "personal" && canOrg ? "organization" : "personal",
  );
  const [body, setBody] = useState(initial?.body ?? "");
  const [fieldConfig, setFieldConfig] = useState<TemplateField[]>(initial?.fields ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fields = useMemo(() => syncFields(body, fieldConfig), [body, fieldConfig]);
  const setField = (key: string, patch: Partial<TemplateField>) =>
    setFieldConfig(fields.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  async function save() {
    if (!current || !user) return;
    if (name.trim().length < 2) return setError(t.templates.editor.nameRequired);
    if (!body.trim()) return setError(t.templates.editor.bodyRequired);
    setBusy(true);
    setError(null);
    const row = {
      name: name.trim(),
      description: description.trim() || null,
      category,
      locale: docLocale,
      body,
      fields: fields.map((f) => ({
        ...f,
        label: f.label.trim() || f.key,
        options: f.type === "select" ? (f.options ?? []).filter(Boolean) : undefined,
      })),
    };
    const result = id
      ? await supabase.from("templates").update(row).eq("id", id).select("id").single()
      : await supabase
          .from("templates")
          .insert({ ...row, scope, organization_id: current.id, owner_id: user.id })
          .select("id")
          .single();
    setBusy(false);
    if (result.error) return setError(friendlyError(result.error, t));
    toast.success(t.templates.editor.saved);
    void navigate({
      to: "/app/templates",
      search: {
        tab: (id ? initial?.scope : scope) === "personal" ? "mine" : "organization",
        highlight: result.data.id,
      },
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="tpl-name">{t.templates.editor.name}</Label>
            <Input
              id="tpl-name"
              value={name}
              maxLength={160}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tpl-category">{t.templates.editor.category}</Label>
            <select
              id="tpl-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`${selectClass} h-10`}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {t.templates.categories[c]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tpl-desc">
            {t.templates.editor.description}{" "}
            <span className="font-normal text-muted-foreground">({t.common.optional})</span>
          </Label>
          <Input
            id="tpl-desc"
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {!id && (
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-scope">{t.templates.editor.scope}</Label>
              <select
                id="tpl-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
                className={`${selectClass} h-10`}
              >
                {canOrg && (
                  <option value="organization">{t.templates.editor.scopes.organization}</option>
                )}
                <option value="personal">{t.templates.editor.scopes.personal}</option>
              </select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="tpl-locale">{t.templates.editor.locale}</Label>
            <select
              id="tpl-locale"
              value={docLocale}
              onChange={(e) => setDocLocale(e.target.value as typeof docLocale)}
              className={`${selectClass} h-10`}
            >
              {locales.map((l) => (
                <option key={l} value={l}>
                  {localeNames[l]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tpl-body">{t.templates.editor.body}</Label>
          <Textarea
            id="tpl-body"
            value={body}
            maxLength={60000}
            rows={22}
            onChange={(e) => setBody(e.target.value)}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">{t.templates.editor.bodyHint}</p>
        </div>
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <Button
          className="w-fit bg-brand hover:bg-brand-strong"
          onClick={() => void save()}
          disabled={busy}
        >
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {t.templates.editor.save}
        </Button>
      </div>

      <aside className="grid content-start gap-3">
        <h2 className="font-display text-lg font-semibold">{t.templates.editor.fields}</h2>
        {fields.length === 0 && (
          <p className="text-sm text-muted-foreground">{t.templates.editor.noFields}</p>
        )}
        {fields.map((f) => (
          <fieldset key={f.key} className="grid gap-2 rounded-xl border bg-white p-3 text-sm">
            <legend className="px-1 font-mono text-xs text-brand">{`{{${f.key}}}`}</legend>
            <label className="grid gap-1">
              <span className="font-medium">{t.templates.editor.fieldLabel}</span>
              <Input value={f.label} onChange={(e) => setField(f.key, { label: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="font-medium">{t.templates.editor.fieldType}</span>
                <select
                  value={f.type}
                  onChange={(e) => setField(f.key, { type: e.target.value as FieldType })}
                  className={selectClass}
                >
                  {fieldTypes.map((type) => (
                    <option key={type} value={type}>
                      {t.templates.editor.types[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="font-medium">{t.templates.editor.fieldSource}</span>
                <select
                  value={f.source ?? "sender"}
                  onChange={(e) =>
                    setField(f.key, { source: e.target.value as "sender" | "signer" })
                  }
                  className={selectClass}
                >
                  <option value="sender">{t.templates.editor.sources["sender"]}</option>
                  <option value="signer">{t.templates.editor.sources["signer"]}</option>
                </select>
              </label>
            </div>
            {f.type === "select" && (
              <label className="grid gap-1">
                <span className="font-medium">{t.templates.editor.fieldOptions}</span>
                <Input
                  value={(f.options ?? []).join(", ")}
                  onChange={(e) =>
                    setField(f.key, { options: e.target.value.split(",").map((o) => o.trim()) })
                  }
                />
              </label>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.required ?? false}
                onChange={(e) => setField(f.key, { required: e.target.checked })}
                className="size-4 accent-[var(--color-brand)]"
              />
              {t.templates.editor.fieldRequired}
            </label>
          </fieldset>
        ))}
      </aside>
    </div>
  );
}
