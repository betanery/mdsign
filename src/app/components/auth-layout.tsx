import type { ReactNode } from "react";

import { Logo } from "@/components/landing/logo";
import { LanguageSelect, SkipLink } from "./language-select";

/** Moldura das telas de acesso (entrar, cadastro, recuperar senha, convite). */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-gradient-to-br from-white via-brand-soft to-[oklch(0.94_0.05_330)]">
      <SkipLink />
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <a href="/" aria-label="MDSign">
          <Logo />
        </a>
        <LanguageSelect />
      </header>
      <main
        id="conteudo"
        className="flex flex-1 items-start justify-center px-4 pt-6 pb-12 sm:pt-12"
      >
        <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-xl sm:p-8">
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 border-t pt-4 text-center text-sm">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export function FormMessage({
  kind,
  children,
}: {
  kind: "error" | "success";
  children: ReactNode;
}) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={
        kind === "error"
          ? "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          : "rounded-md bg-success/10 px-3 py-2 text-sm text-success"
      }
    >
      {children}
    </p>
  );
}
