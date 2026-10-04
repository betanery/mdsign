import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { CURRENT_ORG_KEY, useAuth } from "@/app/auth";
import { AuthLayout, FormMessage } from "@/app/components/auth-layout";
import { useAppI18n } from "@/app/i18n";
import { friendlyError } from "@/app/validation";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

// Link de convite: a pessoa entra (ou cria conta) com o e-mail convidado e aceita.
export const Route = createFileRoute("/app/invite/$token")({ component: AcceptInvite });

function AcceptInvite() {
  const { token } = Route.useParams();
  const { t } = useAppI18n();
  const { session, loading, user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const here = `/app/invite/${token}`;

  async function accept() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("accept_invitation", { invite_token: token });
    if (err) {
      setError(friendlyError(err, t));
      setBusy(false);
      return;
    }
    try {
      localStorage.setItem(CURRENT_ORG_KEY, data as string);
    } catch {
      // armazenamento indisponível
    }
    void navigate({ to: "/app" });
  }

  return (
    <AuthLayout title={t.invite.title}>
      {loading ? (
        <p className="text-muted-foreground">{t.common.loading}</p>
      ) : !session ? (
        <div className="grid gap-4">
          <p>{t.invite.loginFirst}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="bg-brand hover:bg-brand-strong">
              <Link to="/app/login" search={{ redirect: here }}>
                {t.auth.login}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/app/signup" search={{ redirect: here }}>
                {t.auth.signup}
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <Button
            onClick={() => void accept()}
            disabled={busy}
            size="lg"
            className="bg-brand hover:bg-brand-strong"
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {t.invite.accept}
          </Button>
        </div>
      )}
    </AuthLayout>
  );
}
