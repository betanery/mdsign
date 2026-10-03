import { createFileRoute, redirect } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import { Cta } from "@/components/landing/cta";
import { SimplePage } from "@/components/landing/simple-page";
import { siteConfig } from "@/config/site";
import { apiDocsReferenceUrl } from "@/content/landing";
import { isLocale, messages, useI18n } from "@/i18n";
import { seoHead } from "@/i18n/seo";
import { track } from "@/lib/analytics";

// Visão geral da API. Com VITE_API_DOCS_URL definida, redireciona para ela.
export const Route = createFileRoute("/$lang/desenvolvedores")({
  beforeLoad: () => {
    if (siteConfig.apiDocsUrl) throw redirect({ href: siteConfig.apiDocsUrl });
  },
  head: ({ params }) => {
    if (!isLocale(params.lang)) return {};
    const t = messages[params.lang].developers;
    return seoHead(params.lang, "/desenvolvedores", t.metaTitle, t.metaDescription);
  },
  component: Desenvolvedores,
});

function Desenvolvedores() {
  const { t, locale } = useI18n();
  const d = t.developers;
  const [introBefore, introAfter] = d.intro.split("{header}");

  return (
    <SimplePage eyebrow={d.eyebrow} title={d.title}>
      <p>
        {introBefore}
        <code className="rounded bg-white px-1.5 py-0.5 text-sm text-brand">X-Api-Key</code>
        {introAfter}
      </p>
      <p className="mt-3 text-base">{d.keyWarning}</p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {d.resources.map((r) => (
          <li key={r.title} className="rounded-xl border bg-white p-5">
            <h2 className="text-base font-bold text-foreground">{r.title}</h2>
            <p className="mt-1 text-sm">{r.text}</p>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-xl font-bold text-foreground">{d.webhooksTitle}</h2>
      <p className="mt-2 text-base">{d.webhooksText}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {t.integrations.events.map((e) => (
          <li key={e} className="rounded-full border bg-white px-3 py-1 text-sm text-foreground">
            {e}
          </li>
        ))}
      </ul>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <a
          href={apiDocsReferenceUrl}
          target="_blank"
          rel="noopener"
          onClick={() => track("cta_documentacao_api", { source: "developers", lang: locale })}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong"
        >
          {t.cta.api}
          <ExternalLink className="size-4" aria-hidden />
        </a>
        <Cta kind="specialist" source="developers" variant="outline" />
      </div>
    </SimplePage>
  );
}
