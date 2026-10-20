import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  BadgeCheck,
  CircleHelp,
  Clock,
  FileUp,
  FileX,
  KeyRound,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { Container } from "@/components/landing/section";
import { siteConfig } from "@/config/site";
import { isLocale, type Locale, useI18n } from "@/i18n";
import { seoHead } from "@/i18n/seo";
import { cn } from "@/lib/utils";

// Validar documento: qualquer pessoa confere se um documento assinado pelo MDSign é autêntico,
// pelo código impresso na página de assinaturas ou enviando o PDF. A validação é do motor de
// assinatura; a resposta mostra só nome, data, tipo e validade de cada assinatura.

const copy = {
  pt: {
    eyebrow: "Validação",
    title: "Validar documento",
    intro:
      "Confira se um documento assinado pelo MDSign é autêntico e quem assinou. Use o código de validação ou envie o PDF assinado.",
    byCode: "Código de validação",
    byFile: "Enviar o PDF",
    codeLabel: "Código de validação",
    codeHint: "Fica na página de assinaturas, no final do PDF assinado.",
    fileLabel: "PDF assinado (até 10 MB)",
    fileChoose: "Escolher arquivo",
    fileDrop: "ou arraste o PDF para cá",
    submit: "Validar",
    checking: "Validando…",
    found: "Documento autêntico",
    foundFile: "Assinaturas encontradas no arquivo",
    notFound: "Não foi possível validar",
    notFoundCode:
      "Não encontramos um documento com este código. Confira se digitou igual ao que está no PDF (letras e números).",
    notFoundFile:
      "Não encontramos assinaturas digitais válidas neste arquivo. Use o PDF baixado depois da conclusão, sem editar nem imprimir.",
    document: "Documento",
    concluded: "Concluído",
    inProgress: "Ainda aguardando assinaturas",
    foundPending: "Documento encontrado, assinaturas pendentes",
    pendingOne: "Falta 1 assinatura para concluir.",
    pendingMany: "Faltam {n} assinaturas para concluir.",
    pendingUnknown: "Ainda faltam assinaturas para concluir.",
    pendingHint:
      "As assinaturas já feitas são válidas, mas o documento só fica completo quando todos assinarem.",
    noSignersYet: "Ninguém assinou ainda.",
    stopped: {
      canceled: "Documento cancelado: não receberá novas assinaturas.",
      refused: "Documento recusado por um participante: não será concluído.",
      expired: "O prazo terminou antes de todos assinarem: não será concluído.",
    },
    fileNote:
      "O arquivo mostra só as assinaturas já feitas. Para saber se falta alguém, valide pelo código de validação.",
    noSignatures: "Este PDF não tem assinaturas",
    noSignaturesText:
      "Conseguimos ler o arquivo, mas ele não tem nenhuma assinatura digital. Pode ser o original, antes de assinar. Envie o PDF baixado depois da conclusão ou valide pelo código.",
    signatures: "Assinaturas",
    signedAt: "Assinado em",
    kinds: { certificate: "Certificado digital ICP-Brasil", electronic: "Assinatura eletrônica" },
    valid: "Válida",
    invalid: "Inválida",
    unknown: "Não verificada",
    source:
      "A validação é feita pelo motor de assinatura do MDSign. Por privacidade, o CPF aparece mascarado e e-mails não são exibidos.",
    again: "Validar outro documento",
    errors: {
      code: "Digite o código como aparece no documento.",
      file: "Envie um arquivo PDF de até 10 MB.",
      rate: "Muitas validações deste endereço. Tente de novo em alguns minutos.",
      generic: "Não foi possível validar agora. Tente de novo em instantes.",
    },
    metaTitle: "Validar documento assinado | MDSign",
    metaDescription:
      "Confira a autenticidade de um documento assinado pelo MDSign pelo código de validação ou enviando o PDF.",
  },
  en: {
    eyebrow: "Validation",
    title: "Validate a document",
    intro:
      "Check whether a document signed through MDSign is authentic and who signed it. Use the validation code or upload the signed PDF.",
    byCode: "Validation code",
    byFile: "Upload the PDF",
    codeLabel: "Validation code",
    codeHint: "It's on the signatures page, at the end of the signed PDF.",
    fileLabel: "Signed PDF (up to 10 MB)",
    fileChoose: "Choose file",
    fileDrop: "or drag the PDF here",
    submit: "Validate",
    checking: "Validating…",
    found: "Authentic document",
    foundFile: "Signatures found in the file",
    notFound: "Couldn't validate",
    notFoundCode:
      "We couldn't find a document with this code. Check that you typed it exactly as it appears in the PDF.",
    notFoundFile:
      "We couldn't find valid digital signatures in this file. Use the PDF downloaded after completion, without editing or printing it.",
    document: "Document",
    concluded: "Completed",
    inProgress: "Still waiting for signatures",
    foundPending: "Document found, signatures pending",
    pendingOne: "1 signature left to complete.",
    pendingMany: "{n} signatures left to complete.",
    pendingUnknown: "Signatures are still missing.",
    pendingHint:
      "The signatures already made are valid, but the document is only complete once everyone signs.",
    noSignersYet: "No one has signed yet.",
    stopped: {
      canceled: "Document canceled: it won't receive new signatures.",
      refused: "Document refused by a participant: it won't be completed.",
      expired: "The deadline passed before everyone signed: it won't be completed.",
    },
    fileNote:
      "The file only shows signatures already made. To know if anyone is missing, validate with the validation code.",
    noSignatures: "This PDF has no signatures",
    noSignaturesText:
      "We could read the file, but it has no digital signatures. It may be the original, before signing. Upload the PDF downloaded after completion or validate with the code.",
    signatures: "Signatures",
    signedAt: "Signed on",
    kinds: { certificate: "ICP-Brasil digital certificate", electronic: "Electronic signature" },
    valid: "Valid",
    invalid: "Invalid",
    unknown: "Not verified",
    source:
      "Validation is performed by MDSign's signature engine. For privacy, CPF is masked and emails are not shown.",
    again: "Validate another document",
    errors: {
      code: "Type the code as it appears on the document.",
      file: "Upload a PDF file up to 10 MB.",
      rate: "Too many validations from this address. Try again in a few minutes.",
      generic: "Couldn't validate right now. Try again shortly.",
    },
    metaTitle: "Validate a signed document | MDSign",
    metaDescription:
      "Check the authenticity of a document signed through MDSign with the validation code or by uploading the PDF.",
  },
  es: {
    eyebrow: "Validación",
    title: "Validar documento",
    intro:
      "Verifique si un documento firmado por MDSign es auténtico y quién lo firmó. Use el código de validación o envíe el PDF firmado.",
    byCode: "Código de validación",
    byFile: "Enviar el PDF",
    codeLabel: "Código de validación",
    codeHint: "Está en la página de firmas, al final del PDF firmado.",
    fileLabel: "PDF firmado (hasta 10 MB)",
    fileChoose: "Elegir archivo",
    fileDrop: "o arrastre el PDF aquí",
    submit: "Validar",
    checking: "Validando…",
    found: "Documento auténtico",
    foundFile: "Firmas encontradas en el archivo",
    notFound: "No fue posible validar",
    notFoundCode:
      "No encontramos un documento con este código. Verifique que lo escribió igual que en el PDF.",
    notFoundFile:
      "No encontramos firmas digitales válidas en este archivo. Use el PDF descargado después de la conclusión, sin editarlo ni imprimirlo.",
    document: "Documento",
    concluded: "Concluido",
    inProgress: "Aún esperando firmas",
    foundPending: "Documento encontrado, firmas pendientes",
    pendingOne: "Falta 1 firma para concluir.",
    pendingMany: "Faltan {n} firmas para concluir.",
    pendingUnknown: "Aún faltan firmas para concluir.",
    pendingHint:
      "Las firmas ya realizadas son válidas, pero el documento solo queda completo cuando todos firman.",
    noSignersYet: "Nadie ha firmado todavía.",
    stopped: {
      canceled: "Documento cancelado: no recibirá nuevas firmas.",
      refused: "Documento rechazado por un participante: no se concluirá.",
      expired: "El plazo terminó antes de que todos firmaran: no se concluirá.",
    },
    fileNote:
      "El archivo muestra solo las firmas ya realizadas. Para saber si falta alguien, valide con el código de validación.",
    noSignatures: "Este PDF no tiene firmas",
    noSignaturesText:
      "Pudimos leer el archivo, pero no tiene ninguna firma digital. Puede ser el original, antes de firmar. Envíe el PDF descargado después de la conclusión o valide con el código.",
    signatures: "Firmas",
    signedAt: "Firmado el",
    kinds: { certificate: "Certificado digital ICP-Brasil", electronic: "Firma electrónica" },
    valid: "Válida",
    invalid: "Inválida",
    unknown: "No verificada",
    source:
      "La validación la realiza el motor de firma de MDSign. Por privacidad, el CPF aparece enmascarado y no se muestran correos.",
    again: "Validar otro documento",
    errors: {
      code: "Escriba el código como aparece en el documento.",
      file: "Envíe un archivo PDF de hasta 10 MB.",
      rate: "Demasiadas validaciones desde esta dirección. Intente de nuevo en unos minutos.",
      generic: "No fue posible validar ahora. Intente de nuevo en unos instantes.",
    },
    metaTitle: "Validar documento firmado | MDSign",
    metaDescription:
      "Verifique la autenticidad de un documento firmado por MDSign con el código de validación o enviando el PDF.",
  },
} as const;

export const validateTexts = copy;

type Signer = {
  name: string;
  cpf: string | null;
  signedAt: string | null;
  kind: "certificate" | "electronic";
  valid: boolean | null;
};
type Result = {
  found: boolean;
  noSignatures: boolean;
  via: "code" | "file";
  document: {
    name: string | null;
    concluded: boolean;
    updatedAt: string | null;
    status?: "pending" | "concluded" | "refused" | "canceled" | "expired" | null;
    pending?: number | null;
  } | null;
  signers: Signer[];
};

export const Route = createFileRoute("/$lang/validar")({
  validateSearch: (search: Record<string, unknown>): { codigo?: string | undefined } => ({
    codigo: typeof search["codigo"] === "string" ? search["codigo"].slice(0, 60) : undefined,
  }),
  head: ({ params }) => {
    if (!isLocale(params.lang)) return {};
    const c = copy[params.lang];
    return seoHead(params.lang, "/validar", c.metaTitle, c.metaDescription);
  },
  component: ValidatePage,
});

const fieldClass =
  "w-full rounded-lg border border-input bg-white px-3 py-2 text-base focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none aria-[invalid=true]:border-destructive";
const endpoint = () => siteConfig.leadEndpoint.replace(/lead-submit$/, "document-validate");

function ValidatePage() {
  const { locale } = useI18n();
  const c = copy[locale as Locale];
  const search = Route.useSearch();
  const [mode, setMode] = useState<"code" | "file">("code");
  const [code, setCode] = useState(search.codigo ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const df = new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale, {
    dateStyle: "short",
    timeStyle: "short",
  });

  async function validate(via: "code" | "file") {
    setError(null);
    setResult(null);
    if (via === "code" && code.trim().length < 6) return setError(c.errors.code);
    if (
      via === "file" &&
      (!file || file.size > 10 * 1024 * 1024 || !/pdf$/i.test(file.type || file.name))
    )
      return setError(c.errors.file);
    setBusy(true);
    try {
      let res: Response;
      if (via === "code")
        res = await fetch(endpoint(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
      else {
        const form = new FormData();
        form.append("file", file!);
        res = await fetch(endpoint(), { method: "POST", body: form });
      }
      const out = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: string };
      if (res.ok)
        setResult({
          found: Boolean(out.found),
          noSignatures: Boolean(out.noSignatures),
          via,
          document: out.document ?? null,
          signers: out.signers ?? [],
        });
      else
        setError(
          out.error === "rate_limited"
            ? c.errors.rate
            : out.error === "invalid_code"
              ? c.errors.code
              : out.error === "invalid_file"
                ? c.errors.file
                : c.errors.generic,
        );
    } catch {
      setError(c.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  // Veio de "Como validar este documento" (código na URL): valida direto.
  const auto = useRef(Boolean(search.codigo));
  useEffect(() => {
    if (!auto.current) return;
    auto.current = false;
    void validate("code");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  // Pelo código: documento achado, mas nem todos assinaram (ou parou: cancelado, recusado…).
  const incomplete = Boolean(
    result?.found && result.via === "code" && result.document && !result.document.concluded,
  );
  const pendingText = (d: NonNullable<Result["document"]>) =>
    d.pending == null || d.pending === 0
      ? c.pendingUnknown
      : d.pending === 1
        ? c.pendingOne
        : c.pendingMany.replace("{n}", String(d.pending));
  const stoppedText = (d: NonNullable<Result["document"]>) =>
    d.status === "canceled" || d.status === "refused" || d.status === "expired"
      ? c.stopped[d.status]
      : null;

  return (
    <>
      <Header />
      <main id="conteudo" className="bg-white">
        <Container className="max-w-2xl py-12 sm:py-16">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand">
            <ShieldCheck className="size-4" aria-hidden />
            {c.eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-balance sm:text-4xl">{c.title}</h1>
          <p className="mt-3 text-muted-foreground">{c.intro}</p>

          {!result && (
            <div className="mt-8 grid gap-5">
              <div
                className="flex w-fit flex-wrap gap-1 rounded-xl bg-muted/60 p-1"
                role="group"
                aria-label={c.title}
              >
                {(["code", "file"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => {
                      setMode(m);
                      setError(null);
                    }}
                    className={cn(
                      "flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium",
                      mode === m
                        ? "bg-white text-brand-strong shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m === "code" ? (
                      <KeyRound className="size-4" aria-hidden />
                    ) : (
                      <FileUp className="size-4" aria-hidden />
                    )}
                    {m === "code" ? c.byCode : c.byFile}
                  </button>
                ))}
              </div>

              <form
                className="grid gap-4"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  void validate(mode);
                }}
              >
                {mode === "code" ? (
                  <label className="grid gap-1.5 text-sm font-medium">
                    {c.codeLabel}
                    <input
                      name="code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={60}
                      aria-invalid={error === c.errors.code}
                      aria-describedby="code-hint"
                      className={cn(fieldClass, "font-mono uppercase tracking-wider")}
                    />
                    <span
                      id="code-hint"
                      className="flex items-center gap-1.5 font-normal text-muted-foreground"
                    >
                      <CircleHelp className="size-4 shrink-0" aria-hidden />
                      {c.codeHint}
                    </span>
                  </label>
                ) : (
                  <div className="grid gap-1.5 text-sm font-medium">
                    <span id="file-label">{c.fileLabel}</span>
                    <label
                      className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-brand/30 p-6 text-center font-normal transition-colors hover:border-brand hover:bg-brand-soft/30"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files[0];
                        if (f) setFile(f);
                      }}
                    >
                      <FileUp className="size-6 text-brand" aria-hidden />
                      <span className="font-semibold text-brand">
                        {file ? file.name : c.fileChoose}
                      </span>
                      {!file && <span className="text-muted-foreground">{c.fileDrop}</span>}
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        className="sr-only"
                        aria-labelledby="file-label"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>
                )}
                {error && (
                  <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-strong disabled:opacity-70"
                >
                  {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {busy ? c.checking : c.submit}
                </button>
              </form>
            </div>
          )}

          {result && (
            <div
              ref={resultRef}
              tabIndex={-1}
              className="mt-8 grid gap-5 outline-none"
              aria-live="polite"
            >
              {result.found ? (
                <section
                  className={cn(
                    "grid gap-4 rounded-2xl border p-5",
                    incomplete ? "border-amber-300 bg-amber-50" : "border-success/30 bg-success/5",
                  )}
                >
                  <p
                    className={cn(
                      "flex items-center gap-2 text-lg font-semibold",
                      incomplete ? "text-amber-900" : "text-success",
                    )}
                  >
                    {incomplete ? (
                      <Clock className="size-6" aria-hidden />
                    ) : (
                      <BadgeCheck className="size-6" aria-hidden />
                    )}
                    {result.via === "file" ? c.foundFile : incomplete ? c.foundPending : c.found}
                  </p>
                  {incomplete && result.document && (
                    <div className="grid gap-1 rounded-xl border border-amber-200 bg-white p-3 text-sm text-amber-900">
                      <p className="font-semibold">
                        {stoppedText(result.document) ?? pendingText(result.document)}
                      </p>
                      {!stoppedText(result.document) && <p>{c.pendingHint}</p>}
                    </div>
                  )}
                  {result.document && (
                    <dl className="grid gap-1 text-sm">
                      <dt className="text-muted-foreground">{c.document}</dt>
                      <dd className="font-semibold break-words">{result.document.name ?? "—"}</dd>
                      <dd className="text-muted-foreground">
                        {result.document.concluded ? c.concluded : c.inProgress}
                        {result.document.concluded && result.document.updatedAt
                          ? ` · ${df.format(new Date(result.document.updatedAt))}`
                          : ""}
                      </dd>
                    </dl>
                  )}
                  {result.signers.length === 0 && (
                    <p className="text-sm text-muted-foreground">{c.noSignersYet}</p>
                  )}
                  {result.signers.length > 0 && (
                    <div className="grid gap-2">
                      <h2 className="text-sm font-semibold">
                        {c.signatures} ({result.signers.length})
                      </h2>
                      <ul className="grid gap-2">
                        {result.signers.map((s, i) => (
                          <li key={i} className="grid gap-1 rounded-xl border bg-white p-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold">{s.name || "—"}</span>
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                                  s.valid === true
                                    ? "bg-success/10 text-success"
                                    : s.valid === false
                                      ? "bg-destructive/10 text-destructive"
                                      : "bg-muted text-muted-foreground",
                                )}
                              >
                                {s.valid === true
                                  ? c.valid
                                  : s.valid === false
                                    ? c.invalid
                                    : c.unknown}
                              </span>
                            </div>
                            <span className="text-muted-foreground">
                              {[
                                s.cpf ? `CPF ${s.cpf}` : null,
                                c.kinds[s.kind],
                                s.signedAt
                                  ? `${c.signedAt} ${df.format(new Date(s.signedAt))}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.via === "file" && (
                    <p className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {c.fileNote}
                    </p>
                  )}
                </section>
              ) : result.noSignatures ? (
                <section className="grid gap-2 rounded-2xl border bg-muted/40 p-5">
                  <p className="flex items-center gap-2 text-lg font-semibold">
                    <FileX className="size-6 text-muted-foreground" aria-hidden />
                    {c.noSignatures}
                  </p>
                  <p className="text-sm text-muted-foreground">{c.noSignaturesText}</p>
                </section>
              ) : (
                <section className="grid gap-2 rounded-2xl border border-orange-200 bg-orange-50 p-5 text-orange-900">
                  <p className="flex items-center gap-2 text-lg font-semibold">
                    <XCircle className="size-6" aria-hidden />
                    {c.notFound}
                  </p>
                  <p className="text-sm">
                    {result.via === "code" ? c.notFoundCode : c.notFoundFile}
                  </p>
                </section>
              )}
              <p className="text-xs text-muted-foreground">{c.source}</p>
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setFile(null);
                }}
                className="w-fit text-sm font-semibold text-brand hover:underline"
              >
                {c.again}
              </button>
            </div>
          )}
        </Container>
      </main>
      <Footer />
    </>
  );
}
