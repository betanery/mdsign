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
  formatPhone,
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

type ProfileBasics = { full_name: string | null; cpf: string | null };

function OrgGate() {
  const { loading, organizations } = useOrg();
  const { user } = useAuth();
  // undefined = carregando.
  const [profile, setProfile] = useState<ProfileBasics | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, cpf")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) =>
        setProfile({ full_name: data?.full_name ?? null, cpf: data?.cpf ?? null }),
      );
  }, [user]);

  if (loading || profile === undefined) return <FullScreenLoading />;
  if (organizations.length === 0) return <Onboarding />;
  // Nome e CPF são obrigatórios para assinar (o CPF é o `identifier` do signatário no motor).
  if (!profile.full_name?.trim() || !profile.cpf)
    return <ConfirmProfile initial={profile} onDone={setProfile} />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

/** Confirma nome e CPF antes de entrar no app (PRD §50: "confirmar perfil"). */
function ConfirmProfile({
  initial,
  onDone,
}: {
  initial: ProfileBasics;
  onDone: (profile: ProfileBasics) => void;
}) {
  const { t } = useAppI18n();
  const { user } = useAuth();
  const [fullName, setFullName] = useState(initial.full_name ?? "");
  const [cpf, setCpf] = useState(formatCpf(initial.cpf ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    if (!isValidCpf(cpf)) {
      setError(t.settings.cpfInvalid);
      return;
    }
    setBusy(true);
    setError(null);
    const next = { full_name: fullName.trim(), cpf: onlyDigits(cpf) };
    const { error: err } = await supabase.from("profiles").update(next).eq("id", user.id);
    setBusy(false);
    if (err) setError(friendlyError(err, t));
    else onDone(next);
  }

  return (
    <AuthLayout title={t.onboarding.confirmProfileTitle} subtitle={t.settings.profileText}>
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-1.5">
          <Label htmlFor="cp-name">{t.settings.fullName}</Label>
          <Input
            id="cp-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            minLength={2}
            maxLength={160}
            autoComplete="name"
            autoFocus
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cp-cpf">{t.settings.cpf}</Label>
          <Input
            id="cp-cpf"
            inputMode="numeric"
            required
            value={cpf}
            onChange={(e) => setCpf(formatCpf(e.target.value))}
            placeholder="000.000.000-00"
            aria-describedby="cp-cpf-hint"
          />
          <p id="cp-cpf-hint" className="text-xs text-muted-foreground">
            {t.settings.cpfRequiredHint}
          </p>
        </div>
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <Button type="submit" size="lg" disabled={busy} className="bg-brand hover:bg-brand-strong">
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {t.common.save}
        </Button>
      </form>
    </AuthLayout>
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
  const [phone, setPhone] = useState("");
  // Nome da organização: começa com o nome da pessoa (dá para trocar depois).
  const [orgName, setOrgName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Preenche o que já sabemos do cadastro.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, cpf, phone")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setFullName(data?.full_name ?? "");
        setCpf(formatCpf(data?.cpf ?? ""));
        setPhone(data?.phone ? formatPhone(data.phone) : "");
      });
  }, [user]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = (orgName ?? fullName).trim();
    if (!isValidCpf(cpf)) {
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
      .update({
        full_name: fullName.trim(),
        cpf: onlyDigits(cpf),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      })
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
            <Label htmlFor="me-cpf">{t.settings.cpf}</Label>
            <Input
              id="me-cpf"
              inputMode="numeric"
              required
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              placeholder="000.000.000-00"
              aria-describedby="me-cpf-hint"
            />
            <p id="me-cpf-hint" className="text-xs text-muted-foreground">
              {t.settings.cpfRequiredHint}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="me-phone">
              {t.onboarding.phone}{" "}
              <span className="text-muted-foreground">({t.common.optional})</span>
            </Label>
            <Input
              id="me-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="(61) 99999-9999"
            />
          </div>
        </fieldset>
        <fieldset className="grid gap-4 border-t pt-4">
          <legend className="mb-1 font-display font-semibold">{t.onboarding.orgStep}</legend>
          <div className="grid gap-1.5">
            <Label htmlFor="org-name">{t.onboarding.orgName}</Label>
            <Input
              id="org-name"
              name="name"
              value={orgName ?? fullName}
              onChange={(e) => setOrgName(e.target.value)}
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
