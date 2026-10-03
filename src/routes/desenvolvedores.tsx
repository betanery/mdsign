import { createFileRoute } from "@tanstack/react-router";

import { redirectToLocale } from "@/i18n/redirect";

// Sem idioma no endereço: redireciona para /pt, /en ou /es
// (preferência salva → idioma do navegador → inglês). PRD 27.1.
export const Route = createFileRoute("/desenvolvedores")({
  server: {
    handlers: {
      GET: ({ request }) => redirectToLocale(request, "/desenvolvedores"),
    },
  },
});
