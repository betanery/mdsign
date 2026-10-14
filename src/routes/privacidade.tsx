import { createFileRoute } from "@tanstack/react-router";

import { redirectToLocale } from "@/i18n/redirect";

// Sem idioma no endereço: redireciona para /pt/privacidade, /en/privacidade ou /es/privacidade.
export const Route = createFileRoute("/privacidade")({
  server: {
    handlers: {
      GET: ({ request }) => redirectToLocale(request, "/privacidade"),
    },
  },
});
