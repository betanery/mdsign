import { createFileRoute } from "@tanstack/react-router";

import { Header } from "@/components/landing/header";
import { Footer } from "@/components/landing/footer";
import { Hero, HowItWorks, Platform, TrustBar } from "@/components/landing/hero";
import { Integrations } from "@/components/landing/integrations";
import { Plans } from "@/components/landing/plans";
import {
  Faq,
  FinalCta,
  Security,
  Sustainability,
  Testimonials,
} from "@/components/landing/sections";
import { absoluteUrl, siteConfig } from "@/config/site";
import { plans } from "@/content/landing";
import { htmlLang, isLocale, localizedPath, messages, type Locale } from "@/i18n";
import { seoHead } from "@/i18n/seo";

export const Route = createFileRoute("/$lang/")({
  head: ({ params }) => {
    if (!isLocale(params.lang)) return {};
    const t = messages[params.lang];
    return {
      ...seoHead(params.lang, "/", t.meta.title, t.meta.description),
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(structuredData(params.lang)) },
      ],
    };
  },
  component: Index,
});

function structuredData(locale: Locale) {
  const t = messages[locale];
  const url = absoluteUrl(localizedPath(locale));
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: siteConfig.company,
        email: siteConfig.contact.email,
        telephone: siteConfig.contact.phoneDisplay,
        address: {
          "@type": "PostalAddress",
          streetAddress: "SCS QD 01 Bl K Sala 1103 - Asa Sul",
          addressLocality: "Brasília",
          addressRegion: "DF",
          addressCountry: "BR",
        },
      },
      {
        "@type": "SoftwareApplication",
        name: siteConfig.name,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: htmlLang[locale],
        description: t.meta.description,
        ...(url ? { url } : {}),
        offers: plans
          .filter((p) => p.cta !== "specialist")
          .map((p) => ({
            "@type": "Offer",
            name: p.name,
            price: p.price ? p.price.replace(/[^\d,]/g, "").replace(",", ".") : "0",
            priceCurrency: "BRL",
          })),
      },
      {
        "@type": "FAQPage",
        inLanguage: htmlLang[locale],
        mainEntity: t.faq.items.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}

function Index() {
  return (
    <>
      <Header />
      <main id="conteudo">
        <Hero />
        <TrustBar />
        <Platform />
        <HowItWorks />
        <Integrations />
        <Plans />
        <Sustainability />
        <Testimonials />
        <Security />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
