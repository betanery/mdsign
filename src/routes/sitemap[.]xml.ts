import { createFileRoute } from "@tanstack/react-router";

import { siteConfig } from "@/config/site";
import { CAMPAIGN_SLUGS } from "@/content/acquisition";
import { htmlLang, localizedPath, locales } from "@/i18n";

/** Páginas indexáveis (sem o idioma); cada uma sai nas três versões. */
const paths = [
  "/",
  "/desenvolvedores",
  "/assinar-gratis",
  "/titular",
  "/validar",
  ...CAMPAIGN_SLUGS.map((slug) => `/lp/${slug}`),
];

// Sitemap multilíngue: cada URL lista as alternativas por idioma (PRD 27.2).
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = siteConfig.siteUrl ?? new URL(request.url).origin;
        const urls = paths.flatMap((path) => {
          const alternates = [
            ...locales.map(
              (l) =>
                `    <xhtml:link rel="alternate" hreflang="${htmlLang[l]}" href="${origin}${localizedPath(l, path)}"/>`,
            ),
            `    <xhtml:link rel="alternate" hreflang="x-default" href="${origin}${path}"/>`,
          ].join("\n");
          return locales.map(
            (l) =>
              `  <url>\n    <loc>${origin}${localizedPath(l, path)}</loc>\n${alternates}\n  </url>`,
          );
        });
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
        return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
      },
    },
  },
});
