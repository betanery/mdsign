import { useEffect, useState } from "react";

import { callFunction } from "./api";

export type AuthLevel =
  | "basic"
  | "reinforced"
  | "reinforced_whatsapp"
  | "identity"
  | "identity_datavalid"
  | "high"
  | "qualified";

/** Níveis que exigem celular (código por SMS ou WhatsApp). */
export const needsPhone = (level: AuthLevel) =>
  level === "reinforced" || level === "reinforced_whatsapp";
export type AppConfig = {
  authLevels: AuthLevel[];
  foreignSigners: boolean;
  /** Cobrança pelo Asaas: "sandbox" nesta fase; null se não estiver configurada. */
  billingEnvironment: "sandbox" | "production" | null;
  /** Provedor de WhatsApp configurado no servidor. */
  whatsappConfigured: boolean;
  /** Grupos com quórum ("qualquer N do grupo"): política ligada ou Super Admin. */
  quorumGroups?: boolean;
  /** E-mail próprio (Resend): "test" = remetente de teste (só Super Admin). */
  ownEmail?: "off" | "test" | "on";
  /** false até a resposta do servidor chegar (evita avisos piscando com o valor padrão). */
  loaded?: boolean;
};

const fallback: AppConfig = {
  authLevels: ["basic"],
  foreignSigners: false,
  billingEnvironment: null,
  whatsappConfigured: false,
};
let cache: Promise<AppConfig> | null = null;

/** O que o motor oferece nesta instalação (níveis de autenticação, estrangeiros sem CPF). */
export function useAppConfig(): AppConfig {
  const [config, setConfig] = useState<AppConfig>(fallback);
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    // A 1ª consulta pode falhar (ex.: sessão ainda carregando): tenta de novo algumas vezes.
    const load = (attempt: number) => {
      cache ??= callFunction<AppConfig>("app-config", {}).catch(() => {
        cache = null;
        return null;
      }) as Promise<AppConfig>;
      void cache.then((c) => {
        if (!alive) return;
        if (c) setConfig({ ...c, loaded: true });
        else if (attempt < 4) timer = window.setTimeout(() => load(attempt + 1), 1500);
      });
    };
    load(1);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);
  return config;
}
