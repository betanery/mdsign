import { createContext, useContext, type ReactNode } from "react";

import { localizedPath, type Locale } from "./config";
import en from "./messages/en";
import es from "./messages/es";
import pt, { type Messages } from "./messages/pt";

export * from "./config";
export type { Messages };

export const messages: Record<Locale, Messages> = { pt, en, es };

/** Substitui {chave} em textos com variáveis: format("Plano {plan}", { plan: "Ipê" }). */
export function format(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
}

type I18nValue = {
  locale: Locale;
  t: Messages;
  /** Caminho no idioma atual: path("/#planos") → "/en#planos". */
  path: (to?: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value: I18nValue = {
    locale,
    t: messages[locale],
    path: (to = "/") => localizedPath(locale, to),
  };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n precisa estar dentro de <I18nProvider>");
  return value;
}
