import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";

import { callFunction } from "@/app/api";
import { supabase } from "@/lib/supabase";
import { useAppConfig } from "@/app/app-config";
import { PageHeader } from "@/app/components/app-shell";
import { FormMessage } from "@/app/components/auth-layout";
import {
  FlowEditor,
  identityFields,
  newParticipant,
  onlyFields,
  ParticipantsEditor,
  toPayload,
  validateParticipants,
  type ParticipantDraft,
} from "@/app/components/participants-editor";
import {
  MarksEditor,
  marksPayload,
  observersValid,
  type MarksByPerson,
} from "@/app/components/marks-editor";
import { PdfDrop, Stepper } from "@/app/components/pdf-drop";
import {
  defaultSendOptions,
  SendOptions,
  sendOptionsPayload,
  type SendOptionsValue,
} from "@/app/components/send-options";
import { errorCode, errorText, participantProblems } from "@/app/errors";
import { CedroAfterDocument } from "@/app/components/free-plan-card";
import { notifyUsageChanged, useOrgUsage } from "@/app/components/plan-usage";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// "Enviar para assinatura" (PRD §9): Documento → Participantes → Fluxo → Configurações → Revisão.
export const Route = createFileRoute("/app/_shell/send")({ component: SendPage });

function SendPage() {
  const { t, locale } = useAppI18n();
  const { current } = useOrg();
  const config = useAppConfig();
  const [step, setStep] = useState(0);
  // Aprovações delegadas: avisa na Revisão para quem a aprovação vai de fato.
  const [delegates, setDelegates] = useState<Record<string, string>>({});
  useEffect(() => {
    if (step !== 5 || !current) return;
    const emails = participants
      .filter((p) => p.role === "approver" && p.email.trim())
      .map((p) => p.email.trim().toLowerCase());
    if (!emails.length) return setDelegates({});
    void supabase
      .rpc("delegation_preview", { org: current.id, emails })
      .then(({ data }) =>
        setDelegates(
          Object.fromEntries(
            ((data as { email: string; delegate_name: string }[] | null) ?? []).map((d) => [
              d.email,
              d.delegate_name,
            ]),
          ),
        ),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, current?.id]);
  const [file, setFile] = useState<File | null>(null);
  const [fileBytes, setFileBytes] = useState<ArrayBuffer | null>(null);
  const [marks, setMarks] = useState<MarksByPerson>({});
  const [name, setName] = useState("");
  const [participants, setParticipants] = useState<ParticipantDraft[]>([newParticipant()]);
  const [sequential, setSequential] = useState(true);
  const [options, setOptions] = useState<SendOptionsValue>(() => defaultSendOptions(locale));
  const [problems, setProblems] = useState<Record<number, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const usage = useOrgUsage();

  function next() {
    setError(null);
    if (step === 0 && !file) return setError(t.errors["file_required"]!);
    if (step === 1 || step === 2) {
      const all = validateParticipants(participants, config);
      const relevant =
        step === 1 ? onlyFields(all, identityFields) : onlyFields(all, ["authLevel", "phone"]);
      setProblems(relevant);
      if (Object.keys(relevant).length) return setError(t.errors["invalid_participants"]!);
    }
    if (step === 4 && !observersValid(options.observers))
      return setError(t.errors["invalid_observers"]!);
    setStep((s) => s + 1);
  }

  async function submit() {
    if (!file || !current) return;
    setSending(true);
    setError(null);
    const form = new FormData();
    form.append(
      "payload",
      JSON.stringify({
        organizationId: current.id,
        name: name.trim(),
        sequential,
        participants: toPayload(participants),
        marks: marksPayload(
          participants.map((p) => p.key),
          marks,
        ),
        ...sendOptionsPayload(options),
      }),
    );
    form.append("file", file);
    try {
      const r = await callFunction<{ documentId: string }>("documents-send", form);
      setDocumentId(r.documentId);
      notifyUsageChanged();
    } catch (e) {
      setError(errorText(t, e));
      if (errorCode(e) === "invalid_participants") {
        const p = participantProblems(e);
        setProblems(p);
        const identity = Object.values(p).some((l) => l.some((f) => identityFields.includes(f)));
        setStep(identity ? 1 : 2);
      }
      if (errorCode(e) === "invalid_expiration" || errorCode(e) === "invalid_observers") setStep(4);
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setStep(0);
    setFile(null);
    setName("");
    setParticipants([newParticipant()]);
    setOptions(defaultSendOptions(locale));
    setDocumentId(null);
    setProblems({});
  }

  if (documentId)
    return (
      <>
        <PageHeader title={t.send.title} />
        <div className="grid max-w-xl gap-4 rounded-2xl border bg-white p-6 shadow-sm">
          <CheckCircle2 className="size-12 text-success" aria-hidden />
          <div>
            <h2 className="font-display text-xl font-semibold">{t.send.done}</h2>
            <p className="mt-1 text-muted-foreground">{t.send.doneText}</p>
          </div>
          <CedroAfterDocument usage={usage} />
          <div className="flex flex-wrap gap-3">
            <Button asChild className="bg-brand hover:bg-brand-strong">
              <Link to="/app/documents/$id" params={{ id: documentId }}>
                {t.send.view}
              </Link>
            </Button>
            <Button variant="ghost" onClick={reset}>
              {t.send.another}
            </Button>
          </div>
        </div>
      </>
    );

  const r = options.reminders;
  return (
    <>
      <PageHeader title={t.send.title} subtitle={t.send.subtitle} />
      <Stepper
        steps={t.send.steps}
        current={step}
        onStep={(i) => {
          setError(null);
          setStep(i);
        }}
      />
      <div className={step === 3 ? "grid gap-5" : "grid max-w-3xl gap-5"}>
        {step === 0 && (
          <>
            <PdfDrop
              file={file}
              onFile={(f) => {
                setFile(f);
                setMarks({});
                void f.arrayBuffer().then(setFileBytes);
                setError(null);
                setName((n) => n || f.name.replace(/\.pdf$/i, ""));
              }}
              onError={(code) => setError(t.errors[code] ?? t.common.genericError)}
            />
            {file && (
              <div className="grid gap-1.5">
                <Label htmlFor="doc-name">{t.sign.docName}</Label>
                <Input
                  id="doc-name"
                  value={name}
                  maxLength={200}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
          </>
        )}
        {step === 1 && (
          <ParticipantsEditor
            value={participants}
            onChange={setParticipants}
            config={config}
            problems={problems}
          />
        )}
        {step === 2 && (
          <FlowEditor
            value={participants}
            onChange={setParticipants}
            sequential={sequential}
            onSequentialChange={setSequential}
            config={config}
            problems={problems}
          />
        )}
        {step === 3 && (
          <MarksEditor
            source={fileBytes}
            people={participants
              .filter((p) => p.role !== "approver")
              .map((p) => ({ key: p.key, label: p.name || p.email }))}
            value={marks}
            onChange={setMarks}
          />
        )}
        {step === 4 && <SendOptions value={options} onChange={setOptions} />}
        {step === 5 && delegates && (
          <dl className="grid gap-4 rounded-2xl border bg-white p-5 text-sm shadow-sm sm:grid-cols-[10rem_1fr]">
            <dt className="font-medium text-muted-foreground">{t.send.review.document}</dt>
            <dd>{name || file?.name}</dd>
            <dt className="font-medium text-muted-foreground">{t.send.review.participants}</dt>
            <dd>
              <ol className="grid gap-1">
                {participants.map((p, i) => (
                  <li key={p.key}>
                    {sequential ? `${i + 1}. ` : ""}
                    <strong>{p.name}</strong> · {p.email} · {t.participants.roles[p.role]} ·{" "}
                    {t.participants.levels[p.authLevel]}
                    {p.role === "approver" && delegates[p.email.trim().toLowerCase()] && (
                      <span className="block text-xs text-brand">
                        {t.send.review.delegated.replace(
                          "{name}",
                          delegates[p.email.trim().toLowerCase()]!,
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </dd>
            {options.observers.some((o) => o.email.trim()) && (
              <>
                <dt className="font-medium text-muted-foreground">{t.observers.title}</dt>
                <dd>
                  {options.observers
                    .filter((o) => o.email.trim())
                    .map((o) => o.name || o.email)
                    .join(", ")}
                </dd>
              </>
            )}
            <dt className="font-medium text-muted-foreground">{t.send.review.order}</dt>
            <dd>{sequential ? t.send.review.sequential : t.send.review.parallel}</dd>
            <dt className="font-medium text-muted-foreground">{t.send.review.expiration}</dt>
            <dd>
              {options.expiresAt
                ? new Date(`${options.expiresAt}T12:00:00`).toLocaleDateString(
                    locale === "pt" ? "pt-BR" : locale,
                  )
                : t.sendOptions.noExpiration}
            </dd>
            <dt className="font-medium text-muted-foreground">{t.send.review.reminders}</dt>
            <dd>
              {r.enabled
                ? t.send.review.remindersOn
                    .replace("{first}", String(r.firstDays))
                    .replace("{every}", String(r.everyDays))
                    .replace("{max}", String(r.max))
                : t.send.review.off}
            </dd>
            {options.message.trim() && (
              <>
                <dt className="font-medium text-muted-foreground">{t.send.review.message}</dt>
                <dd className="whitespace-pre-line">{options.message.trim()}</dd>
              </>
            )}
            <dd className="text-muted-foreground sm:col-span-2">{t.send.review.consumption}</dd>
          </dl>
        )}

        {error && <FormMessage kind="error">{error}</FormMessage>}
        <div className="flex flex-wrap gap-3">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={sending}>
              {t.send.back}
            </Button>
          )}
          {step < 5 ? (
            <Button className="bg-brand hover:bg-brand-strong" onClick={next}>
              {t.send.next}
            </Button>
          ) : (
            <Button
              className="bg-brand hover:bg-brand-strong"
              onClick={() => void submit()}
              disabled={sending}
            >
              {sending && <Loader2 className="animate-spin" aria-hidden />}
              {sending ? t.send.sending : t.send.submit}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
