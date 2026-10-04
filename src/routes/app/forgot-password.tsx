import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { AuthLayout, FormMessage } from "@/app/components/auth-layout";
import { useAppI18n } from "@/app/i18n";
import { friendlyError } from "@/app/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/app/forgot-password")({ component: ForgotPassword });

function ForgotPassword() {
  const { t } = useAppI18n();
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email")).trim();
    setState("busy");
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/app/reset-password`,
    });
    // A mensagem é a mesma exista ou não a conta (proteção contra enumeração, PRD §43).
    if (err && /rate limit/i.test(err.message)) {
      setError(friendlyError(err, t));
      setState("idle");
      return;
    }
    setState("sent");
  }

  return (
    <AuthLayout
      title={t.auth.forgotTitle}
      subtitle={t.auth.forgotSubtitle}
      footer={
        <Link to="/app/login" className="font-semibold text-brand">
          {t.common.back}
        </Link>
      }
    >
      {state === "sent" ? (
        <FormMessage kind="success">{t.auth.linkSent}</FormMessage>
      ) : (
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-1.5">
            <Label htmlFor="email">{t.auth.email}</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" autoFocus />
          </div>
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <Button
            type="submit"
            size="lg"
            disabled={state === "busy"}
            className="bg-brand hover:bg-brand-strong"
          >
            {state === "busy" && <Loader2 className="animate-spin" aria-hidden />}
            {t.auth.sendLink}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
