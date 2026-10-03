import { Quote } from "lucide-react";

import { faqs, securityItems, sustainabilityItems, testimonials } from "@/content/landing";
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
  return (
    <section
      aria-labelledby="sustentabilidade-title"
      className="relative overflow-hidden bg-gradient-to-r from-brand-strong to-brand-magenta text-white"
    >
      <Container className="relative grid items-center gap-10 py-14 lg:grid-cols-2 lg:py-16">
        <div>
          <h2 id="sustentabilidade-title" className="text-3xl leading-tight font-bold sm:text-4xl">
            Não use papel, plante uma árvore!
          </h2>
          <p className="mt-3 text-lg text-white/85">
            Cada documento assinado digitalmente é um passo para um futuro mais sustentável.
          </p>
        </div>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {sustainabilityItems.map((item) => {
            const Icon = icons[item.icon];
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
  if (testimonials.length === 0) return null;
  return (
    <section aria-labelledby="clientes-title" className="bg-brand-soft/60 py-16 sm:py-24">
      <Container>
        <SectionHeading
          id="clientes-title"
          eyebrow="O que dizem nossos clientes"
          title="Empresas que confiam e evoluem com a gente."
        />
        <ul className="mt-10 grid gap-6 lg:grid-cols-2">
          {testimonials.map((t) => (
            <li key={t.company}>
              <figure className="flex h-full flex-col gap-5 rounded-2xl border bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:p-8">
                <img
                  src={t.logo}
                  alt={t.logoAlt}
                  loading="lazy"
                  className="h-24 w-36 shrink-0 rounded-xl object-contain"
                />
                <div>
                  <Quote className="size-6 text-brand/40" aria-hidden />
                  <blockquote className="mt-1 text-base text-foreground/90">“{t.quote}”</blockquote>
                  <figcaption className="mt-4 text-sm">
                    <span className="font-semibold">{t.author}</span>
                    <span className="block text-muted-foreground">
                      {t.role} · {t.company}
                    </span>
                  </figcaption>
                </div>
              </figure>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export function Security() {
  return (
    <section id="seguranca" aria-labelledby="seguranca-title" className="bg-white py-16 sm:py-24">
      <Container>
        <SectionHeading
          id="seguranca-title"
          eyebrow="Segurança e validade"
          title="Assinaturas com validade jurídica e processo rastreável."
          subtitle="Escolha o tipo de assinatura adequado a cada documento e tenha o registro de cada etapa."
        />
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {securityItems.map((item) => {
            const Icon = icons[item.icon];
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
  return (
    <section id="faq" aria-labelledby="faq-title" className="bg-brand-soft/60 py-16 sm:py-24">
      <Container className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <SectionHeading
            id="faq-title"
            align="left"
            eyebrow="Dúvidas frequentes"
            title="Ainda tem dúvidas?"
            subtitle="Separamos as principais perguntas para te ajudar. Se preferir, fale com a nossa equipe."
          />
          <Cta kind="specialist" source="faq" className="mt-6" arrow />
        </div>
        <Accordion
          type="single"
          collapsible
          className="rounded-2xl border bg-white px-5 sm:px-6"
          onValueChange={(value) => value && track("faq_open", { question: value })}
        >
          {faqs.map((item) => (
            <AccordionItem key={item.q} value={item.q} className="last:border-b-0">
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
  return (
    <section id="contato" aria-labelledby="cta-final-title" className="bg-white py-16 sm:py-20">
      <Container>
        <div className="rounded-3xl bg-gradient-to-br from-brand-strong via-brand to-brand-magenta px-6 py-12 text-center text-white sm:px-12">
          <h2 id="cta-final-title" className="text-3xl leading-tight font-bold sm:text-4xl">
            Menos papel. Mais agilidade para o seu negócio.
          </h2>
          <p className="mt-3 text-lg text-white/85">
            Envie seu primeiro documento e conheça o MDSign.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Cta kind="free" source="final_cta" variant="light" size="lg" arrow />
            <Cta kind="specialist" source="final_cta" variant="ghostLight" size="lg" />
          </div>
        </div>
      </Container>
    </section>
  );
}
