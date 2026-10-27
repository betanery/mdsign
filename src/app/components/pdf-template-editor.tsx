import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, Loader2, Monitor, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { locales, localeNames } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { callFunction, callFunctionBlob } from "../api";
import { useAppConfig, type AuthLevel } from "../app-config";
import { useAuth } from "../auth";
import { errorText, fieldProblems } from "../errors";
import { useAppI18n } from "../i18n";
import { useOrg } from "../org";
import { clearTemplateDraft, saveTemplateDraft } from "../template-draft";
import { selectClass } from "../ui";
import { formatCpf, friendlyError, onlyDigits } from "../validation";
import { FormMessage } from "./auth-layout";
import { PdfDrop, Stepper } from "./pdf-drop";
import { PdfPlacer, type PlacedBox, type PlacerTool } from "./pdf-placer";
import {
  FieldInput,
  fieldSources,
  fieldTypes,
  fillableFields,
  oneSignature,
  type FieldSource,
  type FieldType,
  type MarkType,
  type RelBox,
  type TemplateField,
  type TemplateFlow,
  type TemplateMark,
  type TemplateRole,
  type TemplateRow,
} from "./template-fields";

const categories = ["hr", "commercial", "legal", "health", "finance", "other"] as const;

/** Itens da paleta: variável sugerida + tipo. */
const presets = [
  { id: "name", key: "nome", type: "text" },
  { id: "cpf", key: "cpf", type: "cpf" },
  { id: "cnpj", key: "cnpj", type: "cnpj" },
  { id: "email", key: "email", type: "email" },
  { id: "phone", key: "telefone", type: "phone" },
  { id: "date", key: "data", type: "date" },
  { id: "city", key: "cidade", type: "text" },
  { id: "company", key: "empresa", type: "text" },
  { id: "role", key: "cargo", type: "text" },
  { id: "text", key: "texto", type: "text" },
  { id: "number", key: "numero", type: "number" },
  { id: "checkbox", key: "opcao", type: "checkbox" },
  { id: "custom", key: "campo", type: "text" },
] as const;

const signerAttrs: Partial<Record<string, "name" | "cpf" | "email" | "phone">> = {
  name: "name",
  cpf: "cpf",
  email: "email",
  phone: "phone",
};

const markTypes: MarkType[] = ["signature", "initials", "stamp"];
const KEY = /^[a-zA-Z0-9_]{1,60}$/;

type Upload = {
  path: string;
  url: string;
  pages: { width: number; height: number }[];
  fields?: { name: string; type: "text" | "checkbox" | "select"; options?: string[] }[];
};

const keyFrom = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50) || "campo";

function uniqueKey(base: string, taken: Set<string>) {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/** Editor do modelo a partir de PDF pronto: Documento → Participantes → Campos → Testar. */
export function PdfTemplateEditor({
  initial,
  id,
  initialStep,
}: {
  initial?: Partial<TemplateRow>;
  id?: string;
  /** Rascunho retomado: volta ao passo em que a pessoa estava. */
  initialStep?: number;
}) {
  const { t, locale } = useAppI18n();
  const { user } = useAuth();
  const { current, can } = useOrg();
  const config = useAppConfig();
  const navigate = useNavigate();
  const canOrg = can("templates.manage");
  const [step, setStep] = useState(initialStep ?? (initial?.file_path ? 1 : 0));
  const [upload, setUpload] = useState<Upload | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? "other");
  const [docLocale, setDocLocale] = useState(initial?.locale ?? locale);
  const [scope, setScope] = useState<"organization" | "personal">(
    initial?.scope !== "personal" && canOrg ? "organization" : "personal",
  );
  const [roles, setRoles] = useState<TemplateRole[]>(
    initial?.participants?.length
      ? initial.participants
      : [{ slot: 1, label: "", role: "signer", authLevel: "basic" }],
  );
  const [flow, setFlow] = useState<TemplateFlow>(
    initial?.flow ?? {
      sequential: true,
      reminders: { enabled: true, firstDays: 2, everyDays: 3, max: 3 },
    },
  );
  const [fields, setFields] = useState<TemplateField[]>(initial?.fields ?? []);
  const [marks, setMarks] = useState<TemplateMark[]>(initial?.marks ?? []);
  const [tool, setTool] = useState<PlacerTool | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [testProblems, setTestProblems] = useState<string[]>([]);
  const [testPeople, setTestPeople] = useState<
    Record<string, { name: string; email: string; cpf: string }>
  >({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [wide, setWide] = useState(true);

  const filePath = upload?.path ?? initial?.file_path ?? null;
  const pageCount = upload?.pages.length || initial?.page_count || 0;

  // Modelo novo: guarda o progresso no navegador para não se perder se a página recarregar.
  useEffect(() => {
    if (id || !current || !user || !filePath) return;
    saveTemplateDraft(current.id, user.id, {
      step,
      row: {
        kind: "pdf",
        file_path: filePath,
        page_count: pageCount || null,
        name,
        description,
        category,
        locale: docLocale,
        scope,
        participants: roles,
        flow,
        fields,
        marks,
      },
    });
  }, [
    id,
    current,
    user,
    filePath,
    pageCount,
    step,
    name,
    description,
    category,
    docLocale,
    scope,
    roles,
    flow,
    fields,
    marks,
  ]);
  const roleLabel = (slot: number) =>
    roles.find((r) => r.slot === slot)?.label.trim() ||
    t.pdf.roleDefault.replace("{n}", String(slot));

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // URL assinada para desenhar o PDF já salvo (o bucket é privado).
  useEffect(() => {
    if (upload || !initial?.file_path || !current) return;
    callFunction<{ url: string }>("templates-pdf", {
      action: "view",
      organizationId: current.id,
      ...(id ? { templateId: id } : { path: initial.file_path }),
    })
      .then((r) => setUpload({ path: initial.file_path!, url: r.url, pages: [] }))
      .catch((e) => setError(errorText(t, e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, id, initial?.file_path]);

  async function sendFile(file: File) {
    if (!current) return;
    setBusy("upload");
    setError(null);
    const form = new FormData();
    form.append("organizationId", current.id);
    form.append("file", file);
    try {
      const r = await callFunction<Upload>("templates-pdf", form);
      setUpload(r);
      if (!name) setName(file.name.replace(/\.pdf$/i, ""));
      // Campos de formulário que o PDF já traz viram campos do modelo.
      const taken = new Set<string>();
      setFields(
        (r.fields ?? []).map((f) => {
          const key = uniqueKey(keyFrom(f.name), taken);
          taken.add(key);
          return {
            key,
            label: f.name,
            type: (f.type === "select" ? "select" : f.type) as FieldType,
            required: true,
            source: "manual",
            pdfField: f.name,
            ...(f.options ? { options: f.options } : {}),
          };
        }),
      );
      setMarks([]);
      if (r.fields?.length) toast.success(t.pdf.detected.replace("{n}", String(r.fields.length)));
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(null);
    }
  }

  // ---- caixas: campos (com 1+ posições) e marcas de assinatura por papel ----
  const boxes: PlacedBox[] = useMemo(
    () => [
      ...fields.flatMap((f) =>
        (f.boxes ?? []).map((b, i) => ({
          ...b,
          id: `f:${f.key}:${i}`,
          kind: "field" as const,
          label: `{{${f.key}}}`,
          tone: f.slot ? f.slot : 0,
        })),
      ),
      ...marks.map((m, i) => ({
        ...m,
        id: `m:${i}`,
        kind: "mark" as const,
        label: `${t.pdf.markTypes[m.type]} · ${roleLabel(m.slot)}`,
        tone: m.slot,
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fields, marks, roles, t],
  );

  function applyBoxes(next: PlacedBox[]) {
    const pos = (b: PlacedBox): RelBox => ({ page: b.page, x: b.x, y: b.y, w: b.w, h: b.h });
    setFields((list) =>
      list.map((f) => ({
        ...f,
        boxes: next.filter((b) => b.id.startsWith(`f:${f.key}:`)).map(pos),
      })),
    );
    setMarks((list) =>
      list.flatMap((m, i) => {
        const b = next.find((x) => x.id === `m:${i}`);
        return b ? [{ ...m, ...pos(b) }] : [];
      }),
    );
  }

  function onCreate(box: RelBox, used: PlacerTool) {
    const [kind, a, b] = used.key.split(":");
    if (kind === "mark") {
      const mark: TemplateMark = { ...box, slot: Number(b), type: a as MarkType };
      const list = oneSignature([...marks, mark], mark, sameSlot);
      setMarks(list);
      setSelected(`m:${list.length - 1}`);
      return;
    }
    if (kind === "field") {
      // Nova posição de um campo existente.
      setFields((list) =>
        list.map((f) => (f.key === a ? { ...f, boxes: [...(f.boxes ?? []), box] } : f)),
      );
      const f = fields.find((x) => x.key === a);
      setSelected(`f:${a}:${f?.boxes?.length ?? 0}`);
      return;
    }
    // Campo novo da paleta (ou "Nome do signatário" de um papel).
    const taken = new Set(fields.map((f) => f.key));
    if (kind === "signerName") {
      const slot = Number(a);
      const key = uniqueKey(`nome_${keyFrom(roleLabel(slot))}`, taken);
      setFields((list) => [
        ...list,
        {
          key,
          label: t.pdf.signerName,
          type: "text",
          required: true,
          source: "signer",
          slot,
          slotAttr: "name",
          boxes: [box],
        },
      ]);
      setSelected(`f:${key}:0`);
    } else {
      const preset = presets.find((p) => p.id === a) ?? presets[presets.length - 1]!;
      const key = uniqueKey(preset.key, taken);
      // Nome, CPF, e-mail e celular quase sempre são de quem assina: já nascem ligados ao
      // 1º papel, para não serem pedidos de novo no teste, no envio e na planilha.
      const attr = signerAttrs[preset.id];
      const slot = attr ? roles[0]?.slot : undefined;
      setFields((list) => [
        ...list,
        {
          key,
          label: t.pdf.presets[preset.id] ?? preset.key,
          type: preset.type,
          required: true,
          ...(slot ? { source: "signer", slot, slotAttr: attr } : { source: "manual" }),
          boxes: [box],
        },
      ]);
      setSelected(`f:${key}:0`);
    }
    setTool(null);
  }

  const selectedField = selected?.startsWith("f:")
    ? fields.find((f) => f.key === selected.split(":")[1])
    : undefined;
  const selectedMark = selected?.startsWith("m:") ? marks[Number(selected.slice(2))] : undefined;

  function updateField(key: string, patch: Partial<TemplateField>) {
    setFields((list) => list.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  function renameField(oldKey: string, next: string) {
    if (!KEY.test(next) || fields.some((f) => f.key === next && f.key !== oldKey)) return;
    updateField(oldKey, { key: next });
    if (selected?.startsWith(`f:${oldKey}:`))
      setSelected(selected.replace(`f:${oldKey}:`, `f:${next}:`));
  }

  const sameSlot = (a: TemplateMark, b: TemplateMark) => a.slot === b.slot;

  /** Troca papel ou tipo da marca; uma assinatura nova substitui a anterior da mesma pessoa. */
  function changeMark(target: TemplateMark, patch: Partial<TemplateMark>) {
    const next = { ...target, ...patch };
    const list = oneSignature(
      marks.map((m) => (m === target ? next : m)),
      next,
      sameSlot,
    );
    setMarks(list);
    setSelected(`m:${list.indexOf(next)}`);
  }

  function repeatOnAllPages(i: number) {
    const m = marks[i];
    if (!m || !pageCount) return;
    const others = Array.from({ length: pageCount }, (_, p) => p + 1)
      .filter(
        (p) =>
          p !== m.page &&
          !marks.some((x) => x.slot === m.slot && x.type === m.type && x.page === p),
      )
      .map((page) => ({ ...m, page }));
    setMarks([...marks, ...others]);
  }

  function draft() {
    return {
      kind: "pdf",
      file_path: filePath,
      page_count: pageCount,
      name: name.trim(),
      locale: docLocale,
      body: "",
      fields,
      participants: roles,
      flow,
      marks,
    };
  }

  async function runTest() {
    if (!current) return;
    setBusy("test");
    setError(null);
    setTestProblems([]);
    try {
      const blob = await callFunctionBlob("documents-from-template", {
        organizationId: current.id,
        mode: "test",
        draft: draft(),
        values: testValues,
        roles: Object.fromEntries(
          Object.entries(testPeople).map(([slot, p]) => [slot, { ...p, cpf: onlyDigits(p.cpf) }]),
        ),
      });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      // Diz quais campos estão com formato errado (os vazios não impedem o teste).
      const bad = fieldProblems(e);
      setTestProblems(bad);
      setError(
        bad.length
          ? `${t.pdf.testFix} ${bad.map((k) => fields.find((f) => f.key === k)?.label || k).join(", ")}`
          : errorText(t, e),
      );
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!current || !user || !filePath) return;
    if (name.trim().length < 2) return setError(t.templates.editor.nameRequired);
    setBusy("save");
    setError(null);
    const row = {
      name: name.trim(),
      description: description.trim() || null,
      category,
      locale: docLocale,
      body: "",
      kind: "pdf",
      file_path: filePath,
      page_count: pageCount || null,
      fields: fields.map((f) => ({ ...f, label: f.label.trim() || f.key })),
      participants: roles.map((r) => ({ ...r, label: r.label.trim() || roleLabel(r.slot) })),
      flow,
      marks,
    };
    const result = id
      ? await supabase.from("templates").update(row).eq("id", id).select("id").single()
      : await supabase
          .from("templates")
          .insert({ ...row, scope, organization_id: current.id, owner_id: user.id })
          .select("id")
          .single();
    setBusy(null);
    if (result.error) return setError(friendlyError(result.error, t));
    if (!id) clearTemplateDraft(current.id, user.id);
    toast.success(t.templates.editor.saved);
    // Volta para a aba onde o modelo aparece, com ele em destaque.
    void navigate({
      to: "/app/templates",
      search: {
        tab: (id ? initial?.scope : scope) === "personal" ? "mine" : "organization",
        highlight: result.data.id,
      },
    });
  }

  const missingSignature = roles.filter(
    (r) => r.role !== "approver" && !marks.some((m) => m.slot === r.slot && m.type === "signature"),
  );

  // ---------------- telas ----------------
  return (
    <>
      <Stepper
        steps={t.pdf.steps}
        hints={t.pdf.stepHints}
        current={step}
        onStep={(i) => {
          setError(null);
          setTool(null);
          setStep(i);
        }}
      />
      {step === 0 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-4">
            <PdfDrop
              file={null}
              onFile={(f) => void sendFile(f)}
              onError={(code) => setError(t.errors[code] ?? t.common.genericError)}
            />
            {busy === "upload" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t.pdf.uploading}
              </p>
            )}
            {filePath && (
              <>
                <p className="text-sm font-medium">
                  {(pageCount === 1 ? t.pdf.pagesOne : t.pdf.pages).replace(
                    "{n}",
                    String(pageCount),
                  )}
                </p>
                <div className="grid gap-1.5">
                  <Label htmlFor="pt-name">{t.templates.editor.name}</Label>
                  <Input
                    id="pt-name"
                    value={name}
                    maxLength={160}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="pt-cat">{t.templates.editor.category}</Label>
                    <select
                      id="pt-cat"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className={cn(selectClass, "h-10")}
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {t.templates.categories[c]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pt-locale">{t.templates.editor.locale}</Label>
                    <select
                      id="pt-locale"
                      value={docLocale}
                      onChange={(e) => setDocLocale(e.target.value as typeof docLocale)}
                      className={cn(selectClass, "h-10")}
                    >
                      {locales.map((l) => (
                        <option key={l} value={l}>
                          {localeNames[l]}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!id && (
                    <div className="grid gap-1.5">
                      <Label htmlFor="pt-scope">{t.templates.editor.scope}</Label>
                      <select
                        id="pt-scope"
                        value={scope}
                        onChange={(e) => setScope(e.target.value as typeof scope)}
                        className={cn(selectClass, "h-10")}
                      >
                        {canOrg && (
                          <option value="organization">
                            {t.templates.editor.scopes.organization}
                          </option>
                        )}
                        <option value="personal">{t.templates.editor.scopes.personal}</option>
                      </select>
                    </div>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pt-desc">
                    {t.templates.editor.description}{" "}
                    <span className="font-normal text-muted-foreground">({t.common.optional})</span>
                  </Label>
                  <Input
                    id="pt-desc"
                    value={description}
                    maxLength={500}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          <div className="max-h-[75svh] overflow-y-auto rounded-2xl border bg-muted/30 p-3">
            {upload?.url ? (
              <PdfPlacer
                source={upload.url}
                boxes={[]}
                onChange={() => undefined}
                tool={null}
                onCreate={() => undefined}
                selected={null}
                onSelect={() => undefined}
                maxPages={3}
              />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">{t.pdf.upload}</p>
            )}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid max-w-3xl gap-5">
          <div>
            <h2 className="font-display text-lg font-semibold">{t.pdf.roles}</h2>
            <p className="text-sm text-muted-foreground">{t.pdf.rolesHint}</p>
          </div>
          <ol className="grid gap-3">
            {roles.map((r, i) => (
              <li
                key={r.slot}
                className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-[auto_1fr_auto_auto_auto] sm:items-end"
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                  {flow.sequential ? i + 1 : "•"}
                </span>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">{t.pdf.roleLabel}</span>
                  <Input
                    value={r.label}
                    placeholder={t.pdf.roleDefault.replace("{n}", String(r.slot))}
                    maxLength={60}
                    onChange={(e) =>
                      setRoles(
                        roles.map((x) => (x.slot === r.slot ? { ...x, label: e.target.value } : x)),
                      )
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">{t.participants.role}</span>
                  <select
                    value={r.role}
                    onChange={(e) =>
                      setRoles(
                        roles.map((x) =>
                          x.slot === r.slot
                            ? { ...x, role: e.target.value as TemplateRole["role"] }
                            : x,
                        ),
                      )
                    }
                    className={selectClass}
                  >
                    <option value="signer">{t.participants.roles.signer}</option>
                    <option value="approver">{t.participants.roles.approver}</option>
                    <option value="witness">{t.participants.roles.witness}</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">{t.participants.authLevel}</span>
                  <select
                    value={r.authLevel}
                    disabled={r.role === "approver"}
                    onChange={(e) =>
                      setRoles(
                        roles.map((x) =>
                          x.slot === r.slot ? { ...x, authLevel: e.target.value as AuthLevel } : x,
                        ),
                      )
                    }
                    className={selectClass}
                  >
                    {config.authLevels.map((l) => (
                      <option key={l} value={l}>
                        {t.participants.levels[l]}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={roles.length === 1}
                  aria-label={`${t.common.remove} ${roleLabel(r.slot)}`}
                  onClick={() => {
                    setRoles(roles.filter((x) => x.slot !== r.slot));
                    setMarks(marks.filter((m) => m.slot !== r.slot));
                    setFields(fields.filter((f) => f.slot !== r.slot));
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ol>
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={roles.length >= 10}
            onClick={() => {
              const slot = Math.max(...roles.map((r) => r.slot)) + 1;
              setRoles([...roles, { slot, label: "", role: "signer", authLevel: "basic" }]);
            }}
          >
            <Plus aria-hidden />
            {t.pdf.addRole}
          </Button>
          <label className="flex items-start gap-3 rounded-xl border bg-white p-4">
            <Switch
              checked={flow.sequential ?? true}
              onCheckedChange={(sequential) => setFlow({ ...flow, sequential })}
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium">{t.participants.sequential}</span>
              <span className="text-sm text-muted-foreground">
                {(flow.sequential ?? true)
                  ? t.participants.sequentialHint
                  : t.participants.parallelHint}
              </span>
            </span>
          </label>
          <div className="grid gap-1.5">
            <Label htmlFor="pt-msg">
              {t.sendOptions.message}{" "}
              <span className="font-normal text-muted-foreground">({t.common.optional})</span>
            </Label>
            <Textarea
              id="pt-msg"
              rows={2}
              maxLength={2000}
              value={flow.message ?? ""}
              onChange={(e) => setFlow({ ...flow, message: e.target.value })}
            />
          </div>
          <label className="flex items-start gap-3 rounded-xl border bg-white p-4">
            <Switch
              checked={flow.reminders?.enabled ?? true}
              onCheckedChange={(enabled) =>
                setFlow({
                  ...flow,
                  reminders: { firstDays: 2, everyDays: 3, max: 3, ...flow.reminders, enabled },
                })
              }
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium">{t.sendOptions.reminders}</span>
              <span className="text-sm text-muted-foreground">{t.sendOptions.remindersHint}</span>
            </span>
          </label>
        </div>
      )}

      {step === 2 && !wide && (
        <p className="flex items-start gap-2 rounded-xl border bg-white p-4 text-sm">
          <Monitor className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          {t.pdf.smallScreen}
        </p>
      )}
      {step === 2 && wide && (
        <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_17rem]">
          <aside className="grid content-start gap-4 text-sm">
            <div>
              <h2 className="font-display font-semibold">{t.pdf.palette}</h2>
              <p className="text-xs text-muted-foreground">{t.pdf.paletteHint}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => {
                const key = `new:${p.id}`;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setTool(
                        tool?.key === key
                          ? null
                          : { key, kind: "field", label: t.pdf.presets[p.id] ?? p.key },
                      )
                    }
                    aria-pressed={tool?.key === key}
                    className={cn(
                      "rounded-md border bg-white px-2 py-1 text-xs hover:border-brand",
                      tool?.key === key && "border-brand bg-brand-soft font-semibold",
                    )}
                  >
                    {t.pdf.presets[p.id]}
                  </button>
                );
              })}
            </div>
            {roles.map((r) => (
              <div key={r.slot} className="grid gap-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  {roleLabel(r.slot)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(r.role !== "approver" ? markTypes : []).map((type) => {
                    const key = `mark:${type}:${r.slot}`;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() =>
                          setTool(
                            tool?.key === key
                              ? null
                              : {
                                  key,
                                  kind: "mark",
                                  label: `${t.pdf.markTypes[type]} · ${roleLabel(r.slot)}`,
                                  tone: r.slot,
                                },
                          )
                        }
                        aria-pressed={tool?.key === key}
                        className={cn(
                          "rounded-md border border-dashed bg-white px-2 py-1 text-xs hover:border-brand",
                          tool?.key === key && "border-brand bg-brand-soft font-semibold",
                        )}
                      >
                        {t.pdf.markTypes[type]}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      const key = `signerName:${r.slot}`;
                      setTool(
                        tool?.key === key
                          ? null
                          : { key, kind: "field", label: t.pdf.signerName, tone: r.slot },
                      );
                    }}
                    aria-pressed={tool?.key === `signerName:${r.slot}`}
                    className={cn(
                      "rounded-md border bg-white px-2 py-1 text-xs hover:border-brand",
                      tool?.key === `signerName:${r.slot}` &&
                        "border-brand bg-brand-soft font-semibold",
                    )}
                  >
                    {t.pdf.signerName}
                  </button>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">{t.pdf.stampHint}</p>
            {fields.some((f) => f.pdfField || !(f.boxes ?? []).length) && (
              <div className="grid gap-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  {t.pdf.formFields}
                </p>
                {fields
                  .filter((f) => f.pdfField || !(f.boxes ?? []).length)
                  .map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setSelected(`f:${f.key}:x`)}
                      className="truncate rounded px-1 py-0.5 text-left text-xs hover:bg-brand-soft"
                    >
                      {`{{${f.key}}}`}
                    </button>
                  ))}
              </div>
            )}
          </aside>

          <div className="max-h-[78svh] overflow-y-auto rounded-2xl border bg-muted/30 p-3">
            {tool && (
              <p className="sticky top-0 z-10 mb-2 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white">
                {t.pdf.drawHint.replace("{item}", tool.label)}
              </p>
            )}
            <PdfPlacer
              source={upload?.url ?? null}
              boxes={boxes}
              onChange={applyBoxes}
              tool={tool}
              onCreate={onCreate}
              selected={selected}
              onSelect={setSelected}
            />
          </div>

          <aside className="grid content-start gap-3 text-sm">
            <h2 className="font-display font-semibold">{t.pdf.properties}</h2>
            {!selectedField && !selectedMark && (
              <p className="text-muted-foreground">{t.pdf.nothingSelected}</p>
            )}
            {selectedField && (
              <FieldProperties
                field={selectedField}
                roles={roles}
                roleLabel={roleLabel}
                onRename={(k) => renameField(selectedField.key, k)}
                onChange={(patch) => updateField(selectedField.key, patch)}
                onAddPosition={() =>
                  setTool({
                    key: `field:${selectedField.key}`,
                    kind: "field",
                    label: `{{${selectedField.key}}}`,
                    tone: selectedField.slot ?? 0,
                  })
                }
                onRemove={() => {
                  setFields(fields.filter((f) => f.key !== selectedField.key));
                  setSelected(null);
                }}
              />
            )}
            {selectedMark && (
              <div className="grid gap-3 rounded-xl border bg-white p-3">
                <label className="grid gap-1">
                  <span className="font-medium">{t.pdf.roleOf}</span>
                  <select
                    value={selectedMark.slot}
                    onChange={(e) => changeMark(selectedMark, { slot: Number(e.target.value) })}
                    className={selectClass}
                  >
                    {roles
                      .filter((r) => r.role !== "approver")
                      .map((r) => (
                        <option key={r.slot} value={r.slot}>
                          {roleLabel(r.slot)}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="font-medium">{t.templates.editor.fieldType}</span>
                  <select
                    value={selectedMark.type}
                    onChange={(e) => changeMark(selectedMark, { type: e.target.value as MarkType })}
                    className={selectClass}
                  >
                    {markTypes.map((type) => (
                      <option key={type} value={type}>
                        {t.pdf.markTypes[type]}
                      </option>
                    ))}
                  </select>
                </label>
                {pageCount > 1 && selectedMark.type !== "signature" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => repeatOnAllPages(marks.indexOf(selectedMark))}
                  >
                    {t.pdf.allPages}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setMarks(marks.filter((m) => m !== selectedMark));
                    setSelected(null);
                  }}
                >
                  <Trash2 aria-hidden />
                  {t.pdf.removeItem}
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t.marks.oneSignature}</p>
            {missingSignature.map((r) => (
              <p
                key={r.slot}
                className="rounded-md bg-orange-50 px-2 py-1.5 text-xs text-orange-800"
              >
                {t.pdf.noSignatureWarn.replace("{role}", roleLabel(r.slot))}
              </p>
            ))}
          </aside>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="grid content-start gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold">{t.pdf.testTitle}</h2>
              <p className="text-sm text-muted-foreground">{t.pdf.testHint}</p>
            </div>
            {roles.map((r) => {
              const person = testPeople[String(r.slot)] ?? { name: "", email: "", cpf: "" };
              const set = (patch: Partial<typeof person>) =>
                setTestPeople({ ...testPeople, [String(r.slot)]: { ...person, ...patch } });
              return (
                <fieldset
                  key={r.slot}
                  className={cn(
                    "grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-3",
                    fields.some((f) => f.slot === r.slot && testProblems.includes(f.key)) &&
                      "border-destructive",
                  )}
                >
                  <legend className="px-1 text-sm font-semibold">{roleLabel(r.slot)}</legend>
                  <Input
                    aria-label={t.participants.name}
                    placeholder={t.participants.name}
                    value={person.name}
                    onChange={(e) => set({ name: e.target.value })}
                  />
                  <Input
                    aria-label={t.participants.email}
                    placeholder={t.participants.email}
                    value={person.email}
                    onChange={(e) => set({ email: e.target.value })}
                  />
                  <Input
                    aria-label={t.participants.cpf}
                    placeholder={t.participants.cpf}
                    value={person.cpf}
                    onChange={(e) => set({ cpf: formatCpf(e.target.value) })}
                  />
                </fieldset>
              );
            })}
            {fillableFields(fields).map((f) => (
              <FieldInput
                key={f.key}
                field={{ ...f, required: false }}
                value={testValues[f.key] ?? ""}
                onChange={(v) => setTestValues({ ...testValues, [f.key]: v })}
                invalid={testProblems.includes(f.key)}
                t={t}
                idPrefix="test"
              />
            ))}
            <Button
              variant="outline"
              className="w-fit"
              onClick={() => void runTest()}
              disabled={busy !== null}
            >
              {busy === "test" ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Eye aria-hidden />
              )}
              {t.pdf.testRun}
            </Button>
          </div>
          <div className="min-h-[60svh] overflow-hidden rounded-2xl border bg-white shadow-sm">
            {previewUrl ? (
              <iframe
                src={previewUrl}
                title={t.pdf.testTitle}
                className="h-[75svh] w-full border-0"
              />
            ) : (
              <p className="p-6 text-sm text-muted-foreground">{t.pdf.testHint}</p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <FormMessage kind="error">{error}</FormMessage>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)} disabled={busy !== null}>
            {t.send.back}
          </Button>
        )}
        {step < 3 && (
          <Button
            className="bg-brand hover:bg-brand-strong"
            disabled={!filePath || busy !== null}
            onClick={() => {
              setError(null);
              if (step === 0 && name.trim().length < 2)
                return setError(t.templates.editor.nameRequired);
              setTool(null);
              setStep(step + 1);
            }}
          >
            {t.send.next}
          </Button>
        )}
        {step >= 2 && (
          <Button
            className={step === 3 ? "bg-brand hover:bg-brand-strong" : ""}
            variant={step === 3 ? "default" : "outline"}
            onClick={() => void save()}
            disabled={busy !== null}
          >
            {busy === "save" && <Loader2 className="animate-spin" aria-hidden />}
            {t.templates.editor.save}
          </Button>
        )}
      </div>
    </>
  );
}

function FieldProperties({
  field,
  roles,
  roleLabel,
  onRename,
  onChange,
  onAddPosition,
  onRemove,
}: {
  field: TemplateField;
  roles: TemplateRole[];
  roleLabel: (slot: number) => string;
  onRename: (key: string) => void;
  onChange: (patch: Partial<TemplateField>) => void;
  onAddPosition: () => void;
  onRemove: () => void;
}) {
  const { t } = useAppI18n();
  const [key, setKey] = useState(field.key);
  useEffect(() => setKey(field.key), [field.key]);
  const keyOk = KEY.test(key);
  return (
    <div className="grid gap-3 rounded-xl border bg-white p-3">
      <label className="grid gap-1">
        <span className="font-medium">{t.pdf.variable}</span>
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onBlur={() => onRename(key)}
          aria-invalid={!keyOk}
          className="font-mono"
        />
        {!keyOk && <span className="text-xs text-destructive">{t.pdf.variableInvalid}</span>}
      </label>
      <label className="grid gap-1">
        <span className="font-medium">{t.templates.editor.fieldLabel}</span>
        <Input value={field.label} onChange={(e) => onChange({ label: e.target.value })} />
      </label>
      <label className="grid gap-1">
        <span className="font-medium">{t.templates.editor.fieldType}</span>
        <select
          value={field.type}
          onChange={(e) => onChange({ type: e.target.value as FieldType })}
          className={selectClass}
        >
          {fieldTypes.map((type) => (
            <option key={type} value={type}>
              {t.templates.editor.types[type]}
            </option>
          ))}
        </select>
      </label>
      {field.type === "select" && (
        <label className="grid gap-1">
          <span className="font-medium">{t.templates.editor.fieldOptions}</span>
          <Input
            value={(field.options ?? []).join(", ")}
            onChange={(e) => onChange({ options: e.target.value.split(",").map((o) => o.trim()) })}
          />
        </label>
      )}
      <label className="grid gap-1">
        <span className="font-medium">{t.pdf.source}</span>
        <select
          value={field.source ?? "manual"}
          onChange={(e) => onChange({ source: e.target.value as FieldSource })}
          className={selectClass}
        >
          {fieldSources.map((s) => (
            <option key={s} value={s}>
              {t.pdf.sources[s]}
            </option>
          ))}
        </select>
      </label>
      {field.source === "signer" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="font-medium">{t.pdf.roleOf}</span>
            <select
              value={field.slot ?? ""}
              onChange={(e) =>
                onChange(
                  e.target.value
                    ? { slot: Number(e.target.value) }
                    : { slot: undefined, slotAttr: undefined },
                )
              }
              className={selectClass}
            >
              <option value="">—</option>
              {roles.map((r) => (
                <option key={r.slot} value={r.slot}>
                  {roleLabel(r.slot)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="font-medium">{t.pdf.fillWith}</span>
            <select
              value={field.slotAttr ?? ""}
              disabled={!field.slot}
              onChange={(e) =>
                onChange({ slotAttr: (e.target.value || undefined) as TemplateField["slotAttr"] })
              }
              className={selectClass}
            >
              <option value="">{t.pdf.fillWithNone}</option>
              {(["name", "email", "cpf", "phone"] as const).map((a) => (
                <option key={a} value={a}>
                  {t.pdf.attrs[a]}
                </option>
              ))}
            </select>
          </label>
          {field.slot && field.slotAttr && (
            <p className="col-span-2 text-xs text-muted-foreground">
              {t.pdf.linkedHint.replace("{role}", roleLabel(field.slot))}
            </p>
          )}
        </div>
      )}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={field.required ?? false}
          onChange={(e) => onChange({ required: e.target.checked })}
          className="size-4 accent-[var(--color-brand)]"
        />
        {t.templates.editor.fieldRequired}
      </label>
      {field.pdfField && (
        <p className="text-xs text-muted-foreground">
          {t.pdf.formField.replace("{name}", field.pdfField)}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {t.pdf.positions.replace("{n}", String(field.boxes?.length ?? 0))}
      </p>
      <Button size="sm" variant="outline" onClick={onAddPosition}>
        <Plus aria-hidden />
        {t.pdf.addPosition}
      </Button>
      <Button size="sm" variant="ghost" onClick={onRemove}>
        <Trash2 aria-hidden />
        {t.pdf.removeItem}
      </Button>
    </div>
  );
}
