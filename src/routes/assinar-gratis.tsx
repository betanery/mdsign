import { createFileRoute } from "@tanstack/react-router";

import { redirectToLocale } from "@/i18n/redirect";

// Endereço curto para campanhas: redireciona para /pt/assinar-gratis (ou o idioma do visitante),
// mantendo as UTMs.
export const Route = createFileRoute("/assinar-gratis")({
  server: {
    handlers: {
      GET: ({ request }) => redirectToLocale(request, "/assinar-gratis"),
    },
  },
});
