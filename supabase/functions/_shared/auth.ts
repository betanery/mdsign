// Identifica o usuário pelo token do Supabase e confere permissões no banco.

import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { AppError } from "./http.ts";

export const admin: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

export type Caller = {
  user: User;
  /** Cliente com a identidade do usuário: chamadas passam pelas políticas RLS. */
  asUser: SupabaseClient;
  profile: { full_name: string | null; cpf: string | null; no_cpf: boolean; locale: string };
};

export async function requireUser(req: Request): Promise<Caller> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new AppError("not_authenticated", 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new AppError("not_authenticated", 401);
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, cpf, no_cpf, locale")
    .eq("id", data.user.id)
    .single();
  if (!profile) throw new AppError("profile_missing", 400);
  return { user: data.user, asUser, profile };
}

/** Confere a permissão no banco com a identidade do usuário (mesma regra das políticas). */
export async function requirePermission(
  caller: Caller,
  organizationId: string,
  permission: string,
) {
  const { data, error } = await caller.asUser.rpc("has_org_permission", {
    org: organizationId,
    perm: permission,
  });
  if (error || !data) throw new AppError("forbidden", 403);
}
