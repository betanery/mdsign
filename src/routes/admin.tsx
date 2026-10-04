import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";

import { AuthProvider, useAuth } from "@/app/auth";
import { AppI18nProvider, useAppI18n } from "@/app/i18n";
import { supabase } from "@/lib/supabase";

// Super Admin MDTech (PRD §37) — base estrutural: só para quem está em platform_admins.
// O acesso aos dados é garantido no banco (RLS + is_platform_admin), não só na tela.
export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Super Admin — MDSign" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: () => (
    <AppI18nProvider>
      <AuthProvider>
        <AdminPage />
      </AuthProvider>
    </AppI18nProvider>
  ),
});

type Org = { id: string; name: string; cnpj: string | null; status: string; created_at: string };

function AdminPage() {
  const { t, locale } = useAppI18n();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      void navigate({ to: "/app/login", search: { redirect: "/app" } });
      return;
    }
    supabase.rpc("is_platform_admin").then(async ({ data }) => {
      setAllowed(Boolean(data));
      if (data) {
        const { data: list } = await supabase
          .from("organizations")
          .select("id, name, cnpj, status, created_at")
          .order("created_at", { ascending: false });
        setOrgs((list as Org[] | null) ?? []);
      }
    });
  }, [loading, session, navigate]);

  if (allowed === null) {
    return (
      <div
        className="flex min-h-svh items-center justify-center gap-2 text-muted-foreground"
        role="status"
      >
        <Loader2 className="size-5 animate-spin" aria-hidden />
        {t.common.loading}
      </div>
    );
  }
  if (!allowed) {
    return (
      <main className="mx-auto max-w-lg p-8 text-center">
        <p>{t.common.forbidden}</p>
        <Link to="/app" className="mt-4 inline-block font-semibold text-brand">
          {t.nav.home}
        </Link>
      </main>
    );
  }

  const fmt = new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale, { dateStyle: "short" });
  return (
    <main id="conteudo" className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center gap-3">
        <ShieldCheck className="size-7 text-brand" aria-hidden />
        <div>
          <h1 className="text-2xl font-bold">{t.admin.title}</h1>
          <p className="text-muted-foreground">{t.admin.subtitle}</p>
        </div>
      </div>
      <section className="mt-6 rounded-2xl border bg-white shadow-sm">
        <h2 className="border-b p-4 font-display text-lg font-semibold">
          {t.admin.organizations} <span className="text-muted-foreground">({orgs.length})</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">{t.organization.name}</th>
                <th className="p-3 font-medium">{t.organization.cnpj}</th>
                <th className="p-3 font-medium">{t.admin.status}</th>
                <th className="p-3 font-medium">{t.admin.created}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td className="p-3 font-medium">{o.name}</td>
                  <td className="p-3">{o.cnpj ?? "—"}</td>
                  <td className="p-3">
                    {o.status === "active"
                      ? t.organization.statusActive
                      : t.organization.statusSuspended}
                  </td>
                  <td className="p-3">{fmt.format(new Date(o.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
