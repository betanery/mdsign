import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  fallbackLocale,
  format,
  htmlLang,
  isLocale,
  localeFromAcceptLanguage,
  LOCALE_COOKIE,
  rememberLocale,
  type Locale,
} from "@/i18n";
import en from "@/i18n/app/en";
import es from "@/i18n/app/es";
import pt, { type AppMessages } from "@/i18n/app/pt";

export const appMessages: Record<Locale, AppMessages> = { pt, en, es };

/** Preferência manual salva (cookie) → idioma do navegador → inglês (PRD §34). */
export function detectAppLocale(): Locale {
  if (typeof document === "undefined") return fallbackLocale;
  const saved = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`))?.[1];
  if (isLocale(saved)) return saved;
  return localeFromAcceptLanguage(navigator.languages?.join(",") || navigator.language);
}

type AppI18n = {
  locale: Locale;
  t: AppMessages;
  setLocale: (locale: Locale) => void;
  f: typeof format;
};

const Ctx = createContext<AppI18n | null>(null);

export function AppI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectAppLocale());

  const setLocale = useCallback((next: Locale) => {
    rememberLocale(next);
    setLocaleState(next);
  }, []);

  // O <html lang> acompanha o idioma do app (leitores de tela, tradutores).
  useEffect(() => {
    document.documentElement.lang = htmlLang[locale];
  }, [locale]);

  const value = useMemo(
    () => ({ locale, t: appMessages[locale], setLocale, f: format }),
    [locale, setLocale],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppI18n(): AppI18n {
  const value = useContext(Ctx);
  if (!value) throw new Error("useAppI18n precisa estar dentro de <AppI18nProvider>");
  return value;
}
