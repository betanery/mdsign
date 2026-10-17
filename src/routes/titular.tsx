import { createFileRoute } from "@tanstack/react-router";

import { redirectToLocale } from "@/i18n/redirect";

// Sem idioma no endereço: redireciona para /pt/titular (ou o idioma do visitante).
export const Route = createFileRoute("/titular")({
  server: {
    handlers: {
      GET: ({ request }) => redirectToLocale(request, "/titular"),
    },
  },
});
