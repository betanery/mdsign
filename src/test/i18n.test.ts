import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";
import {
  detectLocale,
  localeFromAcceptLanguage,
  localizedPath,
  messages,
  switchLocalePath,
} from "@/i18n";

describe("detecção de idioma", () => {
  it("usa o idioma do navegador: pt → pt, es → es, demais → en", () => {
    expect(localeFromAcceptLanguage("pt-BR,pt;q=0.9,en;q=0.8")).toBe("pt");
    expect(localeFromAcceptLanguage("es-AR,es;q=0.9")).toBe("es");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("fr-FR,fr;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("fr;q=0.9,es;q=0.8")).toBe("es");
    expect(localeFromAcceptLanguage("en;q=0.5,pt;q=0.9")).toBe("pt");
    expect(localeFromAcceptLanguage(null)).toBe("en");
  });

  it("a escolha manual salva prevalece sobre o navegador", () => {
    const request = new Request("https://mdsign.test/", {
      headers: { cookie: "a=1; mdsign_lang=es", "accept-language": "pt-BR" },
    });
    expect(detectLocale(request)).toBe("es");
  });

  it("monta e troca caminhos por idioma", () => {
    expect(localizedPath("en", "/#planos")).toBe("/en#planos");
    expect(localizedPath("es", "/entrar")).toBe("/es/entrar");
    expect(localizedPath("pt")).toBe("/pt");
    expect(switchLocalePath("/pt/desenvolvedores", "en")).toBe("/en/desenvolvedores");
    expect(switchLocalePath("/es", "pt")).toBe("/pt");
  });
});

describe("dicionários", () => {
  // Mesma estrutura nos três idiomas: mesmas chaves e listas com o mesmo tamanho.
  function shape(value: unknown, path = ""): string[] {
    if (Array.isArray(value))
      return [`${path}[${value.length}]`, ...value.flatMap((v, i) => shape(v, `${path}[${i}]`))];
    if (value && typeof value === "object")
      return Object.entries(value).flatMap(([k, v]) => shape(v, `${path}.${k}`));
    return [path];
  }

  it("en e es têm a mesma estrutura de pt", () => {
    expect(shape(messages.en)).toEqual(shape(messages.pt));
    expect(shape(messages.es)).toEqual(shape(messages.pt));
  });

  it("Cedro mantém os 5 documentos e o título traz a marca em todos os idiomas", () => {
    for (const locale of ["pt", "en", "es"] as const) {
      const t = messages[locale];
      expect(t.plans.items.cedro.features[0]).toMatch(/5/);
      expect(t.meta.title).toContain("MDSign");
    }
  });
});

describe("rotas", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

  it.each(["/", "/pt", "/en", "/es", "/en/desenvolvedores", "/es/entrar"])(
    "%s tem rota",
    (path) => {
      expect(router.matchRoutes(path).at(-1)?.routeId).not.toBe(rootRouteId);
    },
  );
});
