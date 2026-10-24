import { useEffect, useMemo, useRef, useState } from "react";
import { FeatureGate } from "@/app/components/feature-preview";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Download,
  Eye,
  FileSpreadsheet,
  Files,
  LayoutTemplate,
  Loader2,
  Send,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { ApiError, callFunction, callFunctionBlob } from "@/app/api";
import { useAppConfig, type AuthLevel } from "@/app/app-config";
import { PageHeader } from "@/app/components/app-shell";
import { FormMessage } from "@/app/components/auth-layout";
import { useConfirm } from "@/app/components/confirm-dialog";
import {
  newParticipant,
  ParticipantsEditor,
  toPayload,
  validateParticipants,
  type ParticipantDraft,
} from "@/app/components/participants-editor";
import { MarksEditor, type MarksByPerson } from "@/app/components/marks-editor";
import { Stepper } from "@/app/components/pdf-drop";
import { SplitWizard, type SplitPreset } from "@/app/components/split-wizard";
import {
  defaultSendOptions,
  SendOptions,
  sendOptionsPayload,
  type SendOptionsValue,
} from "@/app/components/send-options";
import {
  fillableFields,
  normalizeValue,
  templateSelect,
  validateValues,
  type TemplateField,
  type TemplateRow,
} from "@/app/components/template-fields";
import { errorText } from "@/app/errors";
import { useLeaveGuard } from "@/app/leave-guard";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import {
  downloadCsv,
  excelSerialToIso,
  normalizeHeader,
  readSheet,
  toCsv,
  type Sheet,
} from "@/app/sheet";
import { selectClass } from "@/app/ui";
import { onlyDigits } from "@/app/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// Envio em massa (PRD §17–§19): Modelo → Planilha → Colunas → Conferência → Envio.
type Search = {
  mode?: "template" | "pdf" | undefined;
  preset?: "payslips" | undefined;
  process?: string | undefined;
};

export const Route = createFileRoute("/app/_shell/bulk/new")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    mode: search["mode"] === "pdf" || search["mode"] === "template" ? search["mode"] : undefined,
    preset: search["preset"] === "payslips" ? "payslips" : undefined,
    process: typeof search["process"] === "string" ? search["process"] : undefined,
  }),
  // Recurso do plano: fora dele, a prévia de upgrade no lugar da tela (o backend recusa).
  component: () => (
    <FeatureGate code="bulk_send">
      <NewBulk />
    </FeatureGate>
  ),
});

type ProcessConfig = {
  source?: "pdf" | "template";
  templateId?: string | null;
  split?: { rule?: SplitPreset["split"]; identify?: SplitPreset["identify"] };
  options?: SplitPreset["options"] & { rolePeople?: unknown };
};

/** "Como estão seus documentos?": modelo + planilha ou PDF com vários documentos. */
function NewBulk() {
  const { t } = useAppI18n();
  const { can } = useOrg();
  const { mode, preset, process } = Route.useSearch();
  const [loaded, setLoaded] = useState<{ name: string; config: ProcessConfig } | null>(null);
  const [loadError, setLoadError] = useState(false);

  // "Fazer de novo": abre o assistente com a configuração do Processo.
  useEffect(() => {
    if (!process) return;
    supabase
      .from("processes")
      .select("name, config")
      .eq("id", process)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return setLoadError(true);
        setLoaded({ name: data.name as string, config: (data.config ?? {}) as ProcessConfig });
        void supabase
          .from("processes")
          .update({ last_run_at: new Date().toISOString() })
          .eq("id", process);
      });
  }, [process]);

  if (!can("bulk.send")) return <p>{t.common.forbidden}</p>;
  if (process && !loaded)
    return loadError ? <p>{t.common.forbidden}</p> : <p>{t.common.loading}</p>;

  const fromProcess = loaded?.config;
  const kind = fromProcess
    ? fromProcess.source === "pdf"
      ? "pdf"
      : "template"
    : preset
      ? "pdf"
      : mode;

  if (kind === "pdf") {
    const payslips: SplitPreset = {
      split: { mode: "content" },
      identify: { matricula: true },
      options: { docName: t.split.payslipsName },
    };
    const presetConfig: SplitPreset | undefined = fromProcess
      ? {
          ...(fromProcess.split?.rule ? { split: fromProcess.split.rule } : {}),
          ...(fromProcess.split?.identify ? { identify: fromProcess.split.identify } : {}),
          ...(fromProcess.options ? { options: fromProcess.options } : {}),
        }
      : preset === "payslips"
        ? payslips
        : undefined;
    return (
      <>
        <PageHeader title={loaded?.name ?? t.bulk.new} subtitle={t.split.fromPdfText} />
        <SplitWizard preset={presetConfig} />
      </>
    );
  }
  if (kind === "template")
    return (
      <TemplateBulk
        initialTemplateId={fromProcess?.templateId ?? undefined}
        initialOptions={fromProcess?.options}
      />
    );

  // A pergunta que decide o caminho: o PDF já traz os dados de cada pessoa ou é um modelo em branco?
  const card = (
    search: { mode: "template" | "pdf" } | { preset: "payslips" },
    Icon: typeof Files,
    title: string,
    text: string,
  ) => (
    <li key={title}>
      <Link
        to="/app/bulk/new"
        search={search}
        className="flex h-full flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm transition-colors hover:border-brand"
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft">
          <Icon className="size-5 text-brand" aria-hidden />
        </span>
        <span className="font-display text-base font-semibold">{title}</span>
        <span className="text-sm text-muted-foreground">{text}</span>
      </Link>
    </li>
  );

  return (
    <>
      <PageHeader title={t.bulk.new} subtitle={t.split.filledQuestion} />
      <div className="grid max-w-4xl gap-8">
        <section className="grid gap-3" aria-labelledby="bulk-blank">
          <div>
            <h2 id="bulk-blank" className="font-display text-lg font-semibold">
              {t.split.blankTitle}
            </h2>
            <p className="text-sm text-muted-foreground">{t.split.blankHint}</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {card(
              { mode: "template" },
              LayoutTemplate,
              t.split.fromTemplate,
              t.split.fromTemplateText,
            )}
          </ul>
          <Link
            to="/app/templates/new"
            search={{ kind: "pdf" }}
            className="w-fit text-sm font-semibold text-brand hover:underline"
          >
            {t.split.createFromPdf} →
          </Link>
        </section>
        <section className="grid gap-3" aria-labelledby="bulk-filled">
          <div>
            <h2 id="bulk-filled" className="font-display text-lg font-semibold">
              {t.split.filledTitle}
            </h2>
            <p className="text-sm text-muted-foreground">{t.split.filledHint}</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {card({ mode: "pdf" }, Files, t.split.fromPdf, t.split.fromPdfText)}
            {card({ preset: "payslips" }, Wallet, t.split.payslips, t.split.payslipsText)}
          </ul>
        </section>
      </div>
    </>
  );
}

type Signer = "name" | "email" | "cpf" | "phone";
type Mapping = {
  signer: Record<Signer, number>;
  fields: Record<string, { col: number; fixed: string }>;
};
type Row = {
  key: number;
  name: string;
  email: string;
  cpf: string;
  phone: string;
  values: Record<string, string>;
};

const signerAliases: Record<Signer, string[]> = {
  name: ["nome", "name", "nomecompleto", "participante", "signatario", "nombre"],
  email: ["email", "mail", "correo", "correoelectronico"],
  cpf: ["cpf", "documento"],
  phone: ["celular", "telefone", "phone", "whatsapp", "telefono", "movil"],
};

function autoMap(sheet: Sheet, fields: TemplateField[]): Mapping {
  const heads = sheet.headers.map(normalizeHeader);
  const find = (names: string[]) => heads.findIndex((h) => names.includes(h));
  const signer = Object.fromEntries(
    (Object.keys(signerAliases) as Signer[]).map((k) => [k, find(signerAliases[k])]),
  ) as Record<Signer, number>;
  const fieldMap: Mapping["fields"] = {};
  for (const f of fields)
    fieldMap[f.key] = {
      col: find([normalizeHeader(f.key), normalizeHeader(f.label)]),
      fixed: "",
    };
  return { signer, fields: fieldMap };
}

function TemplateBulk({
  initialTemplateId,
  initialOptions,
}: {
  initialTemplateId?: string | undefined;
  initialOptions?: ProcessConfig["options"] | undefined;
}) {
  const { t, f, locale } = useAppI18n();
  const [confirm, confirmDialog] = useConfirm();
  const { current } = useOrg();
  const config = useAppConfig();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [tpl, setTpl] = useState<TemplateRow | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [onlyIssues, setOnlyIssues] = useState(true);
  const [authLevel, setAuthLevel] = useState<AuthLevel>(initialOptions?.authLevel ?? "basic");
  const [options, setOptions] = useState<SendOptionsValue>(() => ({
    ...defaultSendOptions(locale),
    ...(initialOptions?.message ? { message: initialOptions.message } : {}),
    ...(initialOptions?.reminders ? { reminders: initialOptions.reminders } : {}),
  }));
  const [jobName, setJobName] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  // Dados com que o lote de teste foi criado (para saber se a pessoa voltou e editou).
  const [jobSig, setJobSig] = useState("");
  // Planilha + mapeamento usados para montar a conferência (não refaz se nada mudou).
  const [builtFrom, setBuiltFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Ao iniciar, o envio segue sozinho: o aviso de saída vale só enquanto se prepara.
  useLeaveGuard(Boolean(sheet) && busy !== "start");
  const [sampleRow, setSampleRow] = useState(0);
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!current) return;
    supabase
      .from("templates")
      .select(templateSelect)
      .or(`scope.eq.mdsign,organization_id.eq.${current.id}`)
      .order("name")
      .then(({ data }) => {
        const list = (data as TemplateRow[] | null) ?? [];
        setTemplates(list);
        const initial = list.find((x) => x.id === initialTemplateId);
        if (initial) setTpl(initial);
      });
  }, [current]);

  const fields = useMemo(() => fillableFields(tpl?.fields ?? []), [tpl]);
  // Modelo com papéis: cada linha ocupa o 1º papel; os demais são pessoas fixas do lote.
  const roles = useMemo(
    () => [...(tpl?.participants ?? [])].sort((a, b) => a.slot - b.slot),
    [tpl],
  );
  const otherRoles = roles.slice(1);
  const [people, setPeople] = useState<ParticipantDraft[]>([]);
  // Posição da assinatura de cada destinatário (modelos sem posições definidas).
  const [marks, setMarks] = useState<MarksByPerson>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [peopleProblems, setPeopleProblems] = useState<Record<number, string[]>>({});
  useEffect(() => {
    setPeople(
      otherRoles.map((r) => ({ ...newParticipant(), role: r.role, authLevel: r.authLevel })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl]);

  // Problemas de cada linha: participante + campos do modelo.
  const problems = useMemo(() => {
    const drafts = rows.map((r) => ({
      ...newParticipant(),
      name: r.name,
      email: r.email,
      cpf: r.cpf,
      noCpf: !onlyDigits(r.cpf) && config.foreignSigners,
      phone: r.phone,
      authLevel,
    }));
    const p = validateParticipants(drafts, config);
    return rows.map((r, i) => [
      ...(p[i] ?? []),
      ...validateValues(fields, r.values).map((k) => `values.${k}`),
    ]);
  }, [rows, fields, config, authLevel]);
  const issues = problems.filter((p) => p.length).length;

  async function pickFile(file: File | undefined) {
    if (!file || !tpl) return;
    setError(null);
    try {
      const parsed = await readSheet(file);
      if (parsed.rows.length === 0) return setError(t.errors["bulk_empty"]!);
      if (parsed.rows.length > 1000) return setError(t.errors["bulk_too_many"]!);
      setSheet(parsed);
      setFileName(file.name);
      setMapping(autoMap(parsed, fields));
    } catch {
      setError(t.errors["sheet_unreadable"]!);
    }
  }

  function buildRows() {
    if (!sheet || !mapping) return;
    const cell = (r: string[], col: number) => (col >= 0 ? (r[col] ?? "").trim() : "");
    setRows(
      sheet.rows.map((r, i) => ({
        key: i + 1,
        name: cell(r, mapping.signer.name),
        email: cell(r, mapping.signer.email).toLowerCase(),
        cpf: onlyDigits(cell(r, mapping.signer.cpf)),
        phone: cell(r, mapping.signer.phone),
        values: Object.fromEntries(
          fields.map((fl) => {
            const m = mapping.fields[fl.key];
            let raw = m && m.col >= 0 ? cell(r, m.col) : (m?.fixed ?? "");
            if (fl.type === "date") raw = excelSerialToIso(raw) ?? raw;
            return [fl.key, normalizeValue(fl, raw)];
          }),
        ),
      })),
    );
  }

  function sample() {
    if (!tpl) return;
    downloadCsv(
      "mdsign-envio-em-massa.csv",
      toCsv(["nome", "email", "cpf", "celular", ...fields.map((fl) => fl.key)], []),
    );
  }

  function downloadIssues() {
    downloadCsv(
      "mdsign-pendencias.csv",
      toCsv(
        [
          t.bulk.row,
          "nome",
          "email",
          "cpf",
          "celular",
          ...fields.map((fl) => fl.key),
          t.bulk.error,
        ],
        rows
          .map((r, i) => ({ r, p: problems[i]! }))
          .filter(({ p }) => p.length)
          .map(({ r, p }) => [
            String(r.key),
            r.name,
            r.email,
            r.cpf,
            r.phone,
            ...fields.map((fl) => r.values[fl.key] ?? ""),
            p.map((x) => x.replace("values.", "")).join(", "),
          ]),
      ),
    );
  }

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Amostra: o documento de uma linha, preenchido como será enviado (nada é criado nem consumido).
  async function showSample() {
    const r = rows[sampleRow];
    if (!current || !tpl || !r) return;
    setBusy("sample");
    setError(null);
    try {
      const signer = {
        name: r.name,
        email: r.email,
        cpf: onlyDigits(r.cpf) || null,
        phone: r.phone || null,
      };
      const blob = await callFunctionBlob("documents-from-template", {
        organizationId: current.id,
        templateId: tpl.id,
        mode: "preview",
        values: r.values,
        ...(roles.length
          ? {
              roles: {
                [String(roles[0]!.slot)]: signer,
                ...Object.fromEntries(
                  toPayload(people).map((p, i) => [String(otherRoles[i]!.slot), p]),
                ),
              },
            }
          : {}),
      });
      if (sampleUrl) URL.revokeObjectURL(sampleUrl);
      setSampleUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(null);
    }
  }

  async function ensureJob(): Promise<string | null> {
    if (!current || !tpl) return null;
    const pp = validateParticipants(people, config);
    setPeopleProblems(pp);
    if (Object.keys(pp).length) {
      setError(t.errors["invalid_participants"]!);
      return null;
    }
    const payload = {
      action: "create",
      organizationId: current.id,
      templateId: tpl.id,
      name: jobName.trim() || `${tpl.name} — ${fileName}`,
      mapping,
      options: {
        ...sendOptionsPayload(options),
        authLevel,
        marks: (marks["row"] ?? []).map(({ type, x, y, w, h, page }) => ({
          type,
          x,
          y,
          w,
          h,
          pageRef: page === 1 ? "first" : "last",
        })),
        rolePeople: Object.fromEntries(
          toPayload(people).map((p, i) => [String(otherRoles[i]!.slot), p]),
        ),
      },
      rows: rows.map((r) => ({
        name: r.name,
        email: r.email,
        cpf: onlyDigits(r.cpf) || null,
        noCpf: !onlyDigits(r.cpf) && config.foreignSigners,
        phone: r.phone || null,
        values: r.values,
      })),
    };
    // Nada mudou desde o teste: usa o mesmo lote. Mudou algo (voltou e editou): descarta o
    // rascunho anterior e cria outro com os dados atuais.
    const sig = JSON.stringify(payload);
    if (jobId && sig === jobSig) return jobId;
    if (jobId) await callFunction("bulk-jobs", { action: "cancel", jobId }).catch(() => undefined);
    try {
      const r = await callFunction<{ jobId: string }>("bulk-jobs", payload);
      setJobSig(sig);
      setJobId(r.jobId);
      return r.jobId;
    } catch (e) {
      setError(errorText(t, e));
      if (e instanceof ApiError && e.code === "invalid_rows") setStep(3);
      return null;
    }
  }

  async function sendTest() {
    const ok = await confirm({
      title: t.bulk.testConfirmTitle,
      text: t.bulk.testConfirmText,
      action: t.bulk.test,
    });
    if (!ok) return;
    setBusy("test");
    setError(null);
    const id = await ensureJob();
    if (id)
      try {
        await callFunction("bulk-jobs", { action: "test", jobId: id });
        toast.success(t.bulk.testSent);
      } catch (e) {
        setError(errorText(t, e));
      }
    setBusy(null);
  }

  async function start() {
    const ok = await confirm({
      title: t.bulk.confirmTitle,
      text: f(t.bulk.confirmText, { n: String(rows.length) }),
      action: t.bulk.confirm,
    });
    if (!ok) return;
    setBusy("start");
    setError(null);
    const id = await ensureJob();
    if (id)
      try {
        await callFunction("bulk-jobs", { action: "start", jobId: id });
        void navigate({ to: "/app/bulk/$id", params: { id } });
        return;
      } catch (e) {
        setError(errorText(t, e));
      }
    setBusy(null);
  }

  function next() {
    setError(null);
    if (step === 0 && !tpl) return setError(t.bulk.chooseTemplate);
    if (step === 1 && !sheet) return setError(t.bulk.upload);
    if (step === 2) {
      const sig = JSON.stringify([tpl?.id, fileName, sheet?.rows.length, mapping]);
      if (sig !== builtFrom) {
        buildRows();
        setBuiltFrom(sig);
      }
    }
    if (step === 3) {
      if (rows.length === 0) return setError(t.errors["bulk_empty"]!);
      if (issues) return setError(t.errors["invalid_rows"]!);
      if (!jobName) setJobName(`${tpl?.name ?? ""} — ${fileName}`.slice(0, 160));
    }
    setStep((s) => s + 1);
  }

  if (!current) return <p>{t.notFoundOrg}</p>;

  const columnSelect = (value: number, onChange: (v: number) => void, id: string) => (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn(selectClass, "h-10 w-full")}
    >
      <option value={-1}>{t.bulk.ignore}</option>
      {sheet?.headers.map((h, i) => (
        <option key={`${h}-${i}`} value={i}>
          {h}
        </option>
      ))}
    </select>
  );
  const visible = rows
    .map((r, i) => ({ r, p: problems[i]! }))
    .filter(({ p }) => !onlyIssues || p.length)
    .slice(0, 200);

  return (
    <>
      {confirmDialog}
      <PageHeader title={t.bulk.new} subtitle={t.bulk.subtitle} />
      <Stepper
        steps={t.bulk.steps}
        hints={t.bulk.stepHints}
        current={step}
        onStep={(i) => {
          setError(null);
          setStep(i);
        }}
      />
      <div className="grid gap-5">
        {step === 0 && (
          <fieldset className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <legend className="mb-2 font-display text-lg font-semibold">
              {t.bulk.chooseTemplate}
            </legend>
            {templates.map((x) => (
              <label
                key={x.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4",
                  tpl?.id === x.id && "border-brand bg-brand-soft",
                )}
              >
                <input
                  type="radio"
                  name="template"
                  checked={tpl?.id === x.id}
                  onChange={() => {
                    setTpl(x);
                    setSheet(null);
                    setMapping(null);
                  }}
                  className="mt-1 accent-[var(--color-brand)]"
                />
                <span>
                  <span className="block font-medium">{x.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {f(t.templates.fieldsCount, { n: String(x.fields.length) })}
                  </span>
                </span>
              </label>
            ))}
            <Link
              to="/app/templates/new"
              search={{ kind: "pdf" }}
              className="w-fit text-sm font-semibold text-brand hover:underline sm:col-span-2 xl:col-span-3"
            >
              {t.split.createFromPdf} →
            </Link>
          </fieldset>
        )}

        {step === 1 && (
          <div className="grid max-w-2xl gap-4">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-white p-10 text-center hover:border-brand/60"
            >
              <FileSpreadsheet className="size-10 text-brand" aria-hidden />
              <span className="font-medium">{fileName || t.bulk.upload}</span>
              <span className="text-sm text-muted-foreground">{t.bulk.uploadHint}</span>
              {sheet && (
                <span className="text-sm font-semibold text-brand">
                  {f(t.bulk.rows, { n: String(sheet.rows.length) })}
                </span>
              )}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => void pickFile(e.target.files?.[0])}
            />
            <Button variant="ghost" className="w-fit" onClick={sample}>
              <Download aria-hidden />
              {t.bulk.sample}
            </Button>
          </div>
        )}

        {step === 2 && mapping && (
          <div className="grid max-w-3xl gap-4">
            <p className="text-sm text-muted-foreground">{t.bulk.mappingHint}</p>
            <div className="grid gap-3 rounded-2xl border bg-white p-5 sm:grid-cols-2">
              {(
                [
                  ["name", t.bulk.signerName],
                  ["email", t.bulk.signerEmail],
                  ["cpf", t.bulk.signerCpf],
                  ["phone", t.bulk.signerPhone],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="grid gap-1.5">
                  <Label htmlFor={`map-${key}`}>{label}</Label>
                  {columnSelect(
                    mapping.signer[key],
                    (v) => setMapping({ ...mapping, signer: { ...mapping.signer, [key]: v } }),
                    `map-${key}`,
                  )}
                </div>
              ))}
            </div>
            {fields.length > 0 && (
              <div className="grid gap-3 rounded-2xl border bg-white p-5">
                {fields.map((fl) => {
                  const m = mapping.fields[fl.key] ?? { col: -1, fixed: "" };
                  const set = (patch: Partial<typeof m>) =>
                    setMapping({
                      ...mapping,
                      fields: { ...mapping.fields, [fl.key]: { ...m, ...patch } },
                    });
                  return (
                    <div
                      key={fl.key}
                      className="grid gap-2 sm:grid-cols-[12rem_1fr_1fr] sm:items-center"
                    >
                      <Label htmlFor={`map-f-${fl.key}`}>{fl.label}</Label>
                      {columnSelect(m.col, (col) => set({ col }), `map-f-${fl.key}`)}
                      <Input
                        aria-label={`${fl.label}: ${t.bulk.fixedValue}`}
                        placeholder={t.bulk.fixedValue}
                        value={m.fixed}
                        disabled={m.col >= 0}
                        type={fl.type === "date" ? "date" : "text"}
                        onChange={(e) => set({ fixed: e.target.value })}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4">
            <p
              className={cn(
                "rounded-xl border px-4 py-3 font-medium",
                issues
                  ? "border-orange-200 bg-orange-50 text-orange-800"
                  : "border-success/30 bg-success/10 text-success",
              )}
              role="status"
            >
              {issues
                ? f(t.bulk.summary, { ready: String(rows.length - issues), issues: String(issues) })
                : f(t.bulk.allReady, { n: String(rows.length) })}
            </p>
            {problems.some((p) => p.includes("email_domain")) && (
              <p className="text-sm text-destructive">
                {t.participants.fieldErrors["email_domain"]}
              </p>
            )}
            {issues > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={onlyIssues}
                    onChange={(e) => setOnlyIssues(e.target.checked)}
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  {t.bulk.onlyIssues}
                </label>
                <Button size="sm" variant="outline" onClick={downloadIssues}>
                  <Download aria-hidden />
                  {t.bulk.downloadIssues}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRows(rows.filter((_, i) => !problems[i]!.length))}
                >
                  {t.bulk.removeIssues}
                </Button>
                <p className="w-full text-sm text-muted-foreground">{t.bulk.fixHint}</p>
              </div>
            )}
            <div className="overflow-x-auto rounded-2xl border bg-white">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">{t.bulk.row}</th>
                    <th className="p-2 font-medium">{t.participants.name}</th>
                    <th className="p-2 font-medium">{t.participants.email}</th>
                    <th className="p-2 font-medium">{t.participants.cpf}</th>
                    {fields.map((fl) => (
                      <th key={fl.key} className="p-2 font-medium whitespace-nowrap">
                        {fl.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visible.map(({ r, p }) => {
                    const bad = (field: string) =>
                      p.includes(field) || (field === "email" && p.includes("email_domain"));
                    const cell = (field: string, value: string, onChange: (v: string) => void) => (
                      <td className="p-1.5">
                        <Input
                          value={value}
                          onChange={(e) => onChange(e.target.value)}
                          aria-invalid={bad(field)}
                          aria-label={`${t.bulk.row} ${r.key}: ${field}`}
                          className={cn("h-8 min-w-36", bad(field) && "border-destructive")}
                        />
                      </td>
                    );
                    return (
                      <tr key={r.key} className={p.length ? "bg-orange-50/50" : ""}>
                        <td className="p-2 text-muted-foreground">{r.key}</td>
                        {cell("name", r.name, (v) => updateRow(r.key, { name: v }))}
                        {cell("email", r.email, (v) => updateRow(r.key, { email: v.trim() }))}
                        {cell("cpf", r.cpf, (v) => updateRow(r.key, { cpf: onlyDigits(v) }))}
                        {fields.map((fl) => (
                          <td key={fl.key} className="p-1.5">
                            <Input
                              value={r.values[fl.key] ?? ""}
                              type={fl.type === "date" ? "date" : "text"}
                              onChange={(e) =>
                                updateRow(r.key, {
                                  values: {
                                    ...r.values,
                                    [fl.key]: normalizeValue(fl, e.target.value),
                                  },
                                })
                              }
                              aria-invalid={p.includes(`values.${fl.key}`)}
                              aria-label={`${t.bulk.row} ${r.key}: ${fl.label}`}
                              className={cn(
                                "h-8 min-w-36",
                                p.includes(`values.${fl.key}`) && "border-destructive",
                              )}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="grid max-w-5xl gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="job-name">{t.bulk.name}</Label>
                <Input
                  id="job-name"
                  value={jobName}
                  maxLength={160}
                  onChange={(e) => setJobName(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="job-auth">{t.participants.authLevel}</Label>
                <select
                  id="job-auth"
                  value={authLevel}
                  onChange={(e) => setAuthLevel(e.target.value as AuthLevel)}
                  className={cn(selectClass, "h-10")}
                >
                  {config.authLevels.map((l) => (
                    <option key={l} value={l}>
                      {t.participants.levels[l]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {otherRoles.length > 0 && (
              <fieldset className="grid gap-3 rounded-xl border bg-white p-4">
                <legend className="px-1 font-medium">{t.pdf.otherRoles}</legend>
                <p className="text-xs text-muted-foreground">
                  {t.pdf.otherRolesHint.replace("{role}", roles[0]!.label)}
                </p>
                <ParticipantsEditor
                  labels={otherRoles.map((r) => r.label)}
                  value={people}
                  onChange={setPeople}
                  config={config}
                  problems={peopleProblems}
                />
              </fieldset>
            )}
            {tpl && !(tpl.marks ?? []).length && rows[0] && (
              <details className="rounded-xl border bg-white p-4">
                <summary className="cursor-pointer font-medium">{t.marks.optional}</summary>
                <div className="mt-3 grid gap-3">
                  <p className="text-xs text-muted-foreground">{t.bulk.marksHint}</p>
                  {!previewUrl ? (
                    <Button
                      variant="outline"
                      className="w-fit"
                      onClick={() =>
                        void callFunctionBlob("documents-from-template", {
                          organizationId: current.id,
                          templateId: tpl.id,
                          mode: "preview",
                          values: rows[0]!.values,
                        })
                          .then((b) => setPreviewUrl(URL.createObjectURL(b)))
                          .catch((e) => setError(errorText(t, e)))
                      }
                    >
                      {t.templates.fill.preview}
                    </Button>
                  ) : (
                    <MarksEditor
                      source={previewUrl}
                      people={[{ key: "row", label: t.bulk.eachRecipient }]}
                      value={marks}
                      onChange={setMarks}
                    />
                  )}
                </div>
              </details>
            )}
            <fieldset className="contents">
              <SendOptions value={options} onChange={setOptions} />
            </fieldset>
            <section className="grid gap-3 rounded-xl border bg-white p-4" aria-labelledby="sample">
              <div>
                <h3 id="sample" className="font-medium">
                  {t.bulk.sampleTitle}
                </h3>
                <p className="text-xs text-muted-foreground">{t.bulk.sampleHint}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={t.bulk.sampleRow}
                  value={sampleRow}
                  onChange={(e) => {
                    setSampleRow(Number(e.target.value));
                    setSampleUrl(null);
                  }}
                  className={cn(selectClass, "h-10 w-auto max-w-xs")}
                >
                  {rows.slice(0, 200).map((r, i) => (
                    <option key={r.key} value={i}>
                      {t.bulk.row} {r.key} — {r.name || "—"}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  onClick={() => void showSample()}
                  disabled={busy !== null}
                >
                  {busy === "sample" ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <Eye aria-hidden />
                  )}
                  {t.bulk.sampleShow}
                </Button>
              </div>
              {sampleUrl && (
                <iframe
                  src={sampleUrl}
                  title={t.bulk.sampleTitle}
                  className="h-[70svh] w-full rounded-md border"
                />
              )}
            </section>
            <p className="text-sm text-muted-foreground">
              {f(t.bulk.confirmText, { n: String(rows.length) })}
            </p>
          </div>
        )}

        {error && <FormMessage kind="error">{error}</FormMessage>}
        <div className="flex flex-wrap gap-3">
          {step > 0 && (
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              disabled={busy !== null}
            >
              {t.send.back}
            </Button>
          )}
          {step < 4 ? (
            <Button className="bg-brand hover:bg-brand-strong" onClick={next}>
              {t.send.next}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => void sendTest()} disabled={busy !== null}>
                {busy === "test" && <Loader2 className="animate-spin" aria-hidden />}
                {t.bulk.test}
              </Button>
              <Button
                className="bg-brand hover:bg-brand-strong"
                onClick={() => void start()}
                disabled={busy !== null}
              >
                {busy === "start" ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Send aria-hidden />
                )}
                {t.bulk.start}
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
