import { createFileRoute } from "@tanstack/react-router";

import { AcquisitionPage } from "@/components/landing/acquisition-page";
import { acquisitionVariant, DEFAULT_VARIANT } from "@/content/acquisition";
import { isLocale, type Locale } from "@/i18n";
import { seoHead } from "@/i18n/seo";

// Landing de aquisição do plano grátis Cedro (funil PLG). Leva ao cadastro atual do app.
export const Route = createFileRoute("/$lang/assinar-gratis")({
  head: ({ params }) => {
    if (!isLocale(params.lang)) return {};
    const v = acquisitionVariant(params.lang, DEFAULT_VARIANT)!;
    return seoHead(params.lang, "/assinar-gratis", v.metaTitle, v.metaDescription);
  },
  component: Page,
});

function Page() {
  const { lang } = Route.useParams();
  return <AcquisitionPage variant={acquisitionVariant(lang as Locale, DEFAULT_VARIANT)!} />;
}
