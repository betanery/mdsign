import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { callFunction } from "@/app/api";
import { AuthProvider, useAuth } from "@/app/auth";
import { errorText } from "@/app/errors";
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
type Policy = {
  id: string;
  description: string;
  config: { percent?: number; days?: number };
  active: boolean;
};

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

      <BillingAdmin />

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
              {p.config.days !== undefined && (
                <label className="flex items-center gap-2">
                  {t.admin.days}
                  <Input
                    type="number"
                    min={0}
                    max={60}
                    value={p.config.days}
                    onChange={(e) =>
                      setPolicies(
                        policies.map((x, j) =>
                          j === i
                            ? { ...x, config: { ...x.config, days: Number(e.target.value) } }
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

type BillingRow = {
  organization_id: string;
  organization_name: string;
  plan_id: string;
  provider: string;
  status: string;
  billing_status: string;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  next_due_date: string | null;
  last_payment_at: string | null;
  last_sync_at: string | null;
  pending_events: number;
};
type BillingStatus = {
  environment: string | null;
  error: string | null;
  apiKeyConfigured: boolean;
  webhookTokenConfigured: boolean;
  productionEnabled: boolean;
};

/** Cobrança (Asaas): situação por organização e configuração — nunca chaves ou segredos. */
function BillingAdmin() {
  const { t, locale } = useAppI18n();
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const date = (v: string | null) =>
    v
      ? new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale, { dateStyle: "short" }).format(
          new Date(v),
        )
      : "—";

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("admin_billing");
    setRows((data as BillingRow[] | null) ?? []);
    try {
      setStatus(await callFunction<BillingStatus>("billing", { action: "status" }));
    } catch {
      setStatus(null);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function setupWebhook() {
    setBusy(true);
    try {
      await callFunction("billing", { action: "setup-webhook" });
      toast.success(t.admin.webhookReady);
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <h2 className="flex-1 font-display text-lg font-semibold">{t.admin.billing}</h2>
        {status && (
          <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
            {status.environment
              ? `${t.admin.environment}: ${status.environment}`
              : t.errors[status.error ?? "billing_not_configured"]}
            {" · "}
            {status.apiKeyConfigured ? t.admin.keyOk : t.admin.keyMissing}
            {" · "}
            {t.admin.productionOff}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => void setupWebhook()}
          disabled={busy || !status?.environment || !status.webhookTokenConfigured}
        >
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {t.admin.setupWebhook}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="p-2 font-medium">{t.admin.organization}</th>
              <th className="p-2 font-medium">{t.admin.plan}</th>
              <th className="p-2 font-medium">Provider</th>
              <th className="p-2 font-medium">{t.admin.billingStatus}</th>
              <th className="p-2 font-medium">Customer</th>
              <th className="p-2 font-medium">Subscription</th>
              <th className="p-2 font-medium">{t.billing.nextDue}</th>
              <th className="p-2 font-medium">{t.billing.lastPayment}</th>
              <th className="p-2 font-medium">{t.admin.lastSync}</th>
              <th className="p-2 font-medium">{t.admin.pendingEvents}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.organization_id}>
                <td className="p-2">{r.organization_name}</td>
                <td className="p-2">{r.plan_id}</td>
                <td className="p-2">{r.provider}</td>
                <td className="p-2">
                  {r.status} / {r.billing_status}
                </td>
                <td className="p-2 font-mono text-xs">{r.asaas_customer_id ?? "—"}</td>
                <td className="p-2 font-mono text-xs">{r.asaas_subscription_id ?? "—"}</td>
                <td className="p-2">{date(r.next_due_date)}</td>
                <td className="p-2">{date(r.last_payment_at)}</td>
                <td className="p-2">{date(r.last_sync_at)}</td>
                <td className="p-2">{r.pending_events}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
