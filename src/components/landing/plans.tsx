import { Check, Info } from "lucide-react";

import { plans, type Plan } from "@/content/landing";
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
      className="flex w-[78vw] max-w-[300px] shrink-0 snap-center flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-lg sm:w-auto sm:max-w-none"
    >
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
            variant={isFree || isCorporate ? "outline" : "primary"}
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
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 md:grid-cols-3 xl:grid-cols-6"
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
      </div>
    </section>
  );
}
