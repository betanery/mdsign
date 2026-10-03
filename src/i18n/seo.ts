import { absoluteUrl } from "@/config/site";
import { htmlLang, localizedPath, locales, ogLocale, type Locale } from "./config";

/**
 * Metadados de uma página em um idioma: title, description, Open Graph,
 * canonical e hreflang (pt-BR, en, es e x-default). Enquanto VITE_SITE_URL não
 * estiver definida, canonical e hreflang usam caminhos relativos.
 */
export function seoHead(locale: Locale, path: string, title: string, description: string) {
  const url = (l: Locale) => {
    const p = localizedPath(l, path);
    return absoluteUrl(p) ?? p;
  };
  const ogImage = absoluteUrl("/og-image.png");

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url(locale) },
      { property: "og:locale", content: ogLocale[locale] },
      ...locales
        .filter((l) => l !== locale)
        .map((l) => ({ property: "og:locale:alternate", content: ogLocale[l] })),
      ...(ogImage ? [{ property: "og:image", content: ogImage }] : []),
    ],
    links: [
      { rel: "canonical", href: url(locale) },
      ...locales.map((l) => ({ rel: "alternate", hrefLang: htmlLang[l], href: url(l) })),
      // Sem idioma definido, a raiz detecta o idioma do visitante.
      { rel: "alternate", hrefLang: "x-default", href: absoluteUrl(path) ?? path },
    ],
  };
}
