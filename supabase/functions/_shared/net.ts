// Rede das funções: tempo limite, retentativa só para leituras, máscara de dados pessoais nos
// logs e comparação de segredos em tempo constante (auditoria 16/10/2026, Fase 1).

export const TIMEOUT_MS = 20_000;

export class NetError extends Error {
  constructor(
    public kind: "timeout" | "network",
    message: string,
  ) {
    super(message);
  }
}

/**
 * fetch com tempo limite. Leituras (GET) têm uma retentativa em falha de rede, tempo esgotado
 * ou 5xx; escritas nunca são repetidas aqui (evita criar documento ou cobrança em dobro).
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const attempts = method === "GET" ? 2 : 1;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status >= 500 && i < attempts - 1) {
        last = new Error(`http_${res.status}`);
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      return res;
    } catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500));
    }
  }
  const name = (last as { name?: string })?.name;
  if (name === "TimeoutError" || name === "AbortError")
    throw new NetError("timeout", `timeout after ${timeoutMs}ms`);
  throw new NetError("network", String((last as Error)?.message ?? last).slice(0, 200));
}

/** Tira CPF, CNPJ, e-mail e telefone de textos que vão para log ou tabela de erros. */
export function maskPersonal(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[cnpj]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]")
    .replace(/(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, "[telefone]");
}

export function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
