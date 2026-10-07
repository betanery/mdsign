import { createFileRoute, notFound } from "@tanstack/react-router";
import { Construction } from "lucide-react";

import { PageHeader } from "@/app/components/app-shell";
import { useAppI18n } from "@/app/i18n";

/** Seções das próximas fases: aparecem no menu, ainda sem conteúdo. */
const upcoming: readonly string[] = [];
type Upcoming = "reports";

export const Route = createFileRoute("/app/_shell/$section")({
  beforeLoad: ({ params }) => {
    if (!(upcoming as readonly string[]).includes(params.section)) throw notFound();
  },
  component: SoonPage,
});

function SoonPage() {
  const { section } = Route.useParams();
  const { t, f } = useAppI18n();
  const name = t.nav[section as Upcoming];
  return (
    <>
      <PageHeader title={f(t.soonPage.title, { section: name })} />
      <div className="flex items-start gap-3 rounded-2xl border bg-white p-6 text-muted-foreground shadow-sm">
        <Construction className="size-5 shrink-0 text-brand" aria-hidden />
        <p>{t.soonPage.text}</p>
      </div>
    </>
  );
}
