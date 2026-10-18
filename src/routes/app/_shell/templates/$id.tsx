import { useEffect, useRef, useState } from "react";
import { FeatureGate } from "@/app/components/feature-preview";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Download, Eye, FilePen, Loader2, Send } from "lucide-react";

import { callFunction, callFunctionBlob, documentAction } from "@/app/api";
import { useAppConfig } from "@/app/app-config";
import { PageHeader } from "@/app/components/app-shell";
import { FormMessage } from "@/app/components/auth-layout";
import {
  FlowEditor,
  newParticipant,
  ParticipantsEditor,
  toPayload,
  validateParticipants,
  type ParticipantDraft,
} from "@/app/components/participants-editor";
import {
  defaultSendOptions,
  SendOptions,
  sendOptionsPayload,
  type SendOptionsValue,
} from "@/app/components/send-options";
import { MarksEditor, marksPayload, type MarksByPerson } from "@/app/components/marks-editor";
import { SigningFrame } from "@/app/components/signing-frame";
import {
  FieldInput,
  templateSelect,
  fillableFields,
  validateValues,
  type TemplateRow,
} from "@/app/components/template-fields";
import { errorCode, errorText, fieldProblems, participantProblems } from "@/app/errors";
import { LimitReachedOffer } from "@/app/components/free-plan-card";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { formatCpf } from "@/app/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useFolders } from "@/app/folders";
import { selectClass } from "@/app/ui";

// Criar a partir de modelo (PRD §13): preencher → prévia → Só eu assino ou Enviar.
export const Route = createFileRoute("/app/_shell/templates/$id")({
  // Recurso do plano: fora dele, a prévia de upgrade no lugar da tela (o backend recusa).
  component: () => (
    <FeatureGate code="templates">
      <UseTemplate />
    </FeatureGate>
  ),
});

type Phase = "fill" | "participants" | "signing" | "confirming" | "done";

function UseTemplate() {
  const { id } = Route.useParams();
  const { t, locale } = useAppI18n();
  const { current } = useOrg();
  const { folders } = useFolders(current?.id);
  const [folderId, setFolderId] = useState("");
  const config = useAppConfig();
  const [tpl, setTpl] = useState<TemplateRow | null | undefined>(undefined);
  const [values, setValues] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [bad, setBad] = useState<string[]>([]);
  const [how, setHow] = useState<"self" | "send">("send");
  const [phase, setPhase] = useState<Phase>("fill");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Id desta tentativa: repetir não cria nem cobra outro documento.
  const requestId = useRef(crypto.randomUUID());
  const [limitHit, setLimitHit] = useState(false);
  const [participants, setParticipants] = useState<ParticipantDraft[]>([newParticipant()]);
  const [sequential, setSequential] = useState(true);
  const [options, setOptions] = useState<SendOptionsValue>(() => defaultSendOptions(locale));
  const [problems, setProblems] = useState<Record<number, string[]>>({});
  const [result, setResult] = useState<{ documentId: string; embedUrl?: string } | null>(null);
  const preview = useRef<string | null>(null);
  // Posições de assinatura escolhidas no envio (modelos sem posições definidas).
  const [marks, setMarks] = useState<MarksByPerson>({});

  useEffect(() => {
    supabase
      .from("templates")
      .select(templateSelect)
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as TemplateRow | null;
        setTpl(row);
        if (!row) return;
        setName(row.name);
        // Modelo com papéis: uma pessoa por papel, com a autenticação definida no modelo.
        const roles = [...(row.participants ?? [])].sort((a, b) => a.slot - b.slot);
        if (roles.length) {
          setParticipants(
            roles.map((r) => ({ ...newParticipant(), role: r.role, authLevel: r.authLevel })),
          );
          if (roles.length > 1) setHow("send");
        }
        if (row.flow?.sequential !== undefined) setSequential(row.flow.sequential);
        setOptions((o) => ({
          ...o,
          message: row.flow?.message ?? o.message,
          reminders: row.flow?.reminders ?? o.reminders,
        }));
      });
  }, [id]);

  useEffect(
    () => () => {
      if (preview.current) URL.revokeObjectURL(preview.current);
    },
    [],
  );

  if (!current) return <p>{t.notFoundOrg}</p>;
  if (tpl === undefined) return <p>{t.common.loading}</p>;
  if (tpl === null) return <p>{t.errors["template_not_found"]}</p>;
  const template = tpl;
  const roles = [...(template.participants ?? [])].sort((a, b) => a.slot - b.slot);
  const fillable = fillableFields(template.fields);
  const hasTemplateMarks = (template.marks ?? []).length > 0;

  const base = () => ({
    organizationId: current.id,
    requestId: requestId.current,
    templateId: template.id,
    values,
    name: name.trim(),
  });

  function check() {
    const missing = validateValues(fillable, values);
    setBad(missing);
    if (missing.length) setError(t.errors["invalid_fields"]!);
    return missing.length === 0;
  }

  async function refreshPreview() {
    setError(null);
    if (!check()) return;
    setBusy("preview");
    try {
      const blob = await callFunctionBlob("documents-from-template", {
        ...base(),
        mode: "preview",
      });
      if (preview.current) URL.revokeObjectURL(preview.current);
      preview.current = URL.createObjectURL(blob);
      setPreviewUrl(preview.current);
    } catch (e) {
      setBad(fieldProblems(e));
      setError(errorText(t, e));
      setLimitHit(errorCode(e) === "plan_limit_reached");
    } finally {
      setBusy(null);
    }
  }

  // Sugere o 1º participante a partir dos campos de quem assina (nome, e-mail, CPF).
  function suggestParticipant() {
    const signerField = (type: string, keys: string[]) =>
      template.fields.find(
        (f) => f.source === "signer" && (f.type === type || keys.includes(f.key)),
      )?.key;
    const nameKey = template.fields.find((f) => f.source === "signer" && f.type === "text")?.key;
    const emailKey = signerField("email", ["email"]);
    const cpfKey = signerField("cpf", ["cpf"]);
    const first = participants[0];
    if (participants.length === 1 && first && !first.name && !first.email)
      setParticipants([
        {
          ...first,
          name: (nameKey && values[nameKey]) || "",
          email: (emailKey && values[emailKey]) || "",
          cpf: cpfKey && values[cpfKey] ? formatCpf(values[cpfKey]) : "",
        },
      ]);
  }

  async function continueFill() {
    setError(null);
    if (!check()) return;
    if (how === "send") {
      suggestParticipant();
      // A prévia serve de base para posicionar as assinaturas.
      if (!previewUrl && !hasTemplateMarks) await refreshPreview();
      setPhase("participants");
      return;
    }
    setBusy("self");
    try {
      const r = await callFunction<{ documentId: string; embedUrl: string }>(
        "documents-from-template",
        {
          ...base(),
          mode: "self",
          ...(hasTemplateMarks ? {} : { marks: marksPayload(["me"], marks) }),
        },
      );
      setResult(r);
      requestId.current = crypto.randomUUID();
      setPhase("signing");
    } catch (e) {
      setBad(fieldProblems(e));
      setError(errorText(t, e));
      setLimitHit(errorCode(e) === "plan_limit_reached");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setError(null);
    const p = validateParticipants(participants, config);
    setProblems(p);
    if (Object.keys(p).length) return setError(t.errors["invalid_participants"]!);
    setBusy("send");
    try {
      const r = await callFunction<{ documentId: string }>("documents-from-template", {
        ...base(),
        mode: "send",
        folderId: folderId || null,
        ...(hasTemplateMarks
          ? {}
          : {
              marks: marksPayload(
                participants.map((p) => p.key),
                marks,
              ),
            }),
        sequential,
        ...(roles.length
          ? {
              roles: Object.fromEntries(
                toPayload(participants).map((p, i) => [String(roles[i]!.slot), p]),
              ),
            }
          : { participants: toPayload(participants) }),
        ...sendOptionsPayload(options),
      });
      setResult(r);
      requestId.current = crypto.randomUUID();
      setPhase("done");
    } catch (e) {
      setError(errorText(t, e));
      setLimitHit(errorCode(e) === "plan_limit_reached");
      if (errorCode(e) === "invalid_participants") setProblems(participantProblems(e));
      if (errorCode(e) === "invalid_fields") {
        setBad(fieldProblems(e));
        setPhase("fill");
      }
    } finally {
      setBusy(null);
    }
  }

  async function signed() {
    if (!result) return;
    setPhase("confirming");
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const { status } = await documentAction<{ status: string }>(result.documentId, "sync");
        if (status === "concluded") break;
      } catch {
        // tenta de novo
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setPhase("done");
  }

  async function download() {
    if (!result) return;
    try {
      const { url } = await documentAction<{ url: string }>(result.documentId, "download");
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setError(errorText(t, e));
      setLimitHit(errorCode(e) === "plan_limit_reached");
    }
  }

  return (
    <>
      <PageHeader title={template.name} subtitle={t.templates.fill.subtitle} />

      {phase === "fill" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="grid content-start gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="doc-name">{t.templates.fill.docName}</Label>
              <Input
                id="doc-name"
                value={name}
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <h2 className="font-display text-lg font-semibold">{t.templates.fill.values}</h2>
            {fillable.map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                value={values[field.key] ?? ""}
                onChange={(v) => setValues((s) => ({ ...s, [field.key]: v }))}
                invalid={bad.includes(field.key)}
                t={t}
              />
            ))}
            <fieldset className="grid gap-2">
              <legend className="mb-2 font-display text-lg font-semibold">
                {t.templates.fill.how}
              </legend>
              {(
                [
                  ["send", Send, t.templates.fill.send, t.templates.fill.sendText],
                  ["self", FilePen, t.templates.fill.self, t.templates.fill.selfText],
                ] as const
              )
                // "Só eu assino" não se aplica a modelos com mais de um participante.
                .filter(([value]) => value === "send" || roles.length <= 1)
                .map(([value, Icon, label, text]) => (
                  <label
                    key={value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4",
                      how === value && "border-brand bg-brand-soft",
                    )}
                  >
                    <input
                      type="radio"
                      name="how"
                      value={value}
                      checked={how === value}
                      onChange={() => setHow(value)}
                      className="mt-1 accent-[var(--color-brand)]"
                    />
                    <Icon className="mt-0.5 size-5 text-brand" aria-hidden />
                    <span>
                      <span className="block font-medium">{label}</span>
                      <span className="text-sm text-muted-foreground">{text}</span>
                    </span>
                  </label>
                ))}
            </fieldset>
            {error && <FormMessage kind="error">{error}</FormMessage>}
            {limitHit && <LimitReachedOffer />}
            <div className="flex flex-wrap gap-3">
              <Button
                className="bg-brand hover:bg-brand-strong"
                onClick={() => void continueFill()}
                disabled={busy !== null}
              >
                {busy === "self" && <Loader2 className="animate-spin" aria-hidden />}
                {how === "self" ? t.templates.fill.signNow : t.templates.fill.continue}
              </Button>
              <Button
                variant="outline"
                onClick={() => void refreshPreview()}
                disabled={busy !== null}
              >
                {busy === "preview" ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Eye aria-hidden />
                )}
                {t.templates.fill.preview}
              </Button>
            </div>
            {how === "self" && !hasTemplateMarks && previewUrl && (
              <details className="rounded-xl border bg-white p-4">
                <summary className="cursor-pointer font-medium">{t.marks.optional}</summary>
                <div className="mt-4">
                  <MarksEditor
                    source={previewUrl}
                    people={[{ key: "me", label: t.marks.me }]}
                    value={marks}
                    onChange={setMarks}
                  />
                </div>
              </details>
            )}
          </div>
          <div className="min-h-[60svh] overflow-hidden rounded-2xl border bg-white shadow-sm">
            {previewUrl ? (
              <iframe
                src={previewUrl}
                title={template.name}
                className="h-[75svh] w-full border-0"
              />
            ) : (
              <p className="p-6 text-sm text-muted-foreground">{t.templates.fill.previewEmpty}</p>
            )}
          </div>
        </div>
      )}

      {phase === "participants" && (
        <div className={hasTemplateMarks ? "grid max-w-3xl gap-6" : "grid max-w-5xl gap-6"}>
          <section className="grid gap-3">
            {folders.length > 0 && (
              <div className="grid gap-1.5">
                <Label htmlFor="tpl-folder">{t.folders.field}</Label>
                <select
                  id="tpl-folder"
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
            <h2 className="font-display text-lg font-semibold">{t.participants.title}</h2>
            <ParticipantsEditor
              labels={roles.length ? roles.map((r) => r.label) : undefined}
              value={participants}
              onChange={setParticipants}
              config={config}
              problems={problems}
            />
          </section>
          <section className="grid gap-3">
            <h2 className="font-display text-lg font-semibold">{t.send.steps[2]}</h2>
            <FlowEditor
              fixedOrder={roles.length > 0}
              value={participants}
              onChange={setParticipants}
              sequential={sequential}
              onSequentialChange={setSequential}
              config={config}
              problems={problems}
            />
          </section>
          <section className="grid gap-3">
            <h2 className="font-display text-lg font-semibold">{t.send.steps[3]}</h2>
            <SendOptions value={options} onChange={setOptions} />
          </section>
          {!hasTemplateMarks && previewUrl && (
            <section className="grid gap-3">
              <h2 className="font-display text-lg font-semibold">{t.marks.title}</h2>
              <MarksEditor
                source={previewUrl}
                people={participants
                  .filter((p) => p.role !== "approver")
                  .map((p) => ({ key: p.key, label: p.name || p.email }))}
                value={marks}
                onChange={setMarks}
              />
            </section>
          )}
          <p className="text-sm text-muted-foreground">{t.send.review.consumption}</p>
          {error && <FormMessage kind="error">{error}</FormMessage>}
          {limitHit && <LimitReachedOffer />}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setPhase("fill")} disabled={busy !== null}>
              {t.send.back}
            </Button>
            <Button
              className="bg-brand hover:bg-brand-strong"
              onClick={() => void send()}
              disabled={busy !== null}
            >
              {busy === "send" && <Loader2 className="animate-spin" aria-hidden />}
              {busy === "send" ? t.send.sending : t.send.submit}
            </Button>
          </div>
        </div>
      )}

      {phase === "signing" && result?.embedUrl && (
        <>
          <SigningFrame
            embedUrl={result.embedUrl}
            onSigned={() => void signed()}
            onError={() => setError(t.errors["widget"]!)}
          />
          {error && <FormMessage kind="error">{error}</FormMessage>}
          {limitHit && <LimitReachedOffer />}
        </>
      )}

      {phase === "confirming" && (
        <p className="flex items-center gap-2 text-muted-foreground" role="status">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          {t.sign.confirming}
        </p>
      )}

      {phase === "done" && result && (
        <div className="grid max-w-xl gap-4 rounded-2xl border bg-white p-6 shadow-sm">
          <CheckCircle2 className="size-12 text-success" aria-hidden />
          <div>
            <h2 className="font-display text-xl font-semibold">
              {how === "self" ? t.sign.done : t.send.done}
            </h2>
            <p className="mt-1 text-muted-foreground">
              {how === "self" ? t.sign.doneText : t.send.doneText}
            </p>
          </div>
          {error && <FormMessage kind="error">{error}</FormMessage>}
          {limitHit && <LimitReachedOffer />}
          <div className="flex flex-wrap gap-3">
            {how === "self" && (
              <Button onClick={() => void download()} className="bg-brand hover:bg-brand-strong">
                <Download aria-hidden />
                {t.sign.download}
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/app/documents/$id" params={{ id: result.documentId }}>
                {t.sign.view}
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/app/templates">{t.nav.templates}</Link>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
