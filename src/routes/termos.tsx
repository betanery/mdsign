import { createFileRoute } from "@tanstack/react-router";

import { redirectToLocale } from "@/i18n/redirect";

// Sem idioma no endereço: redireciona para /pt/termos, /en/termos ou /es/termos.
export const Route = createFileRoute("/termos")({
  server: {
    handlers: {
      GET: ({ request }) => redirectToLocale(request, "/termos"),
    },
  },
});
