import { supabase, supabaseUrl } from "@/lib/supabase";

/** Erro devolvido pelas Edge Functions do MDSign, com código estável para traduzir. */
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

/** Chama uma Edge Function com o token do usuário logado. */
export async function callFunction<T>(
  name: string,
  body: FormData | Record<string, unknown>,
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError("not_authenticated", 401);
  const isForm = body instanceof FormData;
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(isForm ? {} : { "Content-Type": "application/json" }),
    },
    body: isForm ? body : JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(String(payload?.error ?? "internal_error"), res.status);
  return payload as T;
}

export type DocumentAction = "sign-url" | "sync" | "download" | "cancel" | "remind";

export function documentAction<T = Record<string, unknown>>(
  documentId: string,
  action: DocumentAction,
  extra: Record<string, unknown> = {},
) {
  return callFunction<T>("documents-action", { documentId, action, ...extra });
}
