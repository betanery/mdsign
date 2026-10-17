import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Download, FileUp, Loader2 } from "lucide-react";

import { callFunction, documentAction } from "@/app/api";
import { errorCode, errorText as apiErrorText } from "@/app/errors";
import { LimitReachedOffer } from "@/app/components/free-plan-card";
import { PageHeader } from "@/app/components/app-shell";
import { FormMessage } from "@/app/components/auth-layout";
import {
  MarksEditor,
  marksPayload,
  ObserversEditor,
  observersPayload,
  observersValid,
  type MarksByPerson,
  type ObserverDraft,
} from "@/app/components/marks-editor";
import { SigningFrame } from "@/app/components/signing-frame";
import { CedroAfterDocument } from "@/app/components/free-plan-card";
import { notifyUsageChanged, useOrgUsage } from "@/app/components/plan-usage";
import { useLeaveGuard } from "@/app/leave-guard";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// "Só eu assino" (PRD §8): Upload → Revisar → Assinar → Concluído.
export const Route = createFileRoute("/app/_shell/sign")({ component: SelfSign });

const MAX_BYTES = 20 * 1024 * 1024;
type Step = "upload" | "preparing" | "signing" | "confirming" | "done";

function SelfSign() {
  const { t } = useAppI18n();
  const { current } = useOrg();
  const [step, setStep] = useState<Step>("upload");
  const usage = useOrgUsage();
  const [file, setFile] = useState<File | null>(null);
  const [fileBytes, setFileBytes] = useState<ArrayBuffer | null>(null);
  const [marks, setMarks] = useState<MarksByPerson>({});
  const [observers, setObservers] = useState<ObserverDraft[]>([]);
  const [extras, setExtras] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [doc, setDoc] = useState<{ documentId: string; embedUrl: string } | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const [limitHit, setLimitHit] = useState(false);
  useLeaveGuard(Boolean(file) && !doc);
  const input = useRef<HTMLInputElement>(null);

  const errorText = (code: string) => t.errors[code] ?? t.common.genericError;

  function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"))
      return setError(errorText("file_not_pdf"));
    if (f.size > MAX_BYTES) return setError(errorText("file_too_large"));
    setFile(f);
    setMarks({});
    void f.arrayBuffer().then(setFileBytes);
    setName(f.name.replace(/\.pdf$/i, ""));
  }

  async function start() {
    if (!file || !current) return;
    setStep("preparing");
    setError(null);
    const form = new FormData();
    form.append("organizationId", current.id);
    // Id desta tentativa: repetir não cria nem cobra outro documento.
    form.append("requestId", requestId.current);
    form.append("displayName", name.trim());
    form.append("file", file);
    form.append("marks", JSON.stringify(marksPayload(["me"], marks)));
    if (!observersValid(observers)) {
      setStep("upload");
      return setError(t.errors["invalid_observers"]!);
    }
    form.append("observers", JSON.stringify(observersPayload(observers)));
    try {
      const result = await callFunction<{ documentId: string; embedUrl: string }>(
        "documents-self-sign",
        form,
      );
      setDoc(result);
      setStep("signing");
      requestId.current = crypto.randomUUID();
    } catch (e) {
      setError(apiErrorText(t, e));
      setLimitHit(errorCode(e) === "plan_limit_reached");
      setStep("upload");
    }
  }

  async function signed() {
    if (!doc) return;
    setStep("confirming");
    // O evento do componente é só um aviso: confirmamos no motor pelo backend.
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const { status } = await documentAction<{ status: string }>(doc.documentId, "sync");
        if (status === "concluded") break;
      } catch {
        // tenta de novo
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setStep("done");
    notifyUsageChanged();
  }

  async function download() {
    if (!doc) return;
    try {
      const { url } = await documentAction<{ url: string }>(doc.documentId, "download");
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setError(apiErrorText(t, e));
    }
  }

  function reset() {
    setStep("upload");
    setFile(null);
    setName("");
    setDoc(null);
    setError(null);
  }

  return (
    <>
      <PageHeader
        title={t.sign.title}
        subtitle={step === "signing" ? t.sign.signHere : t.sign.subtitle}
      />

      {(step === "upload" || step === "preparing") && (
        <div className={extras ? "grid max-w-5xl gap-4" : "grid max-w-2xl gap-4"}>
          <div
            data-tour="pdf-drop"
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              pick(e.dataTransfer.files[0]);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-white p-10 text-center transition-colors",
              drag ? "border-brand bg-brand-soft" : "border-border hover:border-brand/60",
            )}
          >
            <FileUp className="size-10 text-brand" aria-hidden />
            {file ? (
              <p className="font-medium">{file.name}</p>
            ) : (
              <>
                <p className="font-medium">{t.sign.dropTitle}</p>
                <p className="text-sm text-muted-foreground">{t.sign.dropHint}</p>
              </>
            )}
            <span className="text-sm font-semibold text-brand">
              {file ? t.sign.change : t.sign.choose}
            </span>
            <input
              ref={input}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </div>

          {file && (
            <div className="grid gap-1.5">
              <Label htmlFor="doc-name">{t.sign.docName}</Label>
              <Input
                id="doc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                required
              />
            </div>
          )}
          {file && (
            <details
              open={extras}
              onToggle={(e) => setExtras((e.target as HTMLDetailsElement).open)}
              className="rounded-xl border bg-white p-4"
            >
              <summary className="cursor-pointer font-medium">{t.marks.optional}</summary>
              {extras && (
                <div className="mt-4 grid gap-4">
                  <MarksEditor
                    source={fileBytes}
                    people={[{ key: "me", label: t.marks.me }]}
                    value={marks}
                    onChange={setMarks}
                  />
                  <ObserversEditor value={observers} onChange={setObservers} />
                </div>
              )}
            </details>
          )}
          {error && <FormMessage kind="error">{error}</FormMessage>}
          {limitHit && <LimitReachedOffer />}
          <Button
            size="lg"
            className="w-fit bg-brand hover:bg-brand-strong"
            disabled={!file || !name.trim() || step === "preparing"}
            onClick={() => void start()}
          >
            {step === "preparing" && <Loader2 className="animate-spin" aria-hidden />}
            {step === "preparing" ? t.sign.preparing : t.sign.start}
          </Button>
        </div>
      )}

      {step === "signing" && doc && (
        <SigningFrame
          embedUrl={doc.embedUrl}
          onSigned={() => void signed()}
          onError={() => setError(errorText("widget"))}
        />
      )}
      {step === "signing" && error && <FormMessage kind="error">{error}</FormMessage>}

      {step === "confirming" && (
        <p className="flex items-center gap-2 text-muted-foreground" role="status">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          {t.sign.confirming}
        </p>
      )}

      {step === "done" && doc && (
        <div className="grid max-w-xl gap-4 rounded-2xl border bg-white p-6 shadow-sm">
          <CheckCircle2 className="size-12 text-success" aria-hidden />
          <div>
            <h2 className="font-display text-xl font-semibold">{t.sign.done}</h2>
            <p className="mt-1 text-muted-foreground">{t.sign.doneText}</p>
          </div>
          <CedroAfterDocument usage={usage} />
          {error && <FormMessage kind="error">{error}</FormMessage>}
          {limitHit && <LimitReachedOffer />}
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void download()} className="bg-brand hover:bg-brand-strong">
              <Download aria-hidden />
              {t.sign.download}
            </Button>
            <Button asChild variant="outline">
              <Link to="/app/documents/$id" params={{ id: doc.documentId }}>
                {t.sign.view}
              </Link>
            </Button>
            <Button variant="ghost" onClick={reset}>
              {t.sign.another}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
