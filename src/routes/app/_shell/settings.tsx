import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { useAuth } from "@/app/auth";
import { PageHeader } from "@/app/components/app-shell";
import { FormMessage } from "@/app/components/auth-layout";
import { LanguageSelect } from "@/app/components/language-select";
import { MfaSettings } from "@/app/components/mfa";
import { useAppI18n } from "@/app/i18n";
import { formatCpf, formatPhone, friendlyError, isValidCpf, onlyDigits } from "@/app/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/app/_shell/settings")({ component: SettingsPage });

function SettingsPage() {
  const { t, locale } = useAppI18n();
  const { user, signOut } = useAuth();
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

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
        setPhone(formatPhone(data?.phone ?? ""));
      });
  }, [user]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    if (!isValidCpf(cpf)) {
      setError(t.settings.cpfInvalid);
      return;
    }
    setError(null);
    const { error: err } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        cpf: onlyDigits(cpf),
        phone: phone.trim() || null,
      })
      .eq("id", user.id);
    if (err) setError(friendlyError(err, t));
    else toast.success(t.common.saved);
  }

  return (
    <>
      <PageHeader title={t.settings.title} />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <form
          onSubmit={save}
          data-tour="settings-profile"
          className="grid gap-4 rounded-2xl border bg-white p-5 shadow-sm"
        >
          <div>
            <h2 className="font-display text-lg font-semibold">{t.settings.profile}</h2>
            <p className="text-sm text-muted-foreground">{t.settings.profileText}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="full-name">{t.settings.fullName}</Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              maxLength={160}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="cpf">{t.settings.cpf}</Label>
              <Input
                id="cpf"
                inputMode="numeric"
                required
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
                placeholder="000.000.000-00"
                aria-describedby="cpf-hint"
              />
              <p id="cpf-hint" className="text-xs text-muted-foreground">
                {t.settings.cpfRequiredHint}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="phone">{t.settings.phone}</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                autoComplete="tel"
                maxLength={30}
              />
            </div>
          </div>
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <Button type="submit" className="w-fit bg-brand hover:bg-brand-strong">
            {t.common.save}
          </Button>
        </form>

        <div className="grid content-start gap-6">
          <section className="grid content-start gap-4 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="font-display text-lg font-semibold">{t.settings.account}</h2>
            <p className="text-sm">
              <span className="text-muted-foreground">{t.auth.email}: </span>
              {user?.email}
            </p>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">{t.settings.language}</span>
              <LanguageSelect
                className="w-fit"
                onChange={(locale) => {
                  if (user) void supabase.from("profiles").update({ locale }).eq("id", user.id);
                }}
              />
            </div>
            <Button variant="outline" className="w-fit" onClick={() => void signOut()}>
              {t.auth.logout}
            </Button>
          </section>
          <MfaSettings />
          <section className="grid gap-2 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="font-display text-lg font-semibold">{t.mfa.dataTitle}</h2>
            <p className="text-sm text-muted-foreground">{t.mfa.dataText}</p>
            <a
              href={`/${locale}/titular`}
              target="_blank"
              rel="noreferrer"
              className="w-fit text-sm font-semibold text-brand underline-offset-2 hover:underline"
            >
              {t.mfa.dataLink}
            </a>
          </section>
        </div>
      </div>
    </>
  );
}
