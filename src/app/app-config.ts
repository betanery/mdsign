import { useEffect, useState } from "react";

import { callFunction } from "./api";

export type AuthLevel = "basic" | "reinforced" | "identity" | "high" | "qualified";
export type AppConfig = { authLevels: AuthLevel[]; foreignSigners: boolean };

const fallback: AppConfig = { authLevels: ["basic", "qualified"], foreignSigners: false };
let cache: Promise<AppConfig> | null = null;

/** O que o motor oferece nesta instalação (níveis de autenticação, estrangeiros sem CPF). */
export function useAppConfig(): AppConfig {
  const [config, setConfig] = useState<AppConfig>(fallback);
  useEffect(() => {
    cache ??= callFunction<AppConfig>("app-config", {}).catch(() => {
      cache = null;
      return fallback;
    });
    let alive = true;
    void cache.then((c) => alive && setConfig(c));
    return () => {
      alive = false;
    };
  }, []);
  return config;
}
