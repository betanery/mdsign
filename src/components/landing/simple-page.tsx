import type { ReactNode } from "react";

import { Footer } from "./footer";
import { Header } from "./header";
import { Container, Eyebrow } from "./section";

/** Página interna simples (rotas reservadas para as Fases 2 e 3). */
export function SimplePage({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <Header />
      <main id="conteudo" className="bg-brand-soft/60">
        <Container className="flex min-h-[60vh] flex-col items-start justify-center py-20">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-2 max-w-2xl text-3xl font-bold sm:text-4xl">{title}</h1>
          <div className="mt-4 max-w-2xl text-lg text-muted-foreground">{children}</div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
