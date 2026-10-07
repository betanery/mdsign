import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { PasswordInput } from "@/app/components/password-input";

import { useAuth } from "@/app/auth";
import { AuthLayout, FormMessage } from "@/app/components/auth-layout";
import { useAppI18n } from "@/app/i18n";
import { friendlyError } from "@/app/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

type Search = { redirect?: string };

export const Route = createFileRoute("/app/login")({
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search["redirect"] === "string" && search["redirect"].startsWith("/app")
      ? { redirect: search["redirect"] }
      : {},
  component: Login,
});

function Login() {
  const { t } = useAppI18n();
  const { session, loading } = useAuth();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) void navigate({ to: redirect ?? "/app" });
  }, [loading, session, redirect, navigate]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
    });
    setBusy(false);
    if (err) setError(friendlyError(err, t));
  }

  return (
    <AuthLayout
      title={t.auth.loginTitle}
      subtitle={t.auth.loginSubtitle}
      footer={
        <>
          {t.auth.noAccount}{" "}
          <Link
            to="/app/signup"
            search={redirect ? { redirect } : {}}
            className="font-semibold text-brand"
          >
            {t.auth.signup}
          </Link>
        </>
      }
    >
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-1.5">
          <Label htmlFor="email">{t.auth.email}</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" autoFocus />
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t.auth.password}</Label>
            <Link to="/app/forgot-password" className="text-sm text-brand">
              {t.auth.forgot}
            </Link>
          </div>
          <PasswordInput id="password" name="password" required autoComplete="current-password" />
        </div>
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <Button type="submit" size="lg" disabled={busy} className="bg-brand hover:bg-brand-strong">
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {t.auth.login}
        </Button>
      </form>
    </AuthLayout>
  );
}
