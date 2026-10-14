import { createFileRoute } from "@tanstack/react-router";

import { redirectToLocale } from "@/i18n/redirect";

// Sem idioma no endereço: redireciona para /pt/condicoes-cedro (ou o idioma do visitante).
export const Route = createFileRoute("/condicoes-cedro")({
  server: {
    handlers: {
      GET: ({ request }) => redirectToLocale(request, "/condicoes-cedro"),
    },
  },
});
