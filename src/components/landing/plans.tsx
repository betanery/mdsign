import { useState } from "react";
import { Check, ChevronDown, Clock, Info, Minus } from "lucide-react";

import { planComparison, plans, type CompareCell, type Plan } from "@/content/landing";
import { useI18n } from "@/i18n";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Cta } from "./cta";
import { Container, SectionHeading } from "./section";

function PlanCard({ plan }: { plan: Plan }) {
  const { t, locale } = useI18n();
  const text = t.plans.items[plan.id];
  const isFree = plan.cta === "free";
  const isCorporate = plan.cta === "specialist";

  return (
    <article
      aria-labelledby={`plano-${plan.id}`}
      className={cn(
        "relative flex w-[78vw] max-w-[300px] shrink-0 snap-center flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-lg sm:w-auto sm:max-w-none",
        plan.featured && "border-2 border-brand shadow-md",
      )}
    >
      {plan.featured && (
        <span className="absolute top-3 left-3 z-10 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white shadow">
          {t.plans.featured}
        </span>
      )}
      <div className="aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={plan.image}
          srcSet={`${plan.imageSmall} 320w, ${plan.image} 640w`}
          sizes="(min-width: 1280px) 190px, (min-width: 768px) 30vw, (min-width: 640px) 45vw, 78vw"
          width={640}
          height={480}
          alt={`${t.plans.photoOf} ${plan.name}`}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 id={`plano-${plan.id}`} className="text-center text-xl font-bold">
          {plan.name}
        </h3>
        <p className="text-center text-sm font-medium text-brand">{text.audience}</p>
        <p className="mt-1 min-h-[2.75rem] text-center">
          {plan.price ? (
            <>
              <span className="font-display text-2xl font-bold">{plan.price}</span>
              <span className="text-sm text-muted-foreground">{t.plans.perMonth}</span>
            </>
          ) : (
            <span className="flex flex-col">
              <span
                className={cn(
                  "font-display text-lg font-bold",
                  isFree ? "text-brand-magenta" : "text-brand",
                )}
              >
                {text.priceLabel}
              </span>
              {text.priceNote && <span className="text-sm font-semibold">{text.priceNote}</span>}
            </span>
          )}
        </p>
        <ul className="mt-4 flex-1 space-y-2 text-sm">
          {text.features.map((feature) => (
            <li key={feature} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        {/* Seleção de plano = clique no botão do card (não conta o deslizar do carrossel). */}
        <div onClickCapture={() => track("plan_select", { plan: plan.id, lang: locale })}>
          <Cta
            kind={isFree ? "free" : isCorporate ? "specialist" : "subscribe"}
            plan={plan.id}
            source={`plan_${plan.id}`}
            variant={plan.featured ? "primary" : "outline"}
            size="sm"
            className="mt-6 w-full whitespace-normal"
          />
        </div>
      </div>
    </article>
  );
}

export function Plans() {
  const { t } = useI18n();
  return (
    <section id="planos" aria-labelledby="planos-title" className="bg-white py-16 sm:py-24">
      <Container>
        <SectionHeading
          id="planos-title"
          eyebrow={t.plans.eyebrow}
          title={t.plans.title}
          subtitle={t.plans.subtitle}
        />
      </Container>
      {/* Celular: carrossel com rolagem lateral. Tablet/desktop: grade. */}
      <div className="mx-auto mt-10 max-w-7xl sm:px-6 lg:px-8">
        <div
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4"
          aria-label={t.plans.listLabel}
        >
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
        <p className="px-4 text-center text-xs text-muted-foreground sm:hidden">
          {t.plans.swipeHint}
        </p>
        <p className="mt-6 flex items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
          <Info className="size-4 shrink-0 text-brand" aria-hidden />
          {t.plans.storageNote}
        </p>
        <Comparison />
      </div>
    </section>
  );
}

function Cell({ value }: { value: CompareCell }) {
  const { t } = useI18n();
  const c = t.plans.compare;
  if (value === "yes")
    return (
      <>
        <Check className="mx-auto size-5 text-brand" aria-hidden />
        <span className="sr-only">{c.yes}</span>
      </>
    );
  if (value === "no")
    return (
      <>
        <Minus className="mx-auto size-4 text-muted-foreground/60" aria-hidden />
        <span className="sr-only">{c.no}</span>
      </>
    );
  if (value === "soon")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="size-3.5" aria-hidden />
        {c.soon}
      </span>
    );
  return <span className="text-xs font-semibold text-brand">{c[value]}</span>;
}

/** Comparação completa, fechada por padrão (a primeira vista mostra só os 4 cartões). */
function Comparison() {
  const { t } = useI18n();
  const c = t.plans.compare;
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-8 px-4 sm:px-0">
      <div className="text-center">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="comparar-planos"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold text-brand hover:bg-brand-soft"
        >
          {open ? c.hide : c.toggle}
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </div>
      {open && (
        <div id="comparar-planos" className="relative mt-6 overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">{c.caption}</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="p-3 text-left font-semibold">
                  {c.feature}
                </th>
                {plans.map((p) => (
                  <th
                    key={p.id}
                    scope="col"
                    className={cn("p-3 text-center font-semibold", p.featured && "text-brand")}
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {planComparison.map((r) => (
                <tr key={r.row} className="border-t">
                  <th scope="row" className="p-3 text-left font-normal">
                    {c.rows[r.row as keyof typeof c.rows]}
                  </th>
                  {plans.map((p) => (
                    <td
                      key={p.id}
                      className={cn("p-3 text-center", p.featured && "bg-brand-soft/30")}
                    >
                      <Cell value={r.cells[p.id]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
