import { createFileRoute, redirect } from "@tanstack/react-router";

import { Cta } from "@/components/landing/cta";
import { SimplePage } from "@/components/landing/simple-page";
import { siteConfig } from "@/config/site";
import { isLocale, messages, useI18n } from "@/i18n";

// Rota reservada para o acesso à aplicação (Fase 2). Com VITE_APP_URL definida,
// redireciona para a aplicação.
export const Route = createFileRoute("/$lang/entrar")({
  beforeLoad: () => {
    if (siteConfig.appUrl) throw redirect({ href: siteConfig.appUrl });
  },
  head: ({ params }) => ({
    meta: [
      { title: isLocale(params.lang) ? messages[params.lang].login.metaTitle : "MDSign" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Entrar,
});

function Entrar() {
  const { t } = useI18n();
  const email = siteConfig.contact.email;
  const [before, after] = t.login.text.split("{email}");

  return (
    <SimplePage eyebrow={t.login.eyebrow} title={t.login.title}>
      <p>
        {before}
        <a className="font-medium text-brand underline" href={`mailto:${email}`}>
          {email}
        </a>
        {after}
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Cta kind="specialist" source="login_page" arrow />
      </div>
    </SimplePage>
  );
}
