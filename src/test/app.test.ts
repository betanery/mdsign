import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { appMessages } from "@/app/i18n";
import { formatCnpj, formatCpf, friendlyError, isValidCnpj, isValidCpf } from "@/app/validation";
import { routeTree } from "@/routeTree.gen";

function shape(value: unknown, path = ""): string[] {
  if (Array.isArray(value))
    return [`${path}[${value.length}]`, ...value.flatMap((v, i) => shape(v, `${path}[${i}]`))];
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) => shape(v, `${path}.${k}`));
  return [path];
}

describe("textos do app", () => {
  it("en e es têm exatamente as chaves de pt", () => {
    expect(shape(appMessages.en)).toEqual(shape(appMessages.pt));
    expect(shape(appMessages.es)).toEqual(shape(appMessages.pt));
  });
});

describe("validação de documentos", () => {
  it("CPF", () => {
    expect(isValidCpf("819.761.530-69")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("819.761.530-60")).toBe(false);
    expect(formatCpf("81976153069")).toBe("819.761.530-69");
  });
  it("CNPJ", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
  it("mensagens de erro amigáveis", () => {
    const t = appMessages.pt;
    expect(friendlyError({ message: "Invalid login credentials" }, t)).toBe(
      t.auth.invalidCredentials,
    );
    expect(friendlyError({ message: "last_owner", code: "42501" }, t)).toBe(
      t.organization.lastOwner,
    );
    expect(friendlyError({ message: "forbidden", code: "42501" }, t)).toBe(t.common.forbidden);
    expect(
      friendlyError(
        { message: "Email address not authorized", code: "email_address_not_authorized" },
        t,
      ),
    ).toBe(t.auth.emailNotSent);
    expect(friendlyError({ message: "boom" }, t)).toBe(t.common.genericError);
  });
});

describe("rotas do app", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
  it.each([
    "/app",
    "/app/login",
    "/app/signup",
    "/app/forgot-password",
    "/app/reset-password",
    "/app/organization",
    "/app/settings",
    "/app/documents",
    "/app/invite/abc",
    "/admin",
  ])("%s tem rota", (path) => {
    expect(router.matchRoutes(path).at(-1)?.routeId).not.toBe(rootRouteId);
  });
});

describe("política de senha", () => {
  it("exige 8 caracteres, 1 número e 1 especial", async () => {
    const { isStrongPassword, passwordChecks } = await import("@/app/password");
    expect(isStrongPassword("abc12345")).toBe(false); // sem especial
    expect(isStrongPassword("abcdefg!")).toBe(false); // sem número
    expect(isStrongPassword("ab1!")).toBe(false); // curta
    expect(isStrongPassword("Senha#2026")).toBe(true);
    expect(isStrongPassword("çáéíóú1_")).toBe(true);
    expect(passwordChecks("Senha#2026", "Senha#2026").match).toBe(true);
    expect(passwordChecks("Senha#2026", "Senha#2025").match).toBe(false);
  });
});
