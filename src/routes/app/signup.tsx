import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { AuthLayout, FormMessage } from "@/app/components/auth-layout";
import { useAppI18n } from "@/app/i18n";
import { PasswordFields, validatePassword } from "@/app/password";
import { friendlyError } from "@/app/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { getAcquisitionPayload, track, trackGrowth } from "@/lib/analytics";

// Versão do texto dos termos aceita no cadastro (fica gravada com o aceite).
const TERMS_VERSION = "2026-10";

type Search = { redirect?: string };

export const Route = createFileRoute("/app/signup")({
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search["redirect"] === "string" && search["redirect"].startsWith("/app")
      ? { redirect: search["redirect"] }
      : {},
  component: Signup,
});

function Signup() {
  const { t, locale } = useAppI18n();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    trackGrowth("signup_started", { lang: locale });
  }, [locale]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const invalid = validatePassword(form, t);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!form.get("terms")) {
      setError(t.auth.termsRequired);
      return;
    }
    const password = String(form.get("password"));
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email: String(form.get("email")).trim(),
      password,
      options: {
        // Origem da campanha e aceites vão no cadastro: ficam gravados no servidor antes mesmo
        // da confirmação do e-mail. Marketing é opcional e separado dos termos.
        data: {
          full_name: String(form.get("name")).trim(),
          locale,
          terms_version: TERMS_VERSION,
          marketing_opt_in: form.get("marketing") === "on",
          acq: getAcquisitionPayload(),
        },
        emailRedirectTo: `${window.location.origin}${redirect ?? "/app"}`,
      },
    });
    setBusy(false);
    if (err) {
      setError(friendlyError(err, t));
      return;
    }
    track("signup", { lang: locale });
    // Com confirmação de e-mail ligada, ainda não há sessão: pedimos para abrir o e-mail.
    if (data.session) void navigate({ to: redirect ?? "/app" });
    else setSent(true);
  }

  return (
    <AuthLayout
      title={t.auth.signupTitle}
      subtitle={t.auth.signupSubtitle}
      footer={
        <>
          {t.auth.hasAccount}{" "}
          <Link
            to="/app/login"
            search={redirect ? { redirect } : {}}
            className="font-semibold text-brand"
          >
            {t.auth.login}
          </Link>
        </>
      }
    >
      {sent ? (
        <FormMessage kind="success">{t.auth.checkEmail}</FormMessage>
      ) : (
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-1.5">
            <Label htmlFor="name">{t.auth.name}</Label>
            <Input id="name" name="name" required autoComplete="name" autoFocus maxLength={160} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="email">{t.auth.email}</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <PasswordFields label={t.auth.password} />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="terms"
              required
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
            />
            <span>
              {t.auth.acceptTerms.split(/(\{terms\}|\{privacy\})/).map((part) =>
                part === "{terms}" || part === "{privacy}" ? (
                  <a
                    key={part}
                    href={`/${locale}/${part === "{terms}" ? "termos" : "privacidade"}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-brand underline-offset-2 hover:underline"
                  >
                    {part === "{terms}" ? t.auth.termsLink : t.auth.privacyLink}
                  </a>
                ) : (
                  part
                ),
              )}
            </span>
          </label>
          <p className="-mt-2 pl-6 text-xs text-muted-foreground">
            <a
              href={`/${locale}/condicoes-cedro`}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              {t.cedro.conditions}
            </a>
          </p>
          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              name="marketing"
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
            />
            <span>{t.auth.marketingOptIn}</span>
          </label>
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <Button
            type="submit"
            size="lg"
            disabled={busy}
            className="bg-brand hover:bg-brand-strong"
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {t.auth.signupFree}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
