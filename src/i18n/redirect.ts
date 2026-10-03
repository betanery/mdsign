import { detectLocale, localizedPath } from "./config";

/**
 * Resposta 302 para a versão no idioma do visitante, preservando a query
 * (UTMs). Usada pelas rotas sem prefixo: "/", "/entrar", "/desenvolvedores".
 */
export function redirectToLocale(request: Request, path = "/"): Response {
  const url = new URL(request.url);
  const target = `${localizedPath(detectLocale(request), path)}${url.search}`;
  return new Response(null, {
    status: 302,
    headers: { Location: target, Vary: "Accept-Language, Cookie", "Cache-Control": "no-store" },
  });
}
