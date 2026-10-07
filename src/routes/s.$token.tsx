import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock, Loader2, ShieldCheck, XCircle } from "lucide-react";

import { ApiError, callPublicFunction } from "@/app/api";
import { LanguageSelect, SkipLink } from "@/app/components/language-select";
import { AppI18nProvider, useAppI18n } from "@/app/i18n";
import { Logo } from "@/components/landing/logo";

// Link seguro de assinatura (enviado por WhatsApp): confere o código no servidor e leva para a
// cerimônia do motor, onde a autenticação exigida acontece. O link sozinho não assina nada.
export const Route = createFileRoute("/s/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "MDSign" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: () => (
    <AppI18nProvider>
      <SignLink />
    </AppI18nProvider>
  ),
});

type State =
  | "loading"
  | "ready"
  | "done"
  | "concluded"
  | "canceled"
  | "refused"
  | "expired"
  | "not_your_turn"
  | "invalid";

function SignLink() {
  const { token } = Route.useParams();
  const { t } = useAppI18n();
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    void callPublicFunction<{ state?: string; url?: string }>("sign-link", {
      token,
    })
      .then((r) => {
        if (r.state === "ready" && r.url) {
          setState("ready");
          window.location.replace(r.url);
          return;
        }
        const s = r.state as State;
        setState(
          ["done", "concluded", "canceled", "refused", "expired", "not_your_turn"].includes(s)
            ? s
            : "invalid",
        );
      })
      .catch((e: unknown) =>
        // O servidor responde 404/410 para link inválido ou vencido.
        setState(e instanceof ApiError && e.code === "link_expired" ? "expired" : "invalid"),
      );
  }, [token]);

  const ok = state === "done" || state === "concluded";
  const wait = state === "not_your_turn";
  const Icon =
    state === "loading" || state === "ready" ? Loader2 : ok ? CheckCircle2 : wait ? Clock : XCircle;

  return (
    <div className="min-h-svh bg-[#f6f5f9]">
      <SkipLink />
      <header className="mx-auto flex max-w-xl items-center justify-between px-4 py-5">
        <Logo />
        <LanguageSelect />
      </header>
      <main id="conteudo" className="mx-auto max-w-xl px-4 pb-16">
        <section className="grid gap-3 rounded-2xl border bg-white p-6 text-center shadow-sm">
          <Icon
            className={
              state === "loading" || state === "ready"
                ? "mx-auto size-8 animate-spin text-brand"
                : ok
                  ? "mx-auto size-8 text-success"
                  : wait
                    ? "mx-auto size-8 text-orange-600"
                    : "mx-auto size-8 text-destructive"
            }
            aria-hidden
          />
          <h1 className="font-display text-xl font-semibold">{t.signLink.titles[state]}</h1>
          <p className="text-sm text-muted-foreground">{t.signLink.texts[state]}</p>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden />
            {t.signLink.secure}
          </p>
        </section>
      </main>
    </div>
  );
}
