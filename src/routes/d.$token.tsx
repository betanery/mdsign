import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, FileCheck2, Loader2, ShieldCheck, XCircle } from "lucide-react";

import { ApiError, callPublicFunction } from "@/app/api";
import { LanguageSelect, SkipLink } from "@/app/components/language-select";
import { AppI18nProvider, useAppI18n } from "@/app/i18n";
import { Logo } from "@/components/landing/logo";
import { Button } from "@/components/ui/button";

// Cópia do documento assinado (enviada por e-mail a alguém de fora do fluxo): confere o link no
// servidor e entrega um link curto do motor para baixar o PDF assinado.
export const Route = createFileRoute("/d/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "MDSign" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: () => (
    <AppI18nProvider>
      <ShareLink />
    </AppI18nProvider>
  ),
});

type Doc = { url: string; name: string; organization: string };

function ShareLink() {
  const { token } = Route.useParams();
  const { t, f, locale } = useAppI18n();
  const s = t.shareLink;
  const [doc, setDoc] = useState<Doc | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "expired" | "invalid">("loading");

  useEffect(() => {
    void callPublicFunction<Doc>("document-share", { action: "open", token })
      .then((r) => {
        setDoc(r);
        setState("ready");
      })
      .catch((e: unknown) =>
        setState(e instanceof ApiError && e.code === "link_expired" ? "expired" : "invalid"),
      );
  }, [token]);

  return (
    <div className="min-h-svh bg-[#f6f5f9]">
      <SkipLink />
      <header className="mx-auto flex max-w-xl items-center justify-between px-4 py-5">
        <Logo />
        <LanguageSelect />
      </header>
      <main id="conteudo" className="mx-auto max-w-xl px-4 pb-16">
        <section className="grid gap-3 rounded-2xl border bg-white p-6 text-center shadow-sm">
          {state === "loading" ? (
            <Loader2 className="mx-auto size-8 animate-spin text-brand" aria-hidden />
          ) : state === "ready" ? (
            <FileCheck2 className="mx-auto size-8 text-success" aria-hidden />
          ) : (
            <XCircle className="mx-auto size-8 text-destructive" aria-hidden />
          )}
          <h1 className="font-display text-xl font-semibold">
            {state === "ready" && doc ? doc.name : s.titles[state]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {state === "ready" && doc
              ? f(s.from, { org: doc.organization || "MDSign" })
              : s.texts[state]}
          </p>
          {state === "ready" && doc && (
            <Button asChild size="lg" className="mx-auto mt-2 bg-brand hover:bg-brand-strong">
              <a href={doc.url} target="_blank" rel="noreferrer">
                <Download aria-hidden />
                {s.download}
              </a>
            </Button>
          )}
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden />
            <a href={`/${locale}/validar`} className="hover:underline">
              {s.validate}
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}
