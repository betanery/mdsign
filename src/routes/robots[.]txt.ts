import { createFileRoute } from "@tanstack/react-router";

import { siteConfig } from "@/config/site";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = siteConfig.siteUrl ?? new URL(request.url).origin;
        const body = `User-agent: *\nAllow: /\nDisallow: /entrar\nDisallow: /app\nDisallow: /admin\nDisallow: /f/\nDisallow: /pt/entrar\nDisallow: /en/entrar\nDisallow: /es/entrar\n\nSitemap: ${origin}/sitemap.xml\n`;
        return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      },
    },
  },
});
