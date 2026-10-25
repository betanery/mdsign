import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { formatDay } from "@/app/documents";

import { CURRENT_ORG_KEY, useAuth } from "@/app/auth";
import { AuthLayout, FormMessage } from "@/app/components/auth-layout";
import { useAppI18n } from "@/app/i18n";
import { friendlyError } from "@/app/validation";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

// Link de convite: a pessoa entra (ou cria conta) com o e-mail convidado e aceita. A página
// mostra quem convidou e, se não der para aceitar, o motivo (já usado, expirado, outro e-mail).

type Preview = {
  status: "valid" | "used" | "expired" | "not_found";
  organization?: string;
  role?: string;
  expires_at?: string;
  email_hint?: string;
  email_match?: boolean;
  already_member?: boolean;
};
export const Route = createFileRoute("/app/invite/$token")({ component: AcceptInvite });

function AcceptInvite() {
  const { token } = Route.useParams();
  const { t, f, locale } = useAppI18n();
  const { session, loading, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const here = `/app/invite/${token}`;

  // Situação do convite (recarrega quando a pessoa entra ou sai).
  useEffect(() => {
    if (loading) return;
    let alive = true;
    void supabase.rpc("invitation_preview", { invite_token: token }).then(({ data, error: e }) => {
      if (alive) setPreview(e ? { status: "not_found" } : (data as Preview));
    });
    return () => {
      alive = false;
    };
  }, [token, loading, session?.user.id]);

  async function accept() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("accept_invitation", { invite_token: token });
    if (err) {
      setError(friendlyError(err, t));
      setBusy(false);
      return;
    }
    openOrg(data as string);
  }

  function openOrg(orgId?: string) {
    try {
      if (orgId) localStorage.setItem(CURRENT_ORG_KEY, orgId);
    } catch {
      // armazenamento indisponível
    }
    void navigate({ to: "/app" });
  }

  const org = preview?.organization ?? "";
  const role = preview?.role ? (t.roles[preview.role as keyof typeof t.roles] ?? preview.role) : "";
  const problem =
    preview?.status === "used"
      ? t.invite.used
      : preview?.status === "expired"
        ? f(t.invite.expired, { date: formatDay(preview.expires_at ?? "", locale) })
        : preview?.status === "not_found"
          ? t.invite.notFound
          : null;

  return (
    <AuthLayout title={t.invite.title}>
      {loading || !preview ? (
        <p className="flex items-center gap-2 text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t.common.loading}
        </p>
      ) : (
        <div className="grid gap-4">
          {org && <p className="font-medium">{f(t.invite.from, { org, role })}</p>}
          {preview.already_member ? (
            <>
              <FormMessage kind="success">{f(t.invite.alreadyMember, { org })}</FormMessage>
              <Button
                size="lg"
                className="bg-brand hover:bg-brand-strong"
                onClick={() => openOrg()}
              >
                {f(t.invite.open, { org })}
              </Button>
            </>
          ) : problem ? (
            <FormMessage kind="error">{problem}</FormMessage>
          ) : !session ? (
            <>
              <p className="text-sm text-muted-foreground">
                {f(t.invite.useEmail, { email: preview.email_hint ?? "" })}
              </p>
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
            </>
          ) : !preview.email_match ? (
            <>
              <FormMessage kind="error">
                {f(t.invite.otherEmail, {
                  email: preview.email_hint ?? "",
                  me: user?.email ?? "",
                })}
              </FormMessage>
              <Button
                variant="outline"
                onClick={() =>
                  void signOut().then(() =>
                    navigate({ to: "/app/login", search: { redirect: here } }),
                  )
                }
              >
                {t.invite.switchAccount}
              </Button>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </AuthLayout>
  );
}
