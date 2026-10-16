import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAppI18n } from "../i18n";
import { AuthLayout, FormMessage } from "./auth-layout";

// Verificação em duas etapas (TOTP, app autenticador) — auditoria 16/10/2026, Fase 1 item 4.
// Ativação em Configurações; no login, quem ativou digita o código de 6 dígitos.

type Factor = { id: string; friendly_name?: string; factor_type: string; status: string };

const onlyCode = (v: string) => v.replace(/\D/g, "").slice(0, 6);

/** Tela do código, mostrada depois da senha para quem tem MFA ativo. */
export function MfaChallenge({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useAppI18n();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp?.find((f) => f.status === "verified");
    if (!factor) {
      setBusy(false);
      setError(t.mfa.noFactor);
      return;
    }
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    });
    setBusy(false);
    if (err) setError(t.mfa.invalidCode);
  }

  return (
    <AuthLayout title={t.mfa.challengeTitle} subtitle={t.mfa.challengeText}>
      <form className="grid gap-4" onSubmit={(e) => void verify(e)}>
        <div className="grid gap-1.5">
          <Label htmlFor="mfa-code">{t.mfa.code}</Label>
          <Input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(onlyCode(e.target.value))}
            placeholder="000000"
            className="text-center font-mono text-lg tracking-[0.4em]"
          />
        </div>
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <Button
          type="submit"
          size="lg"
          disabled={busy || code.length !== 6}
          className="bg-brand hover:bg-brand-strong"
        >
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {t.mfa.verify}
        </Button>
        <button
          type="button"
          onClick={onSignOut}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          {t.mfa.useOtherAccount}
        </button>
      </form>
    </AuthLayout>
  );
}

/** Configurações → Verificação em duas etapas. */
export function MfaSettings() {
  const { t } = useAppI18n();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(((data?.all ?? []) as Factor[]).filter((f) => f.factor_type === "totp"));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const verified = factors?.find((f) => f.status === "verified");

  async function start() {
    setBusy(true);
    setError(null);
    // Remove tentativas anteriores não concluídas antes de começar outra.
    for (const f of factors ?? [])
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error: err } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `MDSign ${new Date().toLocaleDateString("pt-BR")}`,
    });
    setBusy(false);
    if (err || !data) {
      setError(t.mfa.enrollError);
      return;
    }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enroll.id,
      code,
    });
    setBusy(false);
    if (err) {
      setError(t.mfa.invalidCode);
      return;
    }
    toast.success(t.mfa.enabled);
    setEnroll(null);
    setCode("");
    void load();
  }

  async function remove() {
    if (!verified) return;
    setBusy(true);
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId: verified.id });
    setBusy(false);
    if (err) {
      // O Supabase só deixa remover com a sessão já verificada pelo código (aal2).
      toast.error(t.mfa.removeError);
      return;
    }
    toast.success(t.mfa.disabled);
    void load();
  }

  return (
    <section
      aria-labelledby="mfa-title"
      className="grid gap-3 rounded-2xl border bg-white p-5 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
        <div>
          <h2 id="mfa-title" className="font-display text-lg font-semibold">
            {t.mfa.title}
          </h2>
          <p className="text-sm text-muted-foreground">{t.mfa.text}</p>
        </div>
      </div>
      {factors === null ? (
        <p className="text-sm text-muted-foreground">{t.common.loading}</p>
      ) : verified ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm font-medium text-success">{t.mfa.on}</p>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void remove()}>
            <Trash2 aria-hidden />
            {t.mfa.disable}
          </Button>
        </div>
      ) : enroll ? (
        <form className="grid gap-3" onSubmit={(e) => void confirm(e)}>
          <ol className="grid list-decimal gap-1 pl-5 text-sm">
            <li>{t.mfa.step1}</li>
            <li>{t.mfa.step2}</li>
          </ol>
          <img
            src={enroll.qr}
            alt={t.mfa.qrAlt}
            width={180}
            height={180}
            className="rounded-lg border bg-white p-2"
          />
          <p className="text-xs text-muted-foreground">
            {t.mfa.manual} <code className="font-mono break-all">{enroll.secret}</code>
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="mfa-new-code">{t.mfa.code}</Label>
            <Input
              id="mfa-new-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(onlyCode(e.target.value))}
              placeholder="000000"
              className="max-w-40 text-center font-mono tracking-[0.3em]"
            />
          </div>
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={busy || code.length !== 6}
              className="bg-brand hover:bg-brand-strong"
            >
              {t.mfa.confirm}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEnroll(null)}>
              {t.common.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-2">
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <Button
            className="w-fit bg-brand hover:bg-brand-strong"
            disabled={busy}
            onClick={() => void start()}
          >
            <Smartphone aria-hidden />
            {t.mfa.enable}
          </Button>
        </div>
      )}
    </section>
  );
}
