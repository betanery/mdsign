import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  Loader2,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { ApiError, callFunction } from "../api";
import { useAppConfig, type AuthLevel } from "../app-config";
import { errorText } from "../errors";
import { useAppI18n } from "../i18n";
import { useOrg } from "../org";
import { openPdf, pageTexts } from "../pdfjs";
import { openSplitter, sha256Hex, type PdfSplitter } from "../pdflib";
import { normalizeHeader, readSheet, type Sheet } from "../sheet";
import {
  analyze,
  buildDocs,
  isPending,
  isReady,
  type IdentifyRule,
  type Person,
  type SplitDoc,
  type SplitMode,
  type SplitRule,
  splitDocAt,
} from "../split";
import { selectClass } from "../ui";
import { formatCpf, isValidCpf, onlyDigits, reservedEmailDomain } from "../validation";
import { FormMessage } from "./auth-layout";
import { useConfirm } from "./confirm-dialog";
import { PdfDrop, Stepper } from "./pdf-drop";
import { PdfPlacer, type PlacedBox } from "./pdf-placer";
import {
  defaultSendOptions,
  SendOptions,
  sendOptionsPayload,
  type SendOptionsValue,
} from "./send-options";

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_PAGES = 1000;
type Column = "name" | "email" | "cpf" | "phone" | "matricula" | "custom";
const aliases: Record<Column, string[]> = {
  name: ["nome", "name", "nomecompleto", "colaborador", "funcionario", "nombre"],
  email: ["email", "mail", "correo"],
  cpf: ["cpf", "documento"],
  phone: ["celular", "telefone", "phone", "whatsapp"],
  matricula: ["matricula", "registro", "chapa", "id", "employeeid"],
  custom: [],
};

type Mark = { x: number; y: number; w: number; h: number; pageRef: "first" | "last" };

export type SplitPreset = {
  split?: SplitRule;
  identify?: IdentifyRule;
  options?: {
    authLevel?: AuthLevel;
    message?: string | null;
    reminders?: SendOptionsValue["reminders"];
    marks?: (Mark & { type?: string })[];
    docName?: string;
  };
};

/** Fluxo "Tenho um PDF com vários documentos": Enviar → Separar → Identificar → Conferir → Assinatura → Revisar. */
export function SplitWizard({ preset }: { preset?: SplitPreset | undefined }) {
  const { t, f, locale } = useAppI18n();
  const [confirm, confirmDialog] = useConfirm();
  const { current } = useOrg();
  const config = useAppConfig();
  const navigate = useNavigate();
  const sheetInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState("");
  const [texts, setTexts] = useState<string[]>([]);
  const [splitter, setSplitter] = useState<PdfSplitter | null>(null);
  const [rule, setRule] = useState<SplitRule>(
    preset?.split ?? { mode: "page", size: 2, ranges: "" },
  );
  const [identify, setIdentify] = useState<IdentifyRule>(preset?.identify ?? { matricula: true });
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<Record<Column, number>>({
    name: -1,
    email: -1,
    cpf: -1,
    phone: -1,
    matricula: -1,
    custom: -1,
  });
  const [contacts, setContacts] = useState<Person[]>([]);
  // Destinatários digitados na conferência (fora da planilha/contatos).
  const [extraPeople, setExtraPeople] = useState<Person[]>([]);
  const [docs, setDocs] = useState<SplitDoc[]>([]);
  const [filter, setFilter] = useState<"all" | "pending">("pending");
  const [open, setOpen] = useState<number | null>(null);
  const [authLevel, setAuthLevel] = useState<AuthLevel>(preset?.options?.authLevel ?? "basic");
  const [docName, setDocName] = useState(preset?.options?.docName ?? "");
  const [mark, setMark] = useState<Mark | null>(
    preset?.options?.marks?.[0] ? { ...preset.options.marks[0] } : null,
  );
  const [options, setOptions] = useState<SendOptionsValue>(() => ({
    ...defaultSendOptions(locale),
    ...(preset?.options?.message ? { message: preset.options.message } : {}),
    ...(preset?.options?.reminders ? { reminders: preset.options.reminders } : {}),
  }));
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [sampleBytes, setSampleBytes] = useState<ArrayBuffer | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  // Dados com que o lote de teste foi criado e com que a conferência foi montada.
  const [jobSig, setJobSig] = useState("");
  const [identifiedFrom, setIdentifiedFrom] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sem planilha, a busca é nos Contatos da organização.
  useEffect(() => {
    if (!current) return;
    supabase
      .from("contacts")
      .select("id, name, email, cpf, phone")
      .eq("organization_id", current.id)
      .limit(5000)
      .then(({ data }) =>
        setContacts(
          (data ?? []).map((c) => ({
            key: `c:${c.id}`,
            name: c.name ?? "",
            email: c.email ?? "",
            cpf: c.cpf ?? "",
            phone: c.phone ?? "",
            matricula: "",
            custom: "",
          })),
        ),
      );
  }, [current]);

  const people: Person[] = useMemo(() => {
    if (!sheet) return contacts;
    const cell = (r: string[], c: Column) => (mapping[c] >= 0 ? (r[mapping[c]] ?? "").trim() : "");
    return sheet.rows.map((r, i) => ({
      key: `s:${i + 1}`,
      name: cell(r, "name"),
      email: cell(r, "email").toLowerCase(),
      cpf: onlyDigits(cell(r, "cpf")),
      phone: cell(r, "phone"),
      matricula: cell(r, "matricula"),
      custom: cell(r, "custom"),
    }));
  }, [sheet, mapping, contacts]);
  const byKey = useMemo(
    () => new Map([...people, ...extraPeople].map((p) => [p.key, p])),
    [people, extraPeople],
  );

  const ready = docs.filter(isReady);
  const pending = docs.filter(isPending);
  const yellow = pending.filter((d) => d.confidence === "yellow").length;
  const red = pending.length - yellow;
  // Nenhuma página com CPF, matrícula ou e-mail: provavelmente é um modelo em branco.
  // Destinatários com e-mail de exemplo (@example.com, .test…): o convite não chegaria.
  const exampleEmails = ready.filter((d) =>
    reservedEmailDomain(byKey.get(d.personKey!)?.email ?? ""),
  ).length;
  const looksBlank = docs.length > 0 && docs.every((d) => d.reason === "not_found");

  async function pick(f: File) {
    setError(null);
    setBusy("read");
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      const doc = await openPdf(buf.slice());
      if (doc.numPages > MAX_PAGES) {
        await doc.destroy();
        throw new ApiError("pdf_unreadable", 422);
      }
      const [txt, sha, sp] = await Promise.all([
        pageTexts(doc),
        sha256Hex(buf),
        openSplitter(buf.slice()),
      ]);
      await doc.destroy();
      setFile(f);
      setDocs([]);
      setIdentifiedFrom("");
      setTexts(txt);
      setHash(sha);
      setSplitter(sp);
      if (!docName) setDocName(f.name.replace(/\.pdf$/i, ""));
    } catch (e) {
      setError(errorText(t, e instanceof ApiError ? e : "pdf_unreadable"));
    } finally {
      setBusy(null);
    }
  }

  async function pickSheet(f: File | undefined) {
    if (!f) return;
    try {
      const s = await readSheet(f);
      if (!s.rows.length) return setError(t.errors["bulk_empty"]!);
      const heads = s.headers.map(normalizeHeader);
      setMapping(
        Object.fromEntries(
          (Object.keys(aliases) as Column[]).map((c) => [
            c,
            heads.findIndex((h) => aliases[c].includes(h)),
          ]),
        ) as Record<Column, number>,
      );
      setSheet(s);
      setError(null);
    } catch {
      setError(t.errors["sheet_unreadable"]!);
    }
  }

  function identifyNow() {
    // Nada mudou (voltou só para conferir): mantém a conferência como estava.
    const sig = JSON.stringify([hash, rule, identify, people]);
    if (sig === identifiedFrom && docs.length) {
      setError(null);
      setStep(3);
      return;
    }
    const result = buildDocs(texts, rule, identify, people);
    if (!result) return setError(t.split.rangesInvalid);
    // Mudou a separação ou a regra de identificação (mesmo PDF e mesmas pessoas): refaz, mas
    // guarda as decisões da conferência para os documentos com as mesmas páginas. Se o PDF ou
    // a planilha mudaram, começa do zero — uma confirmação antiga nunca vai para outra pessoa.
    const samePeople =
      identifiedFrom !== "" &&
      JSON.stringify([hash, people]) ===
        JSON.stringify([JSON.parse(identifiedFrom)[0], JSON.parse(identifiedFrom)[3]]);
    const previous = new Map((samePeople ? docs : []).map((d) => [`${d.from}-${d.to}`, d]));
    setDocs(
      result.map((d) => {
        const old = previous.get(`${d.from}-${d.to}`);
        if (!old || (!old.confirmed && !old.excluded)) return d;
        return {
          ...d,
          confirmed: old.confirmed,
          excluded: old.excluded,
          ...(old.confirmed && old.personKey && byKey.has(old.personKey)
            ? { personKey: old.personKey, method: old.method, value: old.value }
            : {}),
        };
      }),
    );
    setIdentifiedFrom(sig);
    setError(null);
    setStep(3);
  }

  const splitAt = (index: number, at: number) =>
    setDocs((list) =>
      splitDocAt(list, index, at, texts, analyze(texts, identify, [...people, ...extraPeople])),
    );

  const updateDoc = (index: number, patch: Partial<SplitDoc>) =>
    setDocs((list) => list.map((d) => (d.index === index ? { ...d, ...patch } : d)));

  async function partUrl(d: SplitDoc) {
    if (!splitter) return null;
    const out = await splitter.part(d.from, d.to);
    return {
      url: URL.createObjectURL(new Blob([out as BlobPart], { type: "application/pdf" })),
      out,
    };
  }

  async function showSample() {
    const first = ready[0];
    if (!first) return;
    const r = await partUrl(first);
    if (!r) return;
    if (sampleUrl) URL.revokeObjectURL(sampleUrl);
    setSampleUrl(r.url);
  }

  // Amostra para posicionar a assinatura (primeiro documento pronto).
  useEffect(() => {
    if (step !== 4 || sampleBytes || !splitter) return;
    const first = docs.find(isReady);
    if (!first) return;
    void splitter.part(first.from, first.to).then((out) => setSampleBytes(out.slice().buffer));
  }, [step, sampleBytes, splitter, docs]);

  const samplePages = docs.find(isReady);
  const markPage = samplePages
    ? mark?.pageRef === "first"
      ? 1
      : samplePages.to - samplePages.from + 1
    : 1;
  const markBoxes: PlacedBox[] = mark
    ? [
        {
          id: "sig",
          page: markPage,
          x: mark.x,
          y: mark.y,
          w: mark.w,
          h: mark.h,
          kind: "mark",
          label: t.pdf.markTypes["signature"] ?? "",
        },
      ]
    : [];

  /** Separa, envia as partes ao armazenamento privado e cria o lote (uma vez). */
  async function ensureJob(): Promise<string | null> {
    if (!current || !splitter || !file) return null;
    if (pending.length) {
      setError(t.errors["unsafe_association"]!);
      return null;
    }
    // Mesmo lote do teste se nada mudou; se a pessoa voltou e editou, descarta o rascunho.
    const sig = JSON.stringify([
      hash,
      ready.map((d) => [d.from, d.to, byKey.get(d.personKey!), d.method, d.value, d.confirmed]),
      options,
      authLevel,
      docName,
      mark,
    ]);
    if (jobId && sig === jobSig) return jobId;
    if (jobId) await callFunction("bulk-jobs", { action: "cancel", jobId }).catch(() => undefined);
    try {
      const items = ready;
      let folder: string | undefined;
      const parts: string[] = [];
      setProgress({ done: 0, total: items.length });
      for (let start = 0; start < items.length; start += 100) {
        const batch = items.slice(start, start + 100);
        const r = await callFunction<{ folder: string; urls: { path: string; token: string }[] }>(
          "bulk-jobs",
          {
            action: "upload-urls",
            organizationId: current.id,
            count: batch.length,
            start,
            ...(folder ? { folder } : {}),
          },
        );
        folder = r.folder;
        // Envio das partes em paralelo (4 de cada vez).
        let next = 0;
        const worker = async () => {
          while (next < batch.length) {
            const i = next++;
            const d = batch[i]!;
            const out = await splitter.part(d.from, d.to);
            const { error: upErr } = await supabase.storage
              .from("bulk-sources")
              .uploadToSignedUrl(
                r.urls[i]!.path,
                r.urls[i]!.token,
                new Blob([out as BlobPart], { type: "application/pdf" }),
                {
                  contentType: "application/pdf",
                },
              );
            if (upErr) throw new ApiError("internal_error", 500);
            parts[start + i] = r.urls[i]!.path;
            setProgress((p) => p && { ...p, done: p.done + 1 });
          }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
      }
      const r = await callFunction<{ jobId: string }>("bulk-jobs", {
        action: "create-pdf",
        organizationId: current.id,
        folder,
        name: docName.trim() || file.name,
        source: { name: file.name, sha256: hash, pages: texts.length },
        split: { rule, identify, hasSheet: Boolean(sheet), mapping: sheet ? mapping : null },
        options: {
          ...sendOptionsPayload(options),
          authLevel,
          docName: docName.trim(),
          marks: mark ? [{ type: "signature", ...mark }] : [],
        },
        items: items.map((d, i) => {
          const p = byKey.get(d.personKey!)!;
          return {
            name: p.name,
            email: p.email,
            cpf: p.cpf || null,
            noCpf: !p.cpf && config.foreignSigners,
            phone: p.phone || null,
            part: parts[i],
            pages: [d.from, d.to],
            match: {
              method: d.method,
              value: d.value,
              confidence: d.confidence,
              ...(d.confidence !== "green" || d.confirmed ? { confirmed: true } : {}),
            },
          };
        }),
      });
      setJobId(r.jobId);
      setJobSig(sig);
      return r.jobId;
    } catch (e) {
      setError(errorText(t, e));
      return null;
    } finally {
      setProgress(null);
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
      text: f(t.bulk.confirmText, { n: String(ready.length) }),
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
    if (step === 0 && !splitter) return setError(t.split.uploadFirst);
    if (step === 1 && !buildDocs(texts, rule, identify, people))
      return setError(t.split.rangesInvalid);
    if (step === 2) return identifyNow();
    if (step === 3 && pending.length) return setError(t.errors["unsafe_association"]!);
    if (step === 3 && !ready.length) return setError(t.errors["bulk_empty"]!);
    if (step === 3 && exampleEmails) return setError(t.participants.fieldErrors["email_domain"]!);
    setStep(step + 1);
  }

  const preview = useMemo(
    () => (texts.length ? buildDocs(texts, rule, identify, people) : null),
    [texts, rule, identify, people],
  );
  const visible = docs.filter((d) => filter === "all" || isPending(d)).slice(0, 300);
  const openDoc = docs.find((d) => d.index === open) ?? null;

  if (!current) return null;
  const tone = {
    green: "bg-success/15 text-green-800",
    yellow: "bg-orange-100 text-orange-800",
    red: "bg-destructive/10 text-destructive",
  };

  return (
    <>
      {confirmDialog}
      <Stepper
        steps={t.split.steps}
        hints={t.split.stepHints}
        current={step}
        onStep={(i) => {
          setError(null);
          setStep(i);
        }}
      />

      {step === 0 && (
        <div className="grid max-w-2xl gap-4">
          <PdfDrop
            file={file}
            maxBytes={MAX_BYTES}
            hint={t.split.uploadHint}
            onFile={(fl) => void pick(fl)}
            onError={(code) => setError(t.errors[code] ?? t.common.genericError)}
          />
          {busy === "read" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t.split.reading}
            </p>
          )}
          {file && splitter && (
            <dl className="grid grid-cols-[8rem_1fr] gap-2 rounded-xl border bg-white p-4 text-sm">
              <dt className="text-muted-foreground">{t.split.fileName}</dt>
              <dd className="truncate">{file.name}</dd>
              <dt className="text-muted-foreground">{t.split.fileSize}</dt>
              <dd>
                {file.size < 1024 * 1024
                  ? `${Math.max(1, Math.round(file.size / 1024))} KB`
                  : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
              </dd>
              <dt className="text-muted-foreground">{t.split.filePages}</dt>
              <dd>{texts.length}</dd>
            </dl>
          )}
          {file && splitter && texts.every((x) => !x.trim()) && (
            <p className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t.split.noText}
            </p>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="grid max-w-2xl gap-3">
          <h2 className="font-display text-lg font-semibold">{t.split.howSplit}</h2>
          {(["page", "fixed", "content", "manual"] as SplitMode[]).map((mode) => (
            <label
              key={mode}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4",
                rule.mode === mode && "border-brand bg-brand-soft",
              )}
            >
              <input
                type="radio"
                name="split"
                checked={rule.mode === mode}
                onChange={() => setRule({ ...rule, mode })}
                className="mt-1 accent-[var(--color-brand)]"
              />
              <span className="grid flex-1 gap-2">
                <span>
                  <span className="block font-medium">{t.split.modes[mode]}</span>
                  <span className="text-sm text-muted-foreground">{t.split.modeHints[mode]}</span>
                </span>
                {mode === "fixed" && rule.mode === "fixed" && (
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={rule.size ?? 2}
                    onChange={(e) =>
                      setRule({ ...rule, size: Math.max(1, Number(e.target.value) || 1) })
                    }
                    className="w-28"
                    aria-label={t.split.pagesPerPerson}
                  />
                )}
                {mode === "manual" && rule.mode === "manual" && (
                  <Input
                    value={rule.ranges ?? ""}
                    placeholder="1-2, 3, 4-6"
                    onChange={(e) => setRule({ ...rule, ranges: e.target.value })}
                    aria-label={t.split.ranges}
                  />
                )}
              </span>
            </label>
          ))}
          <p className="text-sm font-medium" role="status">
            {preview ? f(t.split.docsCount, { n: String(preview.length) }) : t.split.rangesInvalid}
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="grid max-w-3xl gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">{t.split.whoTitle}</h2>
            <p className="text-sm text-muted-foreground">{t.split.whoHint}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => sheetInput.current?.click()}>
              <FileSpreadsheet aria-hidden />
              {sheet ? t.split.changeSheet : t.split.addSheet}
            </Button>
            <span className="text-sm text-muted-foreground">
              {sheet
                ? f(t.bulk.rows, { n: String(sheet.rows.length) })
                : f(t.split.usingContacts, { n: String(contacts.length) })}
            </span>
            <input
              ref={sheetInput}
              type="file"
              accept=".csv,.xlsx"
              className="sr-only"
              onChange={(e) => void pickSheet(e.target.files?.[0])}
            />
          </div>
          {sheet && (
            <div className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2">
              {(
                [
                  "name",
                  "email",
                  "cpf",
                  "phone",
                  "matricula",
                  ...(identify.customLabel ? ["custom"] : []),
                ] as Column[]
              ).map((c) => (
                <label key={c} className="grid gap-1 text-sm">
                  <span className="font-medium">{t.split.columns[c]}</span>
                  <select
                    value={mapping[c]}
                    onChange={(e) => setMapping({ ...mapping, [c]: Number(e.target.value) })}
                    className={cn(selectClass, "h-10")}
                  >
                    <option value={-1}>{t.bulk.ignore}</option>
                    {sheet.headers.map((h, i) => (
                      <option key={`${h}-${i}`} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          <fieldset className="grid gap-2 rounded-2xl border bg-white p-4 text-sm">
            <legend className="px-1 font-medium">{t.split.identifyBy}</legend>
            <p className="text-muted-foreground">{t.split.priority}</p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={identify.matricula}
                onChange={(e) => setIdentify({ ...identify, matricula: e.target.checked })}
                className="size-4 accent-[var(--color-brand)]"
              />
              {t.split.useMatricula}
            </label>
            <label className="grid gap-1">
              <span>{t.split.customLabel}</span>
              <Input
                value={identify.customLabel ?? ""}
                placeholder={t.split.customPlaceholder}
                onChange={(e) => setIdentify({ ...identify, customLabel: e.target.value })}
                className="max-w-xs"
              />
            </label>
            <p className="text-xs text-muted-foreground">{t.split.nameNever}</p>
          </fieldset>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2" role="status">
            <span className="rounded-full bg-success/15 px-3 py-1 text-sm font-semibold text-success">
              {f(t.split.readyCount, { n: String(ready.length) })}
            </span>
            <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-800">
              {f(t.split.yellowCount, { n: String(yellow) })}
            </span>
            <span className="rounded-full bg-destructive/10 px-3 py-1 text-sm font-semibold text-destructive">
              {f(t.split.redCount, { n: String(red) })}
            </span>
            <label className="ml-auto flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filter === "pending"}
                onChange={(e) => setFilter(e.target.checked ? "pending" : "all")}
                className="size-4 accent-[var(--color-brand)]"
              />
              {t.bulk.onlyIssues}
            </label>
          </div>
          {exampleEmails > 0 && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {t.participants.fieldErrors["email_domain"]}
            </p>
          )}
          {looksBlank && (
            <div className="grid gap-2 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
              <p>{t.split.blankPdfWarn}</p>
              <Link
                to="/app/templates/new"
                search={{ kind: "pdf" }}
                className="w-fit font-semibold text-brand hover:underline"
              >
                {t.split.blankPdfAction} →
              </Link>
            </div>
          )}
          <div
            className={cn("grid gap-4", openDoc && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}
          >
            <div className="overflow-x-auto rounded-2xl border bg-white">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">{t.split.document}</th>
                    <th className="p-2 font-medium">{t.split.pages}</th>
                    <th className="p-2 font-medium">{t.split.recipient}</th>
                    <th className="p-2 font-medium">{t.split.identifier}</th>
                    <th className="p-2 font-medium">{t.participants.email}</th>
                    <th className="p-2 font-medium">{t.admin.status}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-muted-foreground">
                        {t.split.nothingPending}
                      </td>
                    </tr>
                  )}
                  {visible.map((d) => {
                    const p = d.personKey ? byKey.get(d.personKey) : undefined;
                    const state = d.excluded
                      ? "excluded"
                      : isReady(d)
                        ? d.confirmed && d.confidence !== "green"
                          ? "confirmed"
                          : "green"
                        : d.confidence;
                    return (
                      <tr
                        key={d.index}
                        onClick={() => setOpen(d.index)}
                        className={cn(
                          "cursor-pointer hover:bg-brand-soft/40",
                          open === d.index && "bg-brand-soft/60",
                        )}
                      >
                        <td className="p-2 font-medium">{`${docName || t.split.document} ${String(d.index + 1).padStart(3, "0")}`}</td>
                        <td className="p-2 whitespace-nowrap">
                          {d.from === d.to ? d.from : `${d.from}–${d.to}`}
                        </td>
                        <td className="p-2">{p?.name ?? "—"}</td>
                        <td className="p-2 whitespace-nowrap">
                          {d.value ? (d.method === "cpf" ? formatCpf(d.value) : d.value) : "—"}
                        </td>
                        <td className="p-2">{p?.email ?? "—"}</td>
                        <td className="p-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
                              state === "excluded"
                                ? "bg-muted text-muted-foreground"
                                : state === "confirmed"
                                  ? tone.green
                                  : tone[d.confidence],
                            )}
                          >
                            {t.split.status[state]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {openDoc && (
              <DocPanel
                key={openDoc.index}
                doc={openDoc}
                people={people}
                person={openDoc.personKey ? (byKey.get(openDoc.personKey) ?? null) : null}
                splitter={splitter}
                onClose={() => setOpen(null)}
                onChange={(patch) => updateDoc(openDoc.index, patch)}
                onSplit={(at) => splitAt(openDoc.index, at)}
                onAddPerson={(p) =>
                  setExtraPeople((list) => [...list.filter((x) => x.key !== p.key), p])
                }
              />
            )}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t.split.docName}</span>
                <Input
                  value={docName}
                  maxLength={160}
                  onChange={(e) => setDocName(e.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t.participants.authLevel}</span>
                <select
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
              </label>
            </div>
            <fieldset className="grid gap-2 rounded-xl border bg-white p-4 text-sm">
              <legend className="px-1 font-medium">{t.split.signaturePosition}</legend>
              <p className="text-muted-foreground">{t.split.signatureHint}</p>
              <div className="flex flex-wrap gap-2">
                {(["first", "last"] as const).map((ref) => (
                  <label key={ref} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="pageRef"
                      checked={(mark?.pageRef ?? "last") === ref}
                      onChange={() => setMark(mark ? { ...mark, pageRef: ref } : null)}
                      disabled={!mark}
                      className="accent-[var(--color-brand)]"
                    />
                    {t.split.pageRef[ref]}
                  </label>
                ))}
              </div>
              {mark && (
                <Button size="sm" variant="ghost" className="w-fit" onClick={() => setMark(null)}>
                  {t.split.autoPosition}
                </Button>
              )}
            </fieldset>
            <SendOptions value={options} onChange={setOptions} />
          </div>
          <div className="max-h-[75svh] overflow-y-auto rounded-2xl border bg-muted/30 p-3">
            <PdfPlacer
              source={sampleBytes}
              boxes={markBoxes}
              onChange={(b) => {
                const box = b[0];
                if (box)
                  setMark({
                    x: box.x,
                    y: box.y,
                    w: box.w,
                    h: box.h,
                    pageRef: mark?.pageRef ?? "last",
                  });
              }}
              tool={
                mark
                  ? null
                  : { key: "sig", kind: "mark", label: t.pdf.markTypes["signature"] ?? "" }
              }
              onCreate={(box) =>
                setMark({
                  x: box.x,
                  y: box.y,
                  w: box.w,
                  h: box.h,
                  pageRef:
                    samplePages && box.page === 1 && samplePages.to > samplePages.from
                      ? "first"
                      : "last",
                })
              }
              selected={null}
              onSelect={() => undefined}
            />
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="grid content-start gap-4">
            <ul className="grid gap-2 rounded-2xl border bg-white p-5 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success" aria-hidden />
                {f(t.split.summaryReady, { n: String(ready.length) })}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success" aria-hidden />
                {f(t.split.summaryPeople, {
                  n: String(new Set(ready.map((d) => d.personKey)).size),
                })}
              </li>
              <li className="flex items-center gap-2">
                {pending.length ? (
                  <XCircle className="size-4 text-destructive" aria-hidden />
                ) : (
                  <CheckCircle2 className="size-4 text-success" aria-hidden />
                )}
                {f(t.split.summaryPending, { n: String(pending.length) })}
              </li>
              <li className="text-muted-foreground">
                {f(t.split.summaryExcluded, { n: String(docs.filter((d) => d.excluded).length) })}
              </li>
            </ul>
            {progress && (
              <div className="grid gap-2" role="status">
                <p className="text-sm">
                  {f(t.split.uploading, {
                    done: String(progress.done),
                    total: String(progress.total),
                  })}
                </p>
                <Progress value={(progress.done / Math.max(progress.total, 1)) * 100} />
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {f(t.bulk.confirmText, { n: String(ready.length) })}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => void showSample()}
                disabled={busy !== null || !ready.length}
              >
                <Eye aria-hidden />
                {t.split.viewSample}
              </Button>
              <Button
                variant="outline"
                onClick={() => void sendTest()}
                disabled={busy !== null || !sampleUrl}
              >
                {busy === "test" && <Loader2 className="animate-spin" aria-hidden />}
                {t.bulk.test}
              </Button>
              <Button
                className="bg-brand hover:bg-brand-strong"
                onClick={() => void start()}
                disabled={busy !== null || !sampleUrl || pending.length > 0 || !ready.length}
              >
                {busy === "start" ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Send aria-hidden />
                )}
                {t.bulk.start}
              </Button>
            </div>
            {!sampleUrl && (
              <p className="text-xs text-muted-foreground">{t.split.sampleRequired}</p>
            )}
          </div>
          <div className="min-h-[60svh] overflow-hidden rounded-2xl border bg-white shadow-sm">
            {sampleUrl ? (
              <iframe
                src={sampleUrl}
                title={t.split.viewSample}
                className="h-[75svh] w-full border-0"
              />
            ) : (
              <p className="p-6 text-sm text-muted-foreground">{t.split.sampleRequired}</p>
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
        {step < 5 && (
          <Button
            className="bg-brand hover:bg-brand-strong"
            onClick={next}
            disabled={busy !== null || (step === 0 && !splitter)}
          >
            {step === 2 ? t.split.identifyNow : t.send.next}
          </Button>
        )}
      </div>
    </>
  );
}

/** Painel de conferência: PDF à esquerda/em cima, dados do destinatário e ações. */
function DocPanel({
  doc,
  people,
  person,
  splitter,
  onClose,
  onChange,
  onAddPerson,
  onSplit,
}: {
  onSplit: (at: number) => void;
  doc: SplitDoc;
  people: Person[];
  person: Person | null;
  splitter: PdfSplitter | null;
  onClose: () => void;
  onChange: (patch: Partial<SplitDoc>) => void;
  onAddPerson: (p: Person) => void;
}) {
  const { t } = useAppI18n();
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState({ name: "", email: "", cpf: "" });

  useEffect(() => {
    if (!splitter) return;
    void splitter.part(doc.from, doc.to).then((out) => setBytes(out.slice().buffer));
  }, [splitter, doc.from, doc.to]);

  const q = query.trim().toLowerCase();
  const results = (
    q
      ? people.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.email.includes(q) ||
            p.cpf.includes(onlyDigits(q) || "~") ||
            p.matricula.toLowerCase() === q,
        )
      : people.filter((p) => doc.candidates.includes(p.key))
  ).slice(0, 8);

  return (
    <aside className="grid content-start gap-3 rounded-2xl border bg-white p-4 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-semibold">
          {t.split.pages}: {doc.from === doc.to ? doc.from : `${doc.from}–${doc.to}`}
        </p>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t.common.close}
        </Button>
      </div>
      <div className="max-h-[45svh] overflow-y-auto rounded-md border bg-muted/30 p-2">
        <PdfPlacer
          source={bytes}
          boxes={[]}
          onChange={() => undefined}
          tool={null}
          onCreate={() => undefined}
          selected={null}
          onSelect={() => undefined}
          maxPages={3}
        />
      </div>
      <p className="text-muted-foreground">{t.split.reasons[doc.reason]}</p>
      {doc.to > doc.from && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t.split.splitHere}</span>
          {Array.from({ length: doc.to - doc.from }, (_, i) => doc.from + i + 1).map((pg) => (
            <Button
              key={pg}
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={() => onSplit(pg)}
            >
              {pg}
            </Button>
          ))}
        </div>
      )}
      {person ? (
        <dl className="grid grid-cols-[6rem_1fr] gap-1">
          <dt className="text-muted-foreground">{t.participants.name}</dt>
          <dd>{person.name || "—"}</dd>
          <dt className="text-muted-foreground">{t.participants.email}</dt>
          <dd>{person.email || "—"}</dd>
          <dt className="text-muted-foreground">{t.participants.cpf}</dt>
          <dd>{person.cpf ? formatCpf(person.cpf) : "—"}</dd>
        </dl>
      ) : (
        <p className="font-medium text-destructive">{t.split.noRecipient}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {person && !doc.excluded && !isReady(doc) && (
          <Button
            size="sm"
            className="bg-brand hover:bg-brand-strong"
            onClick={() => onChange({ confirmed: true })}
          >
            {t.split.confirm}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => onChange({ excluded: !doc.excluded })}>
          {doc.excluded ? t.split.include : t.split.exclude}
        </Button>
      </div>
      <div className="grid gap-2 border-t pt-3">
        <Label htmlFor="who">{t.split.changeRecipient}</Label>
        <Input
          id="who"
          value={query}
          placeholder={t.contacts.search}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="grid gap-1">
          {results.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                className="w-full rounded-md border px-2 py-1 text-left hover:border-brand"
                onClick={() =>
                  onChange({
                    personKey: p.key,
                    confirmed: true,
                    method: "manual",
                    value: "",
                    excluded: false,
                  })
                }
              >
                <span className="font-medium">{p.name || p.email}</span>{" "}
                <span className="text-muted-foreground">
                  · {p.email}
                  {p.cpf ? ` · ${formatCpf(p.cpf)}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-brand">
            {t.split.typeRecipient}
          </summary>
          <div className="mt-2 grid gap-2">
            <Input
              aria-label={t.participants.name}
              placeholder={t.participants.name}
              value={manual.name}
              onChange={(e) => setManual({ ...manual, name: e.target.value })}
            />
            <Input
              aria-label={t.participants.email}
              placeholder={t.participants.email}
              value={manual.email}
              onChange={(e) => setManual({ ...manual, email: e.target.value })}
            />
            <Input
              aria-label={t.participants.cpf}
              placeholder={t.participants.cpf}
              value={manual.cpf}
              onChange={(e) => setManual({ ...manual, cpf: formatCpf(e.target.value) })}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={
                manual.name.trim().length < 2 ||
                !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(manual.email) ||
                (manual.cpf !== "" && !isValidCpf(manual.cpf))
              }
              onClick={() => {
                const key = `m:${doc.index}`;
                onAddPerson({
                  key,
                  name: manual.name.trim(),
                  email: manual.email.trim().toLowerCase(),
                  cpf: onlyDigits(manual.cpf),
                  phone: "",
                  matricula: "",
                  custom: "",
                });
                onChange({
                  personKey: key,
                  confirmed: true,
                  method: "manual",
                  value: "",
                  excluded: false,
                });
              }}
            >
              {t.split.useThis}
            </Button>
          </div>
        </details>
      </div>
    </aside>
  );
}
