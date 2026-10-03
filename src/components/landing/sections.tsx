import { Quote } from "lucide-react";

import { securityIcons, sustainabilityIcons, testimonials } from "@/content/landing";
import { useI18n } from "@/i18n";
import { track } from "@/lib/analytics";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Cta } from "./cta";
import { icons } from "./icons";
import { Container, SectionHeading } from "./section";

export function Sustainability() {
  const { t } = useI18n();
  return (
    <section
      aria-labelledby="sustentabilidade-title"
      className="relative overflow-hidden bg-gradient-to-r from-brand-strong to-brand-magenta text-white"
    >
      <Container className="relative grid items-center gap-10 py-14 lg:grid-cols-2 lg:py-16">
        <div>
          <h2 id="sustentabilidade-title" className="text-3xl leading-tight font-bold sm:text-4xl">
            {t.sustainability.title}
          </h2>
          <p className="mt-3 text-lg text-white/85">{t.sustainability.text}</p>
        </div>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {t.sustainability.items.map((item, i) => {
            const Icon = icons[sustainabilityIcons[i] ?? "leaf"];
            return (
              <li
                key={item.title}
                className="flex flex-col items-center gap-2 rounded-xl bg-white/10 p-5 text-center backdrop-blur"
              >
                <Icon className="size-9" aria-hidden />
                <span className="text-sm font-semibold">{item.title}</span>
                <span className="text-sm text-white/80">{item.text}</span>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}

export function Testimonials() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="clientes-title" className="bg-brand-soft/60 py-16 sm:py-24">
      <Container>
        <SectionHeading
          id="clientes-title"
          eyebrow={t.testimonials.eyebrow}
          title={t.testimonials.title}
        />
        <ul className="mt-10 grid gap-6 lg:grid-cols-2">
          {testimonials.map((item, i) => {
            const text = t.testimonials.items[i];
            if (!text) return null;
            return (
              <li key={item.company}>
                <figure className="flex h-full flex-col gap-5 rounded-2xl border bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:p-8">
                  <img
                    src={item.logo}
                    alt={item.company}
                    loading="lazy"
                    className="h-24 w-36 shrink-0 rounded-xl object-contain"
                  />
                  <div>
                    <Quote className="size-6 text-brand/40" aria-hidden />
                    <blockquote className="mt-1 text-base text-foreground/90">
                      “{text.quote}”
                    </blockquote>
                    <figcaption className="mt-4 text-sm">
                      <span className="font-semibold">{item.author}</span>
                      <span className="block text-muted-foreground">
                        {text.role} · {item.company}
                      </span>
                    </figcaption>
                  </div>
                </figure>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}

export function Security() {
  const { t } = useI18n();
  return (
    <section id="seguranca" aria-labelledby="seguranca-title" className="bg-white py-16 sm:py-24">
      <Container>
        <SectionHeading
          id="seguranca-title"
          eyebrow={t.security.eyebrow}
          title={t.security.title}
          subtitle={t.security.subtitle}
        />
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {t.security.items.map((item, i) => {
            const Icon = icons[securityIcons[i] ?? "shield"];
            return (
              <li key={item.title} className="rounded-2xl border p-6">
                <span className="flex size-12 items-center justify-center rounded-xl bg-brand-soft">
                  <Icon className="size-6 text-brand" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-bold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.text}</p>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}

export function Faq() {
  const { t, locale } = useI18n();
  return (
    <section id="faq" aria-labelledby="faq-title" className="bg-brand-soft/60 py-16 sm:py-24">
      <Container className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <SectionHeading
            id="faq-title"
            align="left"
            eyebrow={t.faq.eyebrow}
            title={t.faq.title}
            subtitle={t.faq.subtitle}
          />
          <Cta kind="specialist" source="faq" className="mt-6" arrow />
        </div>
        <Accordion
          type="single"
          collapsible
          className="rounded-2xl border bg-white px-5 sm:px-6"
          // Valor estável entre idiomas (q1, q2…) para comparar os relatórios.
          onValueChange={(value) => value && track("faq_open", { question: value, lang: locale })}
        >
          {t.faq.items.map((item, i) => (
            <AccordionItem key={item.q} value={`q${i + 1}`} className="last:border-b-0">
              <AccordionTrigger className="min-h-11 text-base font-semibold hover:no-underline">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-base text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Container>
    </section>
  );
}

export function FinalCta() {
  const { t } = useI18n();
  return (
    <section id="contato" aria-labelledby="cta-final-title" className="bg-white py-16 sm:py-20">
      <Container>
        <div className="rounded-3xl bg-gradient-to-br from-brand-strong via-brand to-brand-magenta px-6 py-12 text-center text-white sm:px-12">
          <h2 id="cta-final-title" className="text-3xl leading-tight font-bold sm:text-4xl">
            {t.finalCta.title}
          </h2>
          <p className="mt-3 text-lg text-white/85">{t.finalCta.text}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Cta kind="free" source="final_cta" variant="light" size="lg" arrow />
            <Cta kind="specialist" source="final_cta" variant="ghostLight" size="lg" />
          </div>
        </div>
      </Container>
    </section>
  );
}
