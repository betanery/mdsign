import { CheckCircle2, User } from "lucide-react";

import { stepIcons, trustIcons } from "@/content/landing";
import { useI18n } from "@/i18n";
import { Cta } from "./cta";
import { icons } from "./icons";
import { ProductMockup } from "./product-mockup";
import { Container, Eyebrow, SectionHeading } from "./section";

export function Hero() {
  const { t } = useI18n();
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden bg-gradient-to-br from-white via-brand-soft to-[oklch(0.94_0.05_330)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full bg-brand-magenta/15 blur-3xl"
      />
      <Container className="relative grid items-center gap-12 py-12 sm:py-16 lg:grid-cols-[1fr_1.1fr] lg:py-20">
        <div>
          <Eyebrow>{t.hero.eyebrow}</Eyebrow>
          <h1
            id="hero-title"
            className="mt-3 text-4xl leading-[1.08] font-bold text-foreground sm:text-5xl xl:text-6xl"
          >
            {t.hero.titleLine1}{" "}
            <span className="block bg-gradient-to-r from-brand to-brand-magenta bg-clip-text text-transparent">
              {t.hero.titleLine2}
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">{t.hero.text}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Cta kind="free" source="hero" size="lg" arrow />
            <Cta kind="plans" source="hero" size="lg" variant="outline" />
          </div>
        </div>
        <div className="pb-8 lg:pb-0">
          <ProductMockup label={t.a11y.mockup} />
        </div>
      </Container>
    </section>
  );
}

export function TrustBar() {
  const { t } = useI18n();
  return (
    <section aria-label={t.trust.label} className="border-y bg-white">
      <Container>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-4 py-6 sm:grid-cols-2 lg:grid-cols-5">
          {t.trust.items.map((label, i) => {
            const Icon = icons[trustIcons[i] ?? "shield"];
            return (
              <li key={label} className="flex items-center gap-3">
                <Icon className="size-7 shrink-0 text-brand" aria-hidden />
                <span className="text-sm leading-snug font-semibold">{label}</span>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}

const signers = [
  { name: "Matheus Rodrigues", signed: true },
  { name: "Carlos Pereira", signed: true },
  { name: "Ana Carolina", signed: false },
];

export function Platform() {
  const { t } = useI18n();
  const demo = t.platform.demo;
  return (
    <section id="produto" aria-labelledby="produto-title" className="bg-white py-16 sm:py-24">
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        {/* Demonstração com dados fictícios */}
        <div className="relative order-2 mx-auto w-full max-w-lg lg:order-1" aria-hidden>
          <div className="rounded-2xl border bg-white p-5 shadow-xl">
            <p className="font-display font-semibold">{demo.request}</p>
            <p className="mt-4 text-sm font-semibold">{demo.to}</p>
            <div className="mt-2 flex items-center gap-3 rounded-lg border p-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-muted">
                <User className="size-5 text-muted-foreground" />
              </span>
              <div className="text-sm">
                <p className="font-medium">Carlos Pereira</p>
                <p className="text-muted-foreground">carlos@empresa.com</p>
              </div>
            </div>
            <p className="mt-4 text-sm font-semibold">{demo.message}</p>
            <p className="mt-2 rounded-lg border p-3 text-sm text-muted-foreground">
              {demo.messageText}
            </p>
            <div className="mt-4 rounded-lg bg-brand py-2.5 text-center text-sm font-semibold text-white">
              {demo.send}
            </div>
          </div>
          <div className="relative -mt-10 ml-auto w-[85%] rounded-2xl border bg-white p-5 shadow-xl sm:-mt-16 sm:w-[75%]">
            <p className="font-display text-sm font-semibold">{demo.signers}</p>
            <ol className="mt-3 space-y-3">
              {signers.map((s, i) => (
                <li key={s.name} className="flex items-center gap-2 text-sm">
                  <span className="w-5 font-semibold text-muted-foreground">{i + 1}º</span>
                  <User className="size-4 text-muted-foreground" />
                  <span className="flex-1 font-medium">{s.name}</span>
                  <span
                    className={
                      s.signed
                        ? "rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                        : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    }
                  >
                    {s.signed ? demo.signed : demo.waiting}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <SectionHeading
            id="produto-title"
            align="left"
            eyebrow={t.platform.eyebrow}
            title={t.platform.title}
            subtitle={t.platform.text}
          />
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {t.platform.features.map((feature) => (
              <li key={feature} className="flex items-center gap-2.5">
                <CheckCircle2 className="size-5 shrink-0 text-brand" aria-hidden />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <Cta kind="platform" source="platform" className="mt-8" arrow />
        </div>
      </Container>
    </section>
  );
}

export function HowItWorks() {
  const { t } = useI18n();
  return (
    <section
      id="como-funciona"
      aria-labelledby="como-funciona-title"
      className="bg-brand-soft/60 py-16 sm:py-24"
    >
      <Container>
        <SectionHeading
          id="como-funciona-title"
          eyebrow={t.how.eyebrow}
          title={t.how.title}
          subtitle={t.how.subtitle}
        />
        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {t.how.steps.map((step, i) => {
            const Icon = icons[stepIcons[i] ?? "pen"];
            return (
              <li
                key={step.title}
                className="relative rounded-2xl border bg-white p-6 pt-8 text-center shadow-sm"
              >
                <span className="absolute -top-4 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                  {i + 1}
                </span>
                <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand-soft">
                  <Icon className="size-8 text-brand" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-bold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
              </li>
            );
          })}
        </ol>
      </Container>
    </section>
  );
}
