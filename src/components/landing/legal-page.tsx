import { AlertTriangle, Languages } from "lucide-react";

import { LEGAL_DRAFT, legalDocs, legalUi, type LegalKind } from "@/content/legal";
import { useI18n } from "@/i18n";
import { Footer } from "./footer";
import { Header } from "./header";
import { Container } from "./section";

/** Termos de Uso, Política de Privacidade e Condições do Cedro (texto em src/content/legal.ts). */
export function LegalPage({ kind }: { kind: LegalKind }) {
  const { locale } = useI18n();
  const ui = legalUi[locale];
  const doc = legalDocs[kind];
  return (
    <>
      <Header />
      <main id="conteudo" className="bg-white">
        <Container className="max-w-3xl py-12 sm:py-16">
          {LEGAL_DRAFT && (
            <p
              role="note"
              className="mb-4 flex items-start gap-2 rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-800"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {ui.draftNotice}
            </p>
          )}
          {ui.ptOnly && (
            <p className="mb-4 flex items-start gap-2 rounded-xl border bg-muted/40 p-4 text-sm">
              <Languages className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              {ui.ptOnly}
            </p>
          )}
          <div lang="pt-BR">
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{doc.title} — MDSign</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {ui.versionLabel} {doc.version}
            </p>
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
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
