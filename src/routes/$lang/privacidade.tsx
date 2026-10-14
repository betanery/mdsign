import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/landing/legal-page";
import { LEGAL_DRAFT, legalDocs } from "@/content/legal";
import { isLocale } from "@/i18n";
import { seoHead } from "@/i18n/seo";

// Página legal. Enquanto for minuta (LEGAL_DRAFT), fica fora dos buscadores.
export const Route = createFileRoute("/$lang/privacidade")({
  head: ({ params }) => {
    if (!isLocale(params.lang)) return {};
    const doc = legalDocs.privacy;
    const head = seoHead(params.lang, "/privacidade", `${doc.title} | MDSign`, doc.metaDescription);
    return LEGAL_DRAFT
      ? { ...head, meta: [...head.meta, { name: "robots", content: "noindex, follow" }] }
      : head;
  },
  component: () => <LegalPage kind="privacy" />,
});
