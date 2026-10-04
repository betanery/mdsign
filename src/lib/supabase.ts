import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase do app MDSign (Fase 2). Usa a chave **publishable**, feita para
 * ficar no navegador: o acesso aos dados é controlado pelas políticas RLS do banco.
 * Chaves secretas (service role, SignDoc) existem só nas Edge Functions.
 */
const env = import.meta.env;

export const supabaseUrl =
  env.VITE_SUPABASE_URL?.trim() || "https://vrksxqbopteeyeovdwpu.supabase.co";
const supabasePublishableKey =
  env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || "sb_publishable_8SnRMtjwCb_fJUJCNj2xRQ_sgzv1W0P";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
