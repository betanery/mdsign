import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";

import { LeadDialogProvider } from "@/components/landing/lead-dialog";
import { I18nProvider, isLocale, type Locale } from "@/i18n";

// Layout de todas as páginas com idioma: /pt, /en, /es (PRD 27.2).
// As Fases 2 e 3 entram como filhas desta rota e herdam o idioma.
export const Route = createFileRoute("/$lang")({
  beforeLoad: ({ params }) => {
    if (!isLocale(params.lang)) throw notFound();
  },
  component: LangLayout,
});

function LangLayout() {
  const { lang } = Route.useParams();
  return (
    <I18nProvider locale={lang as Locale}>
      <LeadDialogProvider>
        <Outlet />
      </LeadDialogProvider>
    </I18nProvider>
  );
}
