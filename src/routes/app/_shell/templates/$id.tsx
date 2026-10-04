import { useEffect, useRef, useState } from "react";
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
import { SigningFrame } from "@/app/components/signing-frame";
import {
  FieldInput,
  templateSelect,
  validateValues,
  type TemplateRow,
} from "@/app/components/template-fields";
import { errorCode, errorText, fieldProblems, participantProblems } from "@/app/errors";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { formatCpf } from "@/app/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// Criar a partir de modelo (PRD §13): preencher → prévia → Só eu assino ou Enviar.
export const Route = createFileRoute("/app/_shell/templates/$id")({ component: UseTemplate });

type Phase = "fill" | "participants" | "signing" | "confirming" | "done";

function UseTemplate() {
  const { id } = Route.useParams();
  const { t, locale } = useAppI18n();
  const { current } = useOrg();
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
  const [participants, setParticipants] = useState<ParticipantDraft[]>([newParticipant()]);
  const [sequential, setSequential] = useState(true);
  const [options, setOptions] = useState<SendOptionsValue>(() => defaultSendOptions(locale));
  const [problems, setProblems] = useState<Record<number, string[]>>({});
  const [result, setResult] = useState<{ documentId: string; embedUrl?: string } | null>(null);
  const preview = useRef<string | null>(null);

  useEffect(() => {
    supabase
      .from("templates")
      .select(templateSelect)
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as TemplateRow | null;
        setTpl(row);
        if (row) setName(row.name);
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

  const base = () => ({
    organizationId: current.id,
    templateId: template.id,
    values,
    name: name.trim(),
  });

  function check() {
    const missing = validateValues(template.fields, values);
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
      setPhase("participants");
      return;
    }
    setBusy("self");
    try {
      const r = await callFunction<{ documentId: string; embedUrl: string }>(
        "documents-from-template",
        { ...base(), mode: "self" },
      );
      setResult(r);
      setPhase("signing");
    } catch (e) {
      setBad(fieldProblems(e));
      setError(errorText(t, e));
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
        sequential,
        participants: toPayload(participants),
        ...sendOptionsPayload(options),
      });
      setResult(r);
      setPhase("done");
    } catch (e) {
      setError(errorText(t, e));
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
            {template.fields.map((field) => (
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
              ).map(([value, Icon, label, text]) => (
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
        <div className="grid max-w-3xl gap-6">
          <section className="grid gap-3">
            <h2 className="font-display text-lg font-semibold">{t.participants.title}</h2>
            <ParticipantsEditor
              value={participants}
              onChange={setParticipants}
              config={config}
              problems={problems}
            />
          </section>
          <section className="grid gap-3">
            <h2 className="font-display text-lg font-semibold">{t.send.steps[2]}</h2>
            <FlowEditor
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
          <p className="text-sm text-muted-foreground">{t.send.review.consumption}</p>
          {error && <FormMessage kind="error">{error}</FormMessage>}
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
