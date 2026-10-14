import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/lib/supabase";
import { CURRENT_ORG_KEY, useAuth } from "./auth";

export type OrgRole = "owner" | "admin" | "manager" | "operator" | "member" | "viewer" | "finance";

export type Permission =
  | "documents.view"
  | "documents.create"
  | "documents.manage"
  | "templates.manage"
  | "bulk.send"
  | "contacts.manage"
  | "members.manage"
  | "units.manage"
  | "integrations.manage"
  | "billing.view"
  | "billing.manage"
  | "reports.export"
  | "settings.manage"
  | "audit.view";

export type Organization = {
  id: string;
  name: string;
  cnpj: string | null;
  locale: string;
  status: string;
  role: OrgRole;
  /** Conta encerrada: data do encerramento e fim da janela de exportação (30 dias). */
  closed_at?: string | null;
  export_until?: string | null;
};

type OrgState = {
  organizations: Organization[];
  current: Organization | null;
  loading: boolean;
  setCurrent: (id: string) => void;
  /** Permissões do usuário na organização atual (vindas do banco, não do código). */
  can: (permission: Permission) => boolean;
  isPlatformAdmin: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<OrgState | null>(null);

function readSaved(): string | null {
  try {
    return localStorage.getItem(CURRENT_ORG_KEY);
  } catch {
    return null;
  }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => readSaved());
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("memberships")
      .select("role, organizations (id, name, cnpj, locale, status, closed_at, export_until)")
      .eq("user_id", user.id)
      .eq("status", "active");
    const list: Organization[] = (data ?? [])
      .filter((m) => m.organizations)
      .map((m) => {
        const org = m.organizations as unknown as Omit<Organization, "role">;
        return { ...org, role: m.role as OrgRole };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    setOrganizations(list);
    const { data: admin } = await supabase.rpc("is_platform_admin");
    setIsPlatformAdmin(Boolean(admin));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const current = useMemo(
    () => organizations.find((o) => o.id === currentId) ?? organizations[0] ?? null,
    [organizations, currentId],
  );

  useEffect(() => {
    if (!current) {
      setPermissions(new Set());
      return;
    }
    supabase.rpc("my_permissions", { org: current.id }).then(({ data }) => {
      setPermissions(new Set((data as string[] | null) ?? []));
    });
  }, [current]);

  const setCurrent = useCallback((id: string) => {
    setCurrentId(id);
    try {
      localStorage.setItem(CURRENT_ORG_KEY, id);
    } catch {
      // armazenamento indisponível
    }
  }, []);

  const value: OrgState = {
    organizations,
    current,
    loading,
    setCurrent,
    can: (p) => permissions.has(p),
    isPlatformAdmin,
    refresh,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrg(): OrgState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useOrg precisa estar dentro de <OrgProvider>");
  return value;
}
