import { useEffect } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileSignature,
  Scale,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

import { acquisition, type AcquisitionVariant } from "@/content/acquisition";
import { useI18n } from "@/i18n";
import { setCampaign, track, trackGrowth } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Footer } from "./footer";
import { Header } from "./header";
import { Container, Eyebrow, SectionHeading } from "./section";

// Destino do "Começar grátis": o cadastro atual do app (plano Cedro). Não há outro cadastro.
const SIGNUP = "/app/signup";

function StartCta({
  label,
  where,
  light,
  className,
}: {
  label: string;
  where: string;
  light?: boolean;
  className?: string;
}) {
  const { locale } = useI18n();
  return (
    <a
      href={SIGNUP}
      onClick={() => {
        trackGrowth("acquisition_cta_clicked", { cta: where, lang: locale });
        track("cta_comece_gratis", { source: `acquisition_${where}`, lang: locale });
      }}
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-6 text-base font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        light
          ? "bg-white text-brand hover:bg-brand-soft focus-visible:ring-white"
          : "bg-brand text-white shadow-md shadow-brand/25 hover:bg-brand-strong focus-visible:ring-brand",
        className,
      )}
    >
      {label}
      <ArrowRight className="size-4" aria-hidden />
    </a>
  );
}

/** Landing de aquisição do Cedro (e das variantes de campanha). */
export function AcquisitionPage({ variant }: { variant: AcquisitionVariant }) {
  const { locale, path } = useI18n();
  const c = acquisition[locale];

  useEffect(() => {
    setCampaign(variant.campaign);
    trackGrowth("acquisition_page_viewed", { lang: locale });
  }, [variant.campaign, locale]);

  const stepIcons = [UserPlus, FileSignature, CheckCircle2];
  const trustIcons = [Scale, ShieldCheck, ShieldCheck];

  return (
    <>
      <Header />
      <main id="conteudo">
        <section
          aria-labelledby="acq-title"
          className="relative overflow-hidden bg-gradient-to-br from-white via-brand-soft to-[oklch(0.94_0.05_330)]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full bg-brand-magenta/15 blur-3xl"
          />
          <Container className="relative py-14 text-center sm:py-20">
            <Eyebrow>MDSign · Cedro</Eyebrow>
            <h1
              id="acq-title"
              className="mx-auto mt-3 max-w-3xl text-[1.75rem] leading-[1.1] font-bold text-balance break-words min-[400px]:text-4xl sm:text-5xl"
            >
              {variant.title}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
              {variant.subtitle}
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <StartCta label={c.primary} where="hero" />
              <a
                href={path("/")}
                className="inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-brand bg-white px-6 text-base font-semibold text-brand transition-colors hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                {c.secondary}
              </a>
            </div>
            <p className="mx-auto mt-4 max-w-xl text-xs text-muted-foreground">
              {c.ctaNote}{" "}
              <a href={path("/termos")} className="underline underline-offset-2 hover:text-brand">
                {c.termsLabel}
              </a>{" "}
              {locale === "en" ? "and the" : locale === "es" ? "y las" : "e as"}{" "}
              <a
                href={path("/condicoes-cedro")}
                className="underline underline-offset-2 hover:text-brand"
              >
                {c.cedroLabel}
              </a>
              .
            </p>
            <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-semibold">
              {c.badges.map((b) => (
                <li key={b} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-success" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <section aria-labelledby="acq-steps" className="bg-white py-16 sm:py-20">
          <Container>
            <SectionHeading id="acq-steps" title={c.stepsTitle} />
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {c.steps.map((s, i) => {
                const Icon = stepIcons[i] ?? CheckCircle2;
                return (
                  <li key={s.title} className="rounded-2xl border bg-white p-6 shadow-sm">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 text-lg font-semibold">
                      {i + 1}. {s.title}
                    </h3>
                    <p className="mt-1 text-muted-foreground">{s.text}</p>
                  </li>
                );
              })}
            </ol>
          </Container>
        </section>

        <section aria-labelledby="acq-free" className="bg-brand-soft/50 py-16 sm:py-20">
          <Container className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 id="acq-free" className="text-3xl font-bold sm:text-4xl">
                {c.freeTitle}
              </h2>
              <p className="mt-3 text-lg text-muted-foreground">{c.freeText}</p>
              <StartCta label={c.primary} where="free" className="mt-6" />
            </div>
            <ul className="grid gap-3">
              {c.freeItems.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-3 rounded-xl border bg-white p-4 font-medium shadow-sm"
                >
                  <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <section aria-labelledby="acq-trust" className="bg-white py-16 sm:py-20">
          <Container>
            <SectionHeading id="acq-trust" title={c.trustTitle} />
            <ul className="mt-10 grid gap-6 md:grid-cols-3">
              {c.trustItems.map((item, i) => {
                const Icon = trustIcons[i] ?? ShieldCheck;
                return (
                  <li key={item.title} className="rounded-2xl border p-6">
                    <Icon className="size-6 text-brand" aria-hidden />
                    <h3 className="mt-3 font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
                  </li>
                );
              })}
            </ul>
          </Container>
        </section>

        <section aria-labelledby="acq-faq" className="bg-white pb-16 sm:pb-20">
          <Container className="max-w-3xl">
            <SectionHeading id="acq-faq" title={c.faqTitle} />
            <div className="mt-8 grid gap-3">
              {c.faq.map((item) => (
                <details key={item.q} className="group rounded-xl border bg-white p-4">
                  <summary className="cursor-pointer list-none font-semibold marker:hidden">
                    {item.q}
                  </summary>
                  <p className="mt-2 text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </Container>
        </section>

        <section aria-labelledby="acq-final" className="bg-white pb-16 sm:pb-20">
          <Container>
            <div className="rounded-3xl bg-gradient-to-br from-brand-strong via-brand to-brand-magenta px-6 py-12 text-center text-white sm:px-12">
              <h2 id="acq-final" className="text-3xl leading-tight font-bold sm:text-4xl">
                {c.finalTitle}
              </h2>
              <p className="mt-3 text-lg text-white/85">{c.finalText}</p>
              <StartCta label={c.primary} where="final" light className="mt-8" />
            </div>
          </Container>
        </section>
      </main>
      <Footer />
    </>
  );
}
