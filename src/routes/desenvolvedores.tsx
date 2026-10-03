import { createFileRoute, redirect } from "@tanstack/react-router";

import { Cta } from "@/components/landing/cta";
import { SimplePage } from "@/components/landing/simple-page";
import { siteConfig } from "@/config/site";

// Rota reservada para a documentação da API. Com VITE_API_DOCS_URL definida,
// redireciona para ela; sem a URL, mostra o convite para falar com a equipe.
export const Route = createFileRoute("/desenvolvedores")({
  beforeLoad: () => {
    if (siteConfig.apiDocsUrl) throw redirect({ href: siteConfig.apiDocsUrl });
  },
  head: () => ({
    meta: [
      { title: "Desenvolvedores — API MDSign" },
      {
        name: "description",
        content:
          "Integre a assinatura eletrônica do MDSign aos seus sistemas com API REST e webhooks.",
      },
    ],
  }),
  component: Desenvolvedores,
});

function Desenvolvedores() {
  return (
    <SimplePage eyebrow="Desenvolvedores" title="API REST e webhooks do MDSign">
      <p>
        A documentação pública da API está sendo preparada. Enquanto isso, nossa equipe envia o
        material de integração e as credenciais de teste para o seu time.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Cta kind="specialist" source="developers" arrow />
        <Cta kind="plans" source="developers" variant="outline" />
      </div>
    </SimplePage>
  );
}
