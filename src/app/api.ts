import { supabase, supabaseUrl } from "@/lib/supabase";

/** Erro devolvido pelas Edge Functions do MDSign, com código estável para traduzir. */
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public details?: unknown,
  ) {
    super(code);
  }
}

async function request(name: string, body: FormData | Record<string, unknown>, auth: boolean) {
  const headers: Record<string, string> = {};
  if (auth) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new ApiError("not_authenticated", 401);
    headers["Authorization"] = `Bearer ${token}`;
  }
  const isForm = body instanceof FormData;
  if (!isForm) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers,
      body: isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("network_error", 0);
  }
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(String(payload?.error ?? "internal_error"), res.status, payload?.details);
  }
  return res;
}

/** Chama uma Edge Function com o token do usuário logado. */
export async function callFunction<T>(
  name: string,
  body: FormData | Record<string, unknown>,
): Promise<T> {
  const res = await request(name, body, true);
  return (await res.json().catch(() => ({}))) as T;
}

/** Igual a callFunction, mas devolve o arquivo (ex.: prévia do PDF de um modelo). */
export async function callFunctionBlob(name: string, body: Record<string, unknown>): Promise<Blob> {
  const res = await request(name, body, true);
  return res.blob();
}

/** Funções públicas (formulário/link público): sem login. */
export async function callPublicFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await request(name, body, false);
  return (await res.json().catch(() => ({}))) as T;
}

export type DocumentAction =
  | "sign-url"
  | "sync"
  | "download"
  | "attachment"
  | "cancel"
  | "remind"
  | "refuse"
  | "delete"
  | "whatsapp";

export function documentAction<T = Record<string, unknown>>(
  documentId: string,
  action: DocumentAction,
  extra: Record<string, unknown> = {},
) {
  return callFunction<T>("documents-action", { documentId, action, ...extra });
}
