import { useEffect, useState } from "react";
import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/app/auth";
import { AppShell } from "@/app/components/app-shell";
import { AuthLayout, FormMessage } from "@/app/components/auth-layout";
import { useAppI18n } from "@/app/i18n";
import { OrgProvider, useOrg } from "@/app/org";
import {
  formatCnpj,
  formatCpf,
  friendlyError,
  isValidCnpj,
  isValidCpf,
  onlyDigits,
} from "@/app/validation";
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

/** Primeiro acesso: confirma o perfil e cria a organização (PRD §50). */
function Onboarding() {
  const { t } = useAppI18n();
  const { user } = useAuth();
  const { refresh, setCurrent } = useOrg();
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Preenche o que já sabemos do cadastro.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, cpf")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setFullName(data?.full_name ?? "");
        setCpf(formatCpf(data?.cpf ?? ""));
      });
  }, [user]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    if (cpf && !isValidCpf(cpf)) {
      setError(t.settings.cpfInvalid);
      return;
    }
    if (cnpj && !isValidCnpj(cnpj)) {
      setError(t.onboarding.cnpjInvalid);
      return;
    }
    if (!user) return;
    setBusy(true);
    setError(null);
    const profile = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() || null, cpf: cpf ? onlyDigits(cpf) : null })
      .eq("id", user.id);
    if (profile.error) {
      setError(friendlyError(profile.error, t));
      setBusy(false);
      return;
    }
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
        <fieldset className="grid gap-4">
          <legend className="mb-1 font-display font-semibold">{t.onboarding.profileStep}</legend>
          <div className="grid gap-1.5">
            <Label htmlFor="me-name">{t.settings.fullName}</Label>
            <Input
              id="me-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
              maxLength={160}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="me-cpf">
              {t.settings.cpf} <span className="text-muted-foreground">({t.common.optional})</span>
            </Label>
            <Input
              id="me-cpf"
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              placeholder="000.000.000-00"
              aria-describedby="me-cpf-hint"
            />
            <p id="me-cpf-hint" className="text-xs text-muted-foreground">
              {t.settings.profileText}
            </p>
          </div>
        </fieldset>
        <fieldset className="grid gap-4 border-t pt-4">
          <legend className="mb-1 font-display font-semibold">{t.onboarding.orgStep}</legend>
          <div className="grid gap-1.5">
            <Label htmlFor="org-name">{t.onboarding.orgName}</Label>
            <Input
              id="org-name"
              name="name"
              required
              minLength={2}
              maxLength={160}
              placeholder={t.onboarding.orgNamePlaceholder}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="org-cnpj">
              {t.onboarding.cnpj}{" "}
              <span className="text-muted-foreground">({t.common.optional})</span>
            </Label>
            <Input
              id="org-cnpj"
              inputMode="numeric"
              value={cnpj}
              onChange={(e) => setCnpj(formatCnpj(e.target.value))}
              placeholder="00.000.000/0000-00"
            />
          </div>
        </fieldset>
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <Button type="submit" size="lg" disabled={busy} className="bg-brand hover:bg-brand-strong">
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {t.onboarding.create}
        </Button>
      </form>
    </AuthLayout>
  );
}
