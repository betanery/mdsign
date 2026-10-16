import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { MfaChallenge } from "./components/mfa";

type AuthState = {
  session: Session | null;
  user: User | null;
  /** true até a primeira leitura da sessão terminar. */
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // Verificação em duas etapas: quem ativou precisa do código antes de entrar em qualquer tela.
  const [needsCode, setNeedsCode] = useState(false);
  useEffect(() => {
    if (!session) {
      setNeedsCode(false);
      return;
    }
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      setNeedsCode(data?.nextLevel === "aal2" && data.currentLevel !== "aal2");
    });
  }, [session]);

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
      try {
        localStorage.removeItem(CURRENT_ORG_KEY);
      } catch {
        // armazenamento indisponível
      }
    },
  };
  return (
    <Ctx.Provider value={value}>
      {needsCode ? <MfaChallenge onSignOut={() => void value.signOut()} /> : children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return value;
}

export const CURRENT_ORG_KEY = "mdsign_current_org";
