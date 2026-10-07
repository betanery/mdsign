import { createFileRoute, notFound } from "@tanstack/react-router";

import { AcquisitionPage } from "@/components/landing/acquisition-page";
import { acquisitionVariant, CAMPAIGN_SLUGS } from "@/content/acquisition";
import { isLocale, type Locale } from "@/i18n";
import { seoHead } from "@/i18n/seo";

// Variantes de campanha da landing de aquisição (/pt/lp/assinar-pdf-gratis etc.).
// Mesmo cadastro Cedro; a variante fica gravada na origem do cadastro.
export const Route = createFileRoute("/$lang/lp/$slug")({
  beforeLoad: ({ params }) => {
    if (!(CAMPAIGN_SLUGS as readonly string[]).includes(params.slug)) throw notFound();
  },
  head: ({ params }) => {
    if (!isLocale(params.lang)) return {};
    const v = acquisitionVariant(params.lang, params.slug);
    return v ? seoHead(params.lang, `/lp/${params.slug}`, v.metaTitle, v.metaDescription) : {};
  },
  component: Page,
});

function Page() {
  const { lang, slug } = Route.useParams();
  return <AcquisitionPage variant={acquisitionVariant(lang as Locale, slug)!} />;
}
