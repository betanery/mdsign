import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { AuthLayout, FormMessage } from "@/app/components/auth-layout";
import { useAppI18n } from "@/app/i18n";
import { PasswordFields, validatePassword } from "@/app/password";
import { friendlyError } from "@/app/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

// Aberta pelo link do e-mail de recuperação: o Supabase cria a sessão a partir da URL.
export const Route = createFileRoute("/app/reset-password")({ component: ResetPassword });

function ResetPassword() {
  const { t } = useAppI18n();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const invalid = validatePassword(form, t);
    if (invalid) {
      setError(invalid);
      return;
    }
    const password = String(form.get("password"));
    setError(null);
    setState("busy");
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(friendlyError(err, t));
      setState("idle");
      return;
    }
    setState("done");
  }

  return (
    <AuthLayout title={t.auth.resetTitle}>
      {state === "done" ? (
        <div className="grid gap-4">
          <FormMessage kind="success">{t.auth.resetDone}</FormMessage>
          <Link to="/app" className="text-center font-semibold text-brand">
            {t.nav.home}
          </Link>
        </div>
      ) : (
        <form className="grid gap-4" onSubmit={onSubmit}>
          <PasswordFields label={t.auth.newPassword} autoFocus />
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <Button
            type="submit"
            size="lg"
            disabled={state === "busy"}
            className="bg-brand hover:bg-brand-strong"
          >
            {state === "busy" && <Loader2 className="animate-spin" aria-hidden />}
            {t.common.save}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
