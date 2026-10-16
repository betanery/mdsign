import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, withSecurityHeaders } from "@/lib/security-headers";

describe("cabeçalhos de segurança", () => {
  const csp = contentSecurityPolicy();
  const dir = (name: string) =>
    csp
      .split("; ")
      .find((d) => d.startsWith(`${name} `))
      ?.split(" ")
      .slice(1) ?? [];

  it("libera só o necessário para assinatura, PDF e CEP", () => {
    expect(dir("default-src")).toEqual(["'self'"]);
    expect(dir("frame-src")).toContain("https://sign.signdocmd.com.br");
    expect(dir("script-src")).toContain("https://cdn.lacunasoftware.com");
    expect(dir("script-src")).toContain("https://cdnjs.cloudflare.com");
    expect(dir("connect-src")).toContain("https://viacep.com.br");
    expect(dir("object-src")).toEqual(["'none'"]);
    expect(dir("script-src")).not.toContain("*");
  });

  it("impede exibir o MDSign em outros sites, exceto o editor do Lovable", () => {
    expect(dir("frame-ancestors")).toEqual([
      "'self'",
      "https://lovable.dev",
      "https://*.lovable.dev",
      "https://*.lovableproject.com",
    ]);
  });

  it("acrescenta os cabeçalhos sem mudar status e corpo", async () => {
    const r = withSecurityHeaders(new Response("oi", { status: 201, headers: { "x-a": "1" } }));
    expect(r.status).toBe(201);
    expect(await r.text()).toBe("oi");
    expect(r.headers.get("x-a")).toBe("1");
    expect(r.headers.get("content-security-policy")).toContain("frame-ancestors");
    expect(r.headers.get("permissions-policy")).toContain("microphone=()");
  });
});
