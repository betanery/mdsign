/**
 * Idiomas da landing (PRD Fase 1, seção 27). A mesma configuração atende as
 * Fases 2 e 3: novas telas só precisam de chaves nos dicionários.
 */

export const locales = ["pt", "en", "es"] as const;
export type Locale = (typeof locales)[number];

/** Fallback internacional quando o navegador não indica pt nem es. */
export const fallbackLocale: Locale = "en";

/** Cookie com a escolha manual do seletor PT | EN | ES (prevalece sempre). */
export const LOCALE_COOKIE = "mdsign_lang";

export const localeLabels: Record<Locale, string> = { pt: "PT", en: "EN", es: "ES" };
export const localeNames: Record<Locale, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
};
export const htmlLang: Record<Locale, string> = { pt: "pt-BR", en: "en", es: "es" };
export const ogLocale: Record<Locale, string> = { pt: "pt_BR", en: "en_US", es: "es_ES" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** pt/pt-BR → pt; es e variantes → es; demais → en. Respeita os pesos q=. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return fallbackLocale;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: tag.toLowerCase(), q: q ? Number(q.trim().slice(2)) || 0 : 1 };
    })
    .filter((item) => item.tag && item.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (base === "pt") return "pt";
    if (base === "es") return "es";
    if (base === "en") return "en";
  }
  return fallbackLocale;
}

export function localeFromCookie(header: string | null | undefined): Locale | undefined {
  const match = header?.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
  const value = match?.[1];
  return isLocale(value) ? value : undefined;
}

/** Preferência manual salva → idioma do navegador → inglês. */
export function detectLocale(request: Request): Locale {
  return (
    localeFromCookie(request.headers.get("cookie")) ??
    localeFromAcceptLanguage(request.headers.get("accept-language"))
  );
}

/**
 * Caminho com prefixo de idioma. Aceita âncoras e subpáginas:
 * localizedPath("en", "/#planos") → "/en#planos"; ("es", "/entrar") → "/es/entrar".
 */
export function localizedPath(locale: Locale, path = "/"): string {
  const [pathname = "/", hash] = path.split("#");
  const clean = pathname === "/" ? "" : pathname.replace(/\/$/, "");
  return `/${locale}${clean}${hash ? `#${hash}` : ""}`;
}

/** Troca o idioma de um caminho já localizado, mantendo o resto. */
export function switchLocalePath(pathname: string, locale: Locale): string {
  const rest = pathname.replace(/^\/(pt|en|es)(?=\/|$)/, "");
  return `/${locale}${rest}`;
}

export function rememberLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
