import { createFileRoute, redirect } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import { Cta } from "@/components/landing/cta";
import { SimplePage } from "@/components/landing/simple-page";
import { siteConfig } from "@/config/site";
import { apiDocsReferenceUrl, webhookEvents } from "@/content/landing";

// Visão geral da API. Com VITE_API_DOCS_URL definida, redireciona para ela.
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

const resources = [
  {
    title: "Documentos",
    text: "Crie um ou vários documentos, consulte o status, baixe as versões assinadas, cancele ou mova para pastas.",
  },
  {
    title: "Fluxos de assinatura",
    text: "Defina signatários e aprovadores, a ordem de cada etapa e as formas de autenticação. Salve fluxos para reutilizar.",
  },
  {
    title: "Uploads",
    text: "Envie o arquivo (multipart ou Base64) e use o identificador retornado para criar o documento.",
  },
  {
    title: "Pastas e organização",
    text: "Crie pastas, organize documentos em lote e gerencie os usuários da organização.",
  },
  {
    title: "Validação",
    text: "Valide as assinaturas de um documento pelo código de verificação ou enviando o arquivo assinado.",
  },
  {
    title: "Notificações",
    text: "Envie lembretes para os participantes que ainda têm ações pendentes.",
  },
];

function Desenvolvedores() {
  return (
    <SimplePage eyebrow="Desenvolvedores" title="API REST e webhooks do MDSign">
      <p>
        Integre a assinatura eletrônica aos seus próprios processos. A API é REST, recebe e devolve
        JSON e é autenticada por chave de aplicação enviada no cabeçalho{" "}
        <code className="rounded bg-white px-1.5 py-0.5 text-sm text-brand">X-Api-Key</code>.
      </p>
      <p className="mt-3 text-base">
        A chave deve ficar no seu servidor. Nunca a coloque no código que roda no navegador ou em
        aplicativos.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {resources.map((r) => (
          <li key={r.title} className="rounded-xl border bg-white p-5">
            <h2 className="text-base font-bold text-foreground">{r.title}</h2>
            <p className="mt-1 text-sm">{r.text}</p>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-xl font-bold text-foreground">Webhooks</h2>
      <p className="mt-2 text-base">
        Em vez de consultar a API repetidamente, cadastre uma URL e receba um aviso (POST) a cada
        evento:
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {webhookEvents.map((e) => (
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
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong"
        >
          Referência completa da API
          <ExternalLink className="size-4" aria-hidden />
        </a>
        <Cta kind="specialist" source="developers" variant="outline" />
      </div>
    </SimplePage>
  );
}
