import { AlertTriangle } from "lucide-react";

import { legal, LEGAL_DRAFT, type LegalDoc } from "@/content/legal";
import { useI18n } from "@/i18n";
import { Footer } from "./footer";
import { Header } from "./header";
import { Container } from "./section";

/** Termos de uso e Política de privacidade (texto em src/content/legal.ts). */
export function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const { locale } = useI18n();
  const copy = legal[locale];
  const doc: LegalDoc = copy[kind];
  return (
    <>
      <Header />
      <main id="conteudo" className="bg-white">
        <Container className="max-w-3xl py-12 sm:py-16">
          {LEGAL_DRAFT && (
            <p
              role="note"
              className="mb-6 flex items-start gap-2 rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-800"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {copy.draftNotice}
            </p>
          )}
          <h1 className="text-3xl font-bold sm:text-4xl">{doc.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {copy.updatedLabel}: {doc.updated}
          </p>
          <p className="mt-6 text-base leading-relaxed">{doc.intro}</p>
          {doc.sections.map((s) => (
            <section key={s.title} className="mt-8">
              <h2 className="text-xl font-semibold">{s.title}</h2>
              {s.paragraphs.map((p) => (
                <p key={p} className="mt-3 leading-relaxed text-foreground/85">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </Container>
      </main>
      <Footer />
    </>
  );
}
