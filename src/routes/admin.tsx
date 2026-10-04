import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { AuthProvider, useAuth } from "@/app/auth";
import { AppI18nProvider, useAppI18n } from "@/app/i18n";
import { selectClass } from "@/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";

// Super Admin MDTech (PRD §37–§42): organizações, plano, consumo e políticas. Só platform_admins.
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

type Org = {
  id: string;
  name: string;
  cnpj: string | null;
  status: string;
  created_at: string;
  plan_id: string | null;
  billing_status: string | null;
  documents_total: number;
  documents_month: number;
  members: number;
  last_document_at: string | null;
};
type Plan = { id: string; name: string; sort: number };
type Policy = { id: string; description: string; config: { percent?: number }; active: boolean };

const billingStatuses = ["free", "paid", "pending", "overdue", "exempt"] as const;

function AdminPage() {
  const { t, locale } = useAppI18n();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const [o, p, pol] = await Promise.all([
      supabase.rpc("admin_overview"),
      supabase.from("plans").select("id, name, sort").order("sort"),
      supabase.from("policies").select("id, description, config, active").order("priority"),
    ]);
    setOrgs((o.data as Org[] | null) ?? []);
    setPlans((p.data as Plan[] | null) ?? []);
    setPolicies((pol.data as Policy[] | null) ?? []);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      void navigate({ to: "/app/login", search: { redirect: "/app" } });
      return;
    }
    supabase.rpc("is_platform_admin").then(({ data }) => {
      setAllowed(Boolean(data));
      if (data) void load();
    });
  }, [loading, session, navigate, load]);

  async function setPlan(org: Org, plan: string, billing: string | null) {
    const { error } = await supabase.rpc("admin_set_plan", { org: org.id, plan, billing });
    if (error) {
      toast.error(t.common.genericError);
      return;
    }
    toast.success(t.admin.planChanged);
    void load();
  }

  async function savePolicy(policy: Policy) {
    const { error } = await supabase.rpc("admin_set_policy", {
      policy: policy.id,
      is_active: policy.active,
      new_config: policy.config,
    });
    if (error) {
      toast.error(t.common.genericError);
      return;
    }
    toast.success(t.admin.policySaved);
  }

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
  const q = query.trim().toLowerCase();
  const visible = q
    ? orgs.filter((o) => o.name.toLowerCase().includes(q) || (o.cnpj ?? "").includes(q))
    : orgs;
  return (
    <main id="conteudo" className="mx-auto max-w-6xl px-4 py-8">
      <Toaster position="top-center" richColors />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-7 text-brand" aria-hidden />
          <div>
            <h1 className="text-2xl font-bold">{t.admin.title}</h1>
            <p className="text-muted-foreground">{t.admin.subtitleFull}</p>
          </div>
        </div>
        <Link to="/app" className="text-sm font-semibold text-brand">
          {t.nav.home}
        </Link>
      </div>

      <section className="mt-6 rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <h2 className="font-display text-lg font-semibold">
            {t.admin.organizations} <span className="text-muted-foreground">({orgs.length})</span>
          </h2>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.admin.search}
            aria-label={t.admin.search}
            className="max-w-xs"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">{t.organization.name}</th>
                <th className="p-3 font-medium">{t.admin.plan}</th>
                <th className="p-3 font-medium">{t.admin.billing}</th>
                <th className="p-3 text-right font-medium">{t.admin.docsTotal}</th>
                <th className="p-3 text-right font-medium">{t.admin.docsMonth}</th>
                <th className="p-3 text-right font-medium">{t.admin.members}</th>
                <th className="p-3 font-medium">{t.admin.lastDocument}</th>
                <th className="p-3 font-medium">{t.admin.created}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((o) => (
                <tr key={o.id}>
                  <td className="p-3">
                    <p className="font-medium">{o.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.cnpj ?? "—"} ·{" "}
                      {o.status === "active"
                        ? t.organization.statusActive
                        : t.organization.statusSuspended}
                    </p>
                  </td>
                  <td className="p-3">
                    <select
                      value={o.plan_id ?? ""}
                      onChange={(e) => void setPlan(o, e.target.value, null)}
                      className={selectClass}
                      aria-label={`${t.admin.changePlan}: ${o.name}`}
                    >
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <select
                      value={o.billing_status ?? "free"}
                      onChange={(e) => void setPlan(o, o.plan_id ?? "cedro", e.target.value)}
                      className={selectClass}
                      aria-label={`${t.admin.billing}: ${o.name}`}
                    >
                      {billingStatuses.map((b) => (
                        <option key={b} value={b}>
                          {t.admin.billingStatuses[b]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3 text-right tabular-nums">{o.documents_total}</td>
                  <td className="p-3 text-right tabular-nums">{o.documents_month}</td>
                  <td className="p-3 text-right tabular-nums">{o.members}</td>
                  <td className="p-3">
                    {o.last_document_at ? fmt.format(new Date(o.last_document_at)) : "—"}
                  </td>
                  <td className="p-3">{fmt.format(new Date(o.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-display text-lg font-semibold">{t.admin.policies}</h2>
        <ul className="grid gap-3">
          {policies.map((p, i) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-brand">{p.id}</p>
                <p>{p.description}</p>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={p.active}
                  onChange={(e) =>
                    setPolicies(
                      policies.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)),
                    )
                  }
                  className="size-4 accent-[var(--color-brand)]"
                />
                {t.admin.policyActive}
              </label>
              {p.config.percent !== undefined && (
                <label className="flex items-center gap-2">
                  {t.admin.percent}
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={p.config.percent}
                    onChange={(e) =>
                      setPolicies(
                        policies.map((x, j) =>
                          j === i
                            ? { ...x, config: { ...x.config, percent: Number(e.target.value) } }
                            : x,
                        ),
                      )
                    }
                    className="h-8 w-20"
                  />
                </label>
              )}
              <Button size="sm" variant="outline" onClick={() => void savePolicy(p)}>
                {t.common.save}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
