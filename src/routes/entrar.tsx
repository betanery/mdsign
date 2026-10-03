import { createFileRoute, redirect } from "@tanstack/react-router";

import { Cta } from "@/components/landing/cta";
import { SimplePage } from "@/components/landing/simple-page";
import { siteConfig } from "@/config/site";

// Rota reservada para o acesso à aplicação (Fase 2). Com VITE_APP_URL definida,
// redireciona para a aplicação.
export const Route = createFileRoute("/entrar")({
  beforeLoad: () => {
    if (siteConfig.appUrl) throw redirect({ href: siteConfig.appUrl });
  },
  head: () => ({ meta: [{ title: "Entrar — MDSign" }, { name: "robots", content: "noindex" }] }),
  component: Entrar,
});

function Entrar() {
  return (
    <SimplePage eyebrow="Acesso" title="A nova área do cliente MDSign está chegando">
      <p>
        Em breve você vai acessar sua conta por aqui. Se já é cliente e precisa de ajuda, fale com a
        nossa equipe pelo e-mail{" "}
        <a className="font-medium text-brand underline" href={`mailto:${siteConfig.contact.email}`}>
          {siteConfig.contact.email}
        </a>
        .
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Cta kind="specialist" source="login_page" arrow />
      </div>
    </SimplePage>
  );
}
