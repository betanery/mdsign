import { useEffect, useState } from "react";
import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/app/auth";
import { AppShell } from "@/app/components/app-shell";
import { AuthLayout, FormMessage } from "@/app/components/auth-layout";
import { useAppI18n } from "@/app/i18n";
import { OrgProvider, useOrg } from "@/app/org";
import { formatCnpj, friendlyError, isValidCnpj, onlyDigits } from "@/app/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { track } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";

// Área logada do app: exige sessão e uma organização (PRD §50).
export const Route = createFileRoute("/app/_shell")({
  // Sem sessão, vai para o login lembrando a página pedida.
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/app/login", search: { redirect: location.href } });
  },
  component: Shell,
});

function FullScreenLoading() {
  const { t } = useAppI18n();
  return (
    <div
      className="flex min-h-svh items-center justify-center gap-2 text-muted-foreground"
      role="status"
    >
      <Loader2 className="size-5 animate-spin" aria-hidden />
      {t.common.loading}
    </div>
  );
}

function Shell() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  // Saiu da conta com a área aberta: volta para o login.
  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/app/login" });
  }, [loading, session, navigate]);

  if (loading || !session) return <FullScreenLoading />;
  return (
    <OrgProvider>
      <OrgGate />
    </OrgProvider>
  );
}

function OrgGate() {
  const { loading, organizations } = useOrg();
  if (loading) return <FullScreenLoading />;
  if (organizations.length === 0) return <Onboarding />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

/** Primeiro acesso: cria a organização com o mínimo necessário (PRD §50). */
function Onboarding() {
  const { t } = useAppI18n();
  const { refresh, setCurrent } = useOrg();
  const [cnpj, setCnpj] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    if (cnpj && !isValidCnpj(cnpj)) {
      setError(t.onboarding.cnpjInvalid);
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("create_organization", {
      org_name: name,
      org_cnpj: cnpj ? onlyDigits(cnpj) : null,
    });
    if (err) {
      setError(friendlyError(err, t));
      setBusy(false);
      return;
    }
    track("organization_created");
    setCurrent(data as string);
    await refresh();
  }

  return (
    <AuthLayout title={t.onboarding.title} subtitle={t.onboarding.subtitle}>
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-1.5">
          <Label htmlFor="org-name">{t.onboarding.orgName}</Label>
          <Input
            id="org-name"
            name="name"
            required
            minLength={2}
            maxLength={160}
            placeholder={t.onboarding.orgNamePlaceholder}
            autoFocus
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="org-cnpj">
            {t.onboarding.cnpj} <span className="text-muted-foreground">({t.common.optional})</span>
          </Label>
          <Input
            id="org-cnpj"
            inputMode="numeric"
            value={cnpj}
            onChange={(e) => setCnpj(formatCnpj(e.target.value))}
            placeholder="00.000.000/0000-00"
          />
        </div>
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <Button type="submit" size="lg" disabled={busy} className="bg-brand hover:bg-brand-strong">
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {t.onboarding.create}
        </Button>
      </form>
    </AuthLayout>
  );
}
