import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

import { callPublicFunction } from "@/app/api";
import { FormMessage } from "@/app/components/auth-layout";
import { LanguageSelect, SkipLink } from "@/app/components/language-select";
import { SigningFrame } from "@/app/components/signing-frame";
import { FieldInput, validateValues, type TemplateField } from "@/app/components/template-fields";
import { errorText } from "@/app/errors";
import { AppI18nProvider, useAppI18n } from "@/app/i18n";
import { formatCpf, isValidCpf, onlyDigits } from "@/app/validation";
import { Logo } from "@/components/landing/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Formulário / link público (PRD §14): a pessoa preenche, gera o documento e assina, sem conta.
export const Route = createFileRoute("/f/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "MDSign" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: () => (
    <AppI18nProvider>
      <PublicForm />
    </AppI18nProvider>
  ),
});

type Config = {
  name: string;
  organization: string;
  locale: string;
  fields: TemplateField[];
  foreignSigners: boolean;
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function PublicForm() {
  const { token } = Route.useParams();
  const { t, f } = useAppI18n();
  const [config, setConfig] = useState<Config | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [signer, setSigner] = useState({ name: "", email: "", cpf: "", noCpf: false });
  const [values, setValues] = useState<Record<string, string>>({});
  const [website, setWebsite] = useState("");
  const [bad, setBad] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"fill" | "preparing" | "signing" | "done">("fill");
  const [embed, setEmbed] = useState<{ embedUrl: string; redirectUrl: string | null } | null>(null);

  useEffect(() => {
    callPublicFunction<Config>("public-form", { token, action: "config" })
      .then(setConfig)
      .catch((e) => setFatal(errorText(t, e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    const problems: string[] = [];
    if (signer.name.trim().length < 2) problems.push("signer.name");
    if (!EMAIL.test(signer.email.trim())) problems.push("signer.email");
    if (signer.noCpf ? !config.foreignSigners : !isValidCpf(signer.cpf))
      problems.push("signer.cpf");
    problems.push(...validateValues(config.fields, values));
    setBad(problems);
    if (problems.length) return setError(t.errors["invalid_fields"]!);
    setError(null);
    setPhase("preparing");
    try {
      const r = await callPublicFunction<{ embedUrl: string; redirectUrl: string | null }>(
        "public-form",
        {
          token,
          action: "submit",
          website,
          signer: {
            name: signer.name.trim(),
            email: signer.email.trim().toLowerCase(),
            cpf: signer.noCpf ? null : onlyDigits(signer.cpf),
            noCpf: signer.noCpf,
          },
          values,
        },
      );
      setEmbed(r);
      setPhase("signing");
    } catch (err) {
      setError(errorText(t, err));
      setPhase("fill");
    }
  }

  function signed() {
    setPhase("done");
    if (embed?.redirectUrl) setTimeout(() => window.location.assign(embed.redirectUrl!), 2500);
  }

  return (
    <div className="flex min-h-svh flex-col bg-[#f6f5f9]">
      <SkipLink />
      <header className="flex items-center justify-between border-b bg-white px-4 py-3 sm:px-8">
        <Logo />
        <LanguageSelect />
      </header>
      <main
        id="conteudo"
        className={cn(
          "mx-auto w-full flex-1 px-4 py-8",
          // A cerimônia de assinatura precisa de mais largura que o formulário.
          phase === "signing" ? "max-w-4xl" : "max-w-xl",
        )}
      >
        {fatal ? (
          <section className="grid gap-3">
            <h1 className="text-2xl font-bold">{t.publicForm.unavailable}</h1>
            <FormMessage kind="error">{fatal}</FormMessage>
          </section>
        ) : !config ? (
          <p className="flex items-center gap-2 text-muted-foreground" role="status">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            {t.common.loading}
          </p>
        ) : (
          <>
            <h1 className="text-2xl font-bold sm:text-3xl">{config.name}</h1>
            <p className="mt-1 text-muted-foreground">
              {phase === "signing"
                ? t.publicForm.signHere
                : f(t.publicForm.intro, { org: config.organization })}
            </p>

            {(phase === "fill" || phase === "preparing") && (
              <form onSubmit={(e) => void submit(e)} className="mt-6 grid gap-6" noValidate>
                <fieldset className="grid gap-3 rounded-2xl border bg-white p-5 shadow-sm">
                  <legend className="sr-only">{t.publicForm.yourData}</legend>
                  <h2 aria-hidden className="font-display text-lg font-semibold">
                    {t.publicForm.yourData}
                  </h2>
                  <div className="grid gap-1.5">
                    <Label htmlFor="s-name">{t.participants.name}</Label>
                    <Input
                      id="s-name"
                      autoComplete="name"
                      value={signer.name}
                      onChange={(e) => setSigner({ ...signer, name: e.target.value })}
                      aria-invalid={bad.includes("signer.name")}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="s-email">{t.participants.email}</Label>
                    <Input
                      id="s-email"
                      type="email"
                      autoComplete="email"
                      value={signer.email}
                      onChange={(e) => setSigner({ ...signer, email: e.target.value })}
                      aria-invalid={bad.includes("signer.email")}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="s-cpf">{t.participants.cpf}</Label>
                    <Input
                      id="s-cpf"
                      inputMode="numeric"
                      value={signer.noCpf ? "" : signer.cpf}
                      disabled={signer.noCpf}
                      onChange={(e) => setSigner({ ...signer, cpf: formatCpf(e.target.value) })}
                      aria-invalid={bad.includes("signer.cpf")}
                    />
                    {config.foreignSigners && (
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={signer.noCpf}
                          onChange={(e) => setSigner({ ...signer, noCpf: e.target.checked })}
                          className="size-4 accent-[var(--color-brand)]"
                        />
                        {t.participants.noCpf}
                      </label>
                    )}
                  </div>
                </fieldset>

                {config.fields.length > 0 && (
                  <fieldset className="grid gap-3 rounded-2xl border bg-white p-5 shadow-sm">
                    <legend className="sr-only">{t.publicForm.fields}</legend>
                    <h2 aria-hidden className="font-display text-lg font-semibold">
                      {t.publicForm.fields}
                    </h2>
                    {config.fields.map((field) => (
                      <FieldInput
                        key={field.key}
                        field={field}
                        value={values[field.key] ?? ""}
                        onChange={(v) => setValues((s) => ({ ...s, [field.key]: v }))}
                        invalid={bad.includes(field.key)}
                        t={t}
                      />
                    ))}
                  </fieldset>
                )}

                {/* Honeypot: invisível para pessoas; robôs costumam preencher. */}
                <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label>
                    Website
                    <input
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </label>
                </div>

                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  {t.publicForm.privacy}
                </p>
                {error && <FormMessage kind="error">{error}</FormMessage>}
                <Button
                  type="submit"
                  size="lg"
                  className="w-fit bg-brand hover:bg-brand-strong"
                  disabled={phase === "preparing"}
                >
                  {phase === "preparing" && <Loader2 className="animate-spin" aria-hidden />}
                  {phase === "preparing" ? t.publicForm.preparing : t.publicForm.continue}
                </Button>
              </form>
            )}

            {phase === "signing" && embed && (
              <div className="mt-6">
                <SigningFrame
                  embedUrl={embed.embedUrl}
                  onSigned={signed}
                  onError={() => setError(t.errors["widget"]!)}
                />
                {error && <FormMessage kind="error">{error}</FormMessage>}
              </div>
            )}

            {phase === "done" && (
              <div className="mt-6 grid gap-3 rounded-2xl border bg-white p-6 shadow-sm">
                <CheckCircle2 className="size-12 text-success" aria-hidden />
                <h2 className="font-display text-xl font-semibold">{t.publicForm.done}</h2>
                <p className="text-muted-foreground">{t.publicForm.doneText}</p>
              </div>
            )}
          </>
        )}
      </main>
      <footer className="py-6 text-center text-xs text-muted-foreground">
        {t.publicForm.poweredBy}
      </footer>
    </div>
  );
}
