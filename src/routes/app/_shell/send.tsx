import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FileText,
  ListOrdered,
  Loader2,
  UsersRound,
} from "lucide-react";

import { callFunction } from "@/app/api";
import { supabase } from "@/lib/supabase";
import { useAppConfig } from "@/app/app-config";
import { PageHeader } from "@/app/components/app-shell";
import { FormMessage } from "@/app/components/auth-layout";
import {
  FlowEditor,
  FlowPreview,
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
import { AttachmentsPicker } from "@/app/components/attachments-picker";
import { SavedFlows } from "@/app/components/saved-flows";
import { useFolders } from "@/app/folders";
import { PdfDrop, Stepper } from "@/app/components/pdf-drop";
import {
  defaultSendOptions,
  SendOptions,
  sendOptionsPayload,
  type SendOptionsValue,
} from "@/app/components/send-options";
import { errorCode, errorText, participantProblems } from "@/app/errors";
import { CedroAfterDocument, LimitReachedOffer } from "@/app/components/free-plan-card";
import { notifyUsageChanged, useOrgUsage } from "@/app/components/plan-usage";
import { useLeaveGuard } from "@/app/leave-guard";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { selectClass } from "@/app/ui";

// "Enviar para assinatura" (PRD §9) em 3 etapas: Documento → Quem assina → Revisar e enviar.
// Ordem, autenticação, posição, prazo e lembretes ficam em "Ajustes (opcional)" na revisão,
// já com o padrão: quem só quer mandar para alguém assinar não passa por eles.
export const Route = createFileRoute("/app/_shell/send")({ component: SendPage });

function SendPage() {
  const { t, f, locale } = useAppI18n();
  const { current } = useOrg();
  const config = useAppConfig();
  const [step, setStep] = useState(0);
  // Aprovações delegadas: avisa na Revisão para quem a aprovação vai de fato.
  const [delegates, setDelegates] = useState<Record<string, string>>({});
  useEffect(() => {
    if (step !== 2 || !current) return;
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
  const [attachments, setAttachments] = useState<File[]>([]);
  const [folderId, setFolderId] = useState("");
  const { folders } = useFolders(current?.id);
  const [marks, setMarks] = useState<MarksByPerson>({});
  const [name, setName] = useState("");
  const [participants, setParticipants] = useState<ParticipantDraft[]>([newParticipant()]);
  const [sequential, setSequential] = useState(true);
  const [options, setOptions] = useState<SendOptionsValue>(() => defaultSendOptions(locale));
  const [problems, setProblems] = useState<Record<number, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  // Id deste envio: repetir (rede caiu, clique duplo) não cria nem cobra outro documento.
  const requestId = useRef(crypto.randomUUID());
  const [limitHit, setLimitHit] = useState(false);
  const [panel, setPanel] = useState<"flow" | "marks" | "options" | null>(null);
  const usage = useOrgUsage();
  useLeaveGuard(Boolean(file) && !documentId && !sending);

  function next() {
    setError(null);
    if (step === 0 && !file) return setError(t.errors["file_required"]!);
    if (step === 1) {
      const relevant = onlyFields(validateParticipants(participants, config), identityFields);
      setProblems(relevant);
      if (Object.keys(relevant).length) return setError(t.errors["invalid_participants"]!);
    }
    setStep((s) => s + 1);
  }

  async function submit() {
    if (!file || !current) return;
    // Os ajustes também são conferidos aqui: o bloco com problema abre sozinho.
    const flowProblems = onlyFields(validateParticipants(participants, config), [
      "authLevel",
      "phone",
    ]);
    if (Object.keys(flowProblems).length) {
      setProblems(flowProblems);
      setPanel("flow");
      return setError(t.errors["invalid_participants"]!);
    }
    if (!observersValid(options.observers)) {
      setPanel("options");
      return setError(t.errors["invalid_observers"]!);
    }
    setSending(true);
    setError(null);
    const form = new FormData();
    form.append(
      "payload",
      JSON.stringify({
        organizationId: current.id,
        requestId: requestId.current,
        name: name.trim(),
        sequential,
        participants: toPayload(participants),
        marks: marksPayload(
          participants.map((p) => p.key),
          marks,
        ),
        ...sendOptionsPayload(options),
        folderId: folderId || null,
      }),
    );
    form.append("file", file);
    for (const a of attachments) form.append("attachments", a);
    try {
      const r = await callFunction<{ documentId: string }>("documents-send", form);
      setDocumentId(r.documentId);
      requestId.current = crypto.randomUUID();
      notifyUsageChanged();
    } catch (e) {
      setError(errorText(t, e));
      setLimitHit(errorCode(e) === "plan_limit_reached");
      if (errorCode(e) === "invalid_participants") {
        const p = participantProblems(e);
        setProblems(p);
        const identity = Object.values(p).some((l) => l.some((f) => identityFields.includes(f)));
        if (identity) setStep(1);
        else setPanel("flow");
      }
      if (errorCode(e) === "invalid_expiration" || errorCode(e) === "invalid_observers")
        setPanel("options");
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setStep(0);
    setFile(null);
    setAttachments([]);
    setName("");
    setParticipants([newParticipant()]);
    setOptions(defaultSendOptions(locale));
    setDocumentId(null);
    setProblems({});
    setLimitHit(false);
    requestId.current = crypto.randomUUID();
    setPanel(null);
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
  // Resumo: quem já tem nome ou e-mail conta como participante; pendências = documento faltando
  // + pessoas com dados obrigatórios incompletos.
  const named = participants.filter((p) => p.name.trim() || p.email.trim());
  const approverCount = named.filter((p) => p.role === "approver").length;
  const pendingItems =
    (file ? 0 : 1) +
    Object.keys(onlyFields(validateParticipants(participants, config), identityFields)).length;
  const markCount = Object.values(marks).reduce((n, list) => n + list.length, 0);
  // Na Revisão, um grupo com quórum é uma etapa só (mesmo número para todos do grupo).
  const reviewSteps: number[] = [];
  participants.forEach((p, i) => {
    const prev = participants[i - 1];
    const same = Boolean(p.rule && prev?.rule?.key === p.rule.key);
    reviewSteps.push(i === 0 ? 1 : same ? reviewSteps[i - 1]! : reviewSteps[i - 1]! + 1);
  });
  return (
    <>
      <PageHeader title={t.send.title} subtitle={t.send.subtitle} />
      <Stepper
        steps={t.send.steps}
        hints={t.send.stepHints}
        current={step}
        onStep={(i) => {
          setError(null);
          setStep(i);
        }}
      />
      {/* Resumo fixo: o que já está definido e o que falta, em todas as etapas. */}
      <p
        className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-white px-4 py-2.5 text-sm"
        aria-label={t.send.summary.label}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <FileText className="size-4 shrink-0 text-brand" aria-hidden />
          <span className="max-w-[16rem] truncate font-medium">
            {file ? name || file.name : t.send.summary.noFile}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <UsersRound className="size-4 text-brand" aria-hidden />
          {f(t.send.summary.people, { n: String(named.length) })}
          {named.length > 0 && (
            <span className="text-muted-foreground">
              (
              {[
                approverCount ? f(t.send.summary.approvers, { n: String(approverCount) }) : null,
                f(t.send.summary.signers, { n: String(named.length - approverCount) }),
              ]
                .filter(Boolean)
                .join(", ")}
              )
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <ListOrdered className="size-4 text-brand" aria-hidden />
          {sequential ? t.send.summary.inOrder : t.send.summary.parallel}
        </span>
        <span
          className={cn(
            "flex items-center gap-1.5 font-medium",
            pendingItems ? "text-amber-800" : "text-success",
          )}
        >
          {pendingItems ? (
            <AlertCircle className="size-4" aria-hidden />
          ) : (
            <CheckCircle2 className="size-4" aria-hidden />
          )}
          {pendingItems
            ? f(t.send.summary.pending, { n: String(pendingItems) })
            : t.send.summary.ok}
        </span>
      </p>
      <div className={step === 2 && panel === "marks" ? "grid gap-5" : "grid max-w-3xl gap-5"}>
        {step === 0 && (
          <>
            {!file && (
              <section
                className="rounded-2xl border border-brand/20 bg-brand-soft/40 p-4"
                aria-labelledby="send-need"
              >
                <h2 id="send-need" className="text-sm font-semibold">
                  {t.send.needTitle}
                </h2>
                <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
                  {t.send.need.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}
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
            {file && folders.length > 0 && (
              <div className="grid gap-1.5">
                <Label htmlFor="doc-folder">{t.folders.field}</Label>
                <select
                  id="doc-folder"
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className={cn(selectClass, "h-10 w-full sm:w-80")}
                >
                  <option value="">{t.folders.none}</option>
                  {folders.map((fo) => (
                    <option key={fo.id} value={fo.id}>
                      {fo.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {file && (
              <AttachmentsPicker
                files={attachments}
                onChange={setAttachments}
                onError={(code) => setError(code ? (t.errors[code] ?? null) : null)}
              />
            )}
          </>
        )}
        {step === 1 && (
          <>
            <ParticipantsEditor
              value={participants}
              onChange={setParticipants}
              config={config}
              problems={problems}
            />
            <SavedFlows
              participants={participants}
              sequential={sequential}
              onApply={(list, seq) => {
                setParticipants(list);
                setSequential(seq);
                setProblems({});
              }}
            />
            {/* A ordem fica aqui, junto do desenho do fluxo (também em Revisar → Ajustes). */}
            <label className="flex items-start gap-3 rounded-xl border bg-white p-4">
              <Switch checked={sequential} onCheckedChange={setSequential} className="mt-0.5" />
              <span>
                <span className="block font-medium">{t.participants.sequential}</span>
                <span className="text-sm text-muted-foreground">
                  {sequential ? t.participants.sequentialHint : t.participants.parallelHint}
                </span>
              </span>
            </label>
            <FlowPreview participants={participants} sequential={sequential} />
          </>
        )}
        {step === 2 && (
          <dl className="grid gap-4 rounded-2xl border bg-white p-5 text-sm shadow-sm sm:grid-cols-[10rem_1fr]">
            <dt className="font-medium text-muted-foreground">{t.send.review.document}</dt>
            <dd>{name || file?.name}</dd>
            {attachments.length > 0 && (
              <>
                <dt className="font-medium text-muted-foreground">{t.send.review.attachments}</dt>
                <dd>{attachments.map((a) => a.name).join(", ")}</dd>
              </>
            )}
            <dt className="font-medium text-muted-foreground">{t.send.review.participants}</dt>
            <dd>
              <ol className="grid gap-1">
                {participants.map((p, i) => (
                  <li key={p.key}>
                    {sequential ? `${reviewSteps[i]}. ` : ""}
                    <strong>{p.name}</strong> · {p.email} · {t.participants.roles[p.role]} ·{" "}
                    {t.participants.levels[p.authLevel]}
                    {p.rule && (
                      <span className="ml-1 rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                        {p.rule.name} ·{" "}
                        {t.participants.quorumAny.replace("{n}", String(p.rule.required))}
                      </span>
                    )}
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
        {step === 2 && (
          <section className="grid gap-3" aria-labelledby="send-adjust">
            <div>
              <h2 id="send-adjust" className="font-display text-lg font-semibold">
                {t.send.adjust.title}
              </h2>
              <p className="text-sm text-muted-foreground">{t.send.adjust.hint}</p>
            </div>
            {(
              [
                {
                  id: "flow",
                  title: t.send.adjust.flow,
                  summary: [
                    sequential ? t.send.review.sequential : t.send.review.parallel,
                    [...new Set(participants.map((p) => t.participants.levels[p.authLevel]))].join(
                      ", ",
                    ),
                  ].join(" · "),
                },
                {
                  id: "marks",
                  title: t.send.adjust.marks,
                  summary: markCount
                    ? t.send.adjust.marksCount.replace("{n}", String(markCount))
                    : t.send.adjust.marksAuto,
                },
                {
                  id: "options",
                  title: t.send.adjust.options,
                  summary: [
                    options.expiresAt
                      ? new Date(`${options.expiresAt}T12:00:00`).toLocaleDateString(
                          locale === "pt" ? "pt-BR" : locale,
                        )
                      : t.sendOptions.noExpiration,
                    `${t.send.review.reminders}: ${r.enabled ? t.send.adjust.remindersOn : t.send.review.off}`,
                  ].join(" · "),
                },
              ] as const
            ).map((item) => {
              const open = panel === item.id;
              return (
                <div key={item.id} className="rounded-2xl border bg-white shadow-sm">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`adjust-${item.id}`}
                    onClick={() => setPanel(open ? null : item.id)}
                    className="flex w-full items-center gap-3 p-4 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{item.title}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {item.summary}
                      </span>
                    </span>
                    <span className="text-sm font-medium text-brand">
                      {open ? t.send.adjust.close : t.send.adjust.change}
                    </span>
                    <ChevronDown
                      className={cn("size-4 text-brand transition-transform", open && "rotate-180")}
                      aria-hidden
                    />
                  </button>
                  {open && (
                    <div id={`adjust-${item.id}`} className="border-t p-4">
                      {item.id === "flow" && (
                        <FlowEditor
                          value={participants}
                          onChange={setParticipants}
                          sequential={sequential}
                          onSequentialChange={setSequential}
                          config={config}
                          problems={problems}
                        />
                      )}
                      {item.id === "marks" && (
                        <MarksEditor
                          source={fileBytes}
                          people={participants
                            .filter((p) => p.role !== "approver")
                            .map((p) => ({ key: p.key, label: p.name || p.email }))}
                          value={marks}
                          onChange={setMarks}
                        />
                      )}
                      {item.id === "options" && (
                        <SendOptions value={options} onChange={setOptions} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {error && <FormMessage kind="error">{error}</FormMessage>}
        {limitHit && <LimitReachedOffer />}
        <div className="flex flex-wrap gap-3">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={sending}>
              {t.send.back}
            </Button>
          )}
          {step < 2 ? (
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
