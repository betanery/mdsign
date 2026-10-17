import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { callFunction } from "@/app/api";
import { AuthProvider, useAuth } from "@/app/auth";
import { AdminDataRequests } from "@/app/components/admin-data-requests";
import { CommercialAdmin } from "@/app/components/admin-commercial";
import { GrowthModule } from "@/app/growth/module";
import { PlansAdminModule } from "@/app/plans-admin/module";
import { usePlansAdminTexts } from "@/app/plans-admin/texts";
import { useGrowthTexts } from "@/app/growth/texts";
import { useConfirm } from "@/app/components/confirm-dialog";
import { errorText } from "@/app/errors";
import { AppI18nProvider, useAppI18n } from "@/app/i18n";
import { selectClass } from "@/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// Super Admin MDTech (PRD §37–§42): visão geral, saúde da plataforma, organizações (plano,
// cobrança, suspensão), cobrança Asaas, políticas e histórico das ações. Só platform_admins.
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
  subscription_status: string | null;
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
  config: Record<string, number>;
  active: boolean;
};
type Health = Record<string, number> & {
  jobs: {
    name: string;
    active: boolean;
    last_run: string | null;
    last_status: string | null;
    failed_24h: number;
  }[];
};
type Activity = {
  id: number;
  created_at: string;
  action: string;
  organization_name: string | null;
  actor_email: string | null;
  entity_id: string | null;
  data: Record<string, unknown>;
};

const billingStatuses = ["free", "paid", "pending", "overdue", "exempt"] as const;
const healthKeys = [
  "notifications_pending",
  "notifications_failed_24h",
  "webhooks_pending",
  "webhooks_failed_24h",
  "billing_events_pending",
  "bulk_stuck",
  "engine_errors_24h",
  "data_requests_open",
  "data_requests_overdue",
] as const;
// Filas com algo pendente são normais; falhas e travamentos pedem atenção.
const alarmKeys = new Set([
  "notifications_failed_24h",
  "webhooks_failed_24h",
  "bulk_stuck",
  "engine_errors_24h",
  "data_requests_overdue",
]);
const needsAttention = (o: Org) =>
  o.subscription_status === "past_due" ||
  o.subscription_status === "suspended" ||
  o.billing_status === "overdue";

function AdminPage() {
  const { t, f, locale } = useAppI18n();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  // Super Admin exige a verificação em duas etapas (trava no banco: is_platform_admin).
  const [needsMfa, setNeedsMfa] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<Health | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const growthTexts = useGrowthTexts();
  const plansTexts = usePlansAdminTexts();

  const load = useCallback(async () => {
    setRefreshing(true);
    const [o, p, pol, h, a] = await Promise.all([
      supabase.rpc("admin_overview"),
      supabase.from("plans").select("id, name, sort").order("sort"),
      supabase.from("policies").select("id, description, config, active").order("priority"),
      supabase.rpc("admin_health"),
      supabase.rpc("admin_activity", { lim: 50 }),
    ]);
    setOrgs((o.data as Org[] | null) ?? []);
    setPlans((p.data as Plan[] | null) ?? []);
    // growth_settings tem listas e é editada em Growth & Aquisição → Configurações.
    const list = ((pol.data as Policy[] | null) ?? []).filter((x) => x.id !== "growth_settings");
    setPolicies(list);
    setSaved(Object.fromEntries(list.map((x) => [x.id, JSON.stringify([x.active, x.config])])));
    setHealth((h.data as Health | null) ?? null);
    setActivity((a.data as Activity[] | null) ?? []);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      void navigate({ to: "/app/login", search: { redirect: "/app" } });
      return;
    }
    supabase.rpc("platform_admin_status").then(({ data }) => {
      setNeedsMfa(data === "needs_mfa");
      setAllowed(data === "ok");
      if (data === "ok") void load();
    });
  }, [loading, session, navigate, load]);

  const planName = useCallback(
    (id: string | null) => plans.find((p) => p.id === id)?.name ?? id ?? "—",
    [plans],
  );

  async function setPlan(org: Org, plan: string) {
    const ok = await confirm({
      title: f(t.admin.planTitle, { name: org.name }),
      text: f(t.admin.planText, { from: planName(org.plan_id), to: planName(plan) }),
      action: t.admin.confirmChange,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("admin_set_plan", { org: org.id, plan, billing: null });
    if (error) {
      toast.error(t.common.genericError);
      return;
    }
    toast.success(t.admin.planChanged);
    void load();
  }

  async function setBilling(org: Org, billing: string) {
    const ok = await confirm({
      title: f(t.admin.billingTitle, { name: org.name }),
      text: f(t.admin.billingText, {
        from: t.admin.billingStatuses[org.billing_status ?? "free"] ?? "—",
        to: t.admin.billingStatuses[billing] ?? billing,
      }),
      action: t.admin.confirmChange,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("admin_set_plan", {
      org: org.id,
      plan: org.plan_id ?? "cedro",
      billing,
    });
    if (error) {
      toast.error(t.common.genericError);
      return;
    }
    toast.success(t.admin.planChanged);
    void load();
  }

  async function toggleSuspension(org: Org) {
    const suspend = org.subscription_status !== "suspended";
    const ok = await confirm({
      title: f(suspend ? t.admin.suspendTitle : t.admin.reactivateTitle, { name: org.name }),
      text: suspend ? t.admin.suspendText : t.admin.reactivateText,
      action: suspend ? t.admin.suspend : t.admin.reactivate,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("admin_set_subscription_status", {
      org: org.id,
      new_status: suspend ? "suspended" : "active",
    });
    if (error) {
      toast.error(t.common.genericError);
      return;
    }
    toast.success(suspend ? t.admin.suspended : t.admin.reactivated);
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
    void load();
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
        <p>{needsMfa ? t.mfa.adminRequired : t.common.forbidden}</p>
        <Link to="/app" className="mt-4 inline-block font-semibold text-brand">
          {t.nav.home}
        </Link>
      </main>
    );
  }

  const fmtDate = (v: string | null, withTime = false) =>
    v
      ? new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale, {
          dateStyle: "short",
          ...(withTime ? { timeStyle: "short" } : {}),
        }).format(new Date(v))
      : "—";

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
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && "animate-spin")} aria-hidden />
            {t.admin.refresh}
          </Button>
          <Link to="/app" className="text-sm font-semibold text-brand">
            {t.nav.home}
          </Link>
        </div>
      </div>

      <Tabs defaultValue="overview" className="mt-6">
        <div className="overflow-x-auto">
          <TabsList>
            {(
              [
                "overview",
                "growth",
                "plans",
                "orgs",
                "billing",
                "dsr",
                "policies",
                "activity",
              ] as const
            ).map((k) => (
              <TabsTrigger key={k} value={k}>
                {k === "growth"
                  ? growthTexts.tab
                  : k === "plans"
                    ? plansTexts.tab
                    : t.admin.tabs[k]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4">
          <PlatformAlerts fmtDate={fmtDate} />
          <Overview orgs={orgs} health={health} planName={planName} fmtDate={fmtDate} />
          <EngineErrors fmtDate={fmtDate} />
        </TabsContent>

        <TabsContent value="growth" className="mt-4">
          <GrowthModule />
        </TabsContent>

        <TabsContent value="plans" className="mt-4">
          <PlansAdminModule />
        </TabsContent>

        <TabsContent value="orgs" className="mt-4">
          <Organizations
            orgs={orgs}
            plans={plans}
            fmtDate={fmtDate}
            onPlan={(o, p) => void setPlan(o, p)}
            onBilling={(o, b) => void setBilling(o, b)}
            onSuspend={(o) => void toggleSuspension(o)}
          />
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <BillingAdmin />
          <CommercialAdmin />
        </TabsContent>

        <TabsContent value="dsr" className="mt-4">
          <AdminDataRequests fmtDate={fmtDate} />
        </TabsContent>

        <TabsContent value="policies" className="mt-4">
          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <ul className="grid gap-3">
              {policies.map((p, i) => {
                const dirty = saved[p.id] !== JSON.stringify([p.active, p.config]);
                const set = (patch: Partial<Policy>) =>
                  setPolicies(policies.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <li key={p.id} className="grid gap-3 rounded-xl border p-4 text-sm">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{t.admin.policyNames[p.id] ?? p.id}</p>
                        <p className="text-muted-foreground">{p.description}</p>
                      </div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={p.active}
                          onChange={(e) => set({ active: e.target.checked })}
                          className="size-4 accent-[var(--color-brand)]"
                        />
                        {t.admin.policyActive}
                      </label>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      {Object.entries(p.config).map(([k, v]) => (
                        <label key={k} className="grid gap-1">
                          <span className="text-xs text-muted-foreground">
                            {t.admin.configLabels[k] ?? k}
                          </span>
                          <Input
                            type="number"
                            min={0}
                            max={k === "percent" ? 100 : 100000}
                            value={v}
                            onChange={(e) =>
                              set({ config: { ...p.config, [k]: Number(e.target.value) } })
                            }
                            className="h-8 w-28"
                          />
                        </label>
                      ))}
                      <div className="ml-auto flex items-center gap-3">
                        {dirty && (
                          <span className="text-xs text-orange-700">{t.admin.policyUnsaved}</span>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!dirty}
                          onClick={() => void savePolicy(p)}
                        >
                          {t.common.save}
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <section className="rounded-2xl border bg-white shadow-sm">
            {activity.length === 0 ? (
              <p className="p-5 text-muted-foreground">{t.admin.activityEmpty}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">{t.admin.activityWhen}</th>
                      <th className="p-3 font-medium">{t.admin.activityWhat}</th>
                      <th className="p-3 font-medium">{t.admin.organization}</th>
                      <th className="p-3 font-medium">{t.admin.activityDetail}</th>
                      <th className="p-3 font-medium">{t.admin.activityWho}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {activity.map((a) => (
                      <tr key={a.id}>
                        <td className="whitespace-nowrap p-3">{fmtDate(a.created_at, true)}</td>
                        <td className="p-3">{t.admin.actions[a.action] ?? a.action}</td>
                        <td className="p-3">
                          {a.organization_name ??
                            (a.action === "policy.changed"
                              ? (t.admin.policyNames[a.entity_id ?? ""] ?? a.entity_id)
                              : "—")}
                        </td>
                        <td className="p-3 text-muted-foreground">{activityDetail(a)}</td>
                        <td className="p-3">{a.actor_email ?? t.admin.platform}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>
      {confirmDialog}
    </main>
  );

  function activityDetail(a: Activity) {
    const d = a.data;
    if (a.action === "plan.changed") {
      const parts = [`${planName((d["from"] as string) ?? null)} → ${planName(d["to"] as string)}`];
      if (d["billing"]) parts.push(t.admin.billingStatuses[d["billing"] as string] ?? "");
      return parts.join(" · ");
    }
    if (a.action.startsWith("subscription.")) {
      const s = (k: string) => t.plan.statuses[(d[k] as string) ?? ""] ?? (d[k] as string) ?? "—";
      return `${s("from")} → ${s("to")}`;
    }
    if (a.action === "policy.changed") {
      const to = d["to"] as { active?: boolean; config?: Record<string, number> } | undefined;
      const cfg = Object.entries(to?.config ?? {})
        .map(([k, v]) => `${t.admin.configLabels[k] ?? k}: ${v}`)
        .join(" · ");
      return [to?.active === false ? `${t.admin.policyActive}: —` : null, cfg]
        .filter(Boolean)
        .join(" · ");
    }
    return "";
  }
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Building2;
  label: string;
  value: number | string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className={cn("size-4", tone === "warn" ? "text-orange-600" : "text-brand")} />
        {label}
      </div>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums",
          tone === "warn" && Number(value) > 0 && "text-orange-700",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Overview({
  orgs,
  health,
  planName,
  fmtDate,
}: {
  orgs: Org[];
  health: Health | null;
  planName: (id: string | null) => string;
  fmtDate: (v: string | null, withTime?: boolean) => string;
}) {
  const { t, f } = useAppI18n();
  const sum = (k: "documents_month" | "members") => orgs.reduce((s, o) => s + (o[k] ?? 0), 0);
  const mix = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orgs) m.set(o.plan_id ?? "—", (m.get(o.plan_id ?? "—") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [orgs]);
  const alarms = health
    ? healthKeys.filter((k) => alarmKeys.has(k) && (health[k] ?? 0) > 0).length +
      health.jobs.filter((j) => !j.active || j.failed_24h > 0).length
    : 0;

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi icon={Building2} label={t.admin.kpi.orgs} value={orgs.length} />
        <Kpi icon={FileText} label={t.admin.kpi.docsMonth} value={sum("documents_month")} />
        <Kpi
          icon={FileText}
          label={t.admin.kpi.docsToday}
          value={health?.["documents_today"] ?? 0}
        />
        <Kpi icon={Clock} label={t.admin.kpi.pending} value={health?.["documents_pending"] ?? 0} />
        <Kpi icon={Users} label={t.admin.kpi.members} value={sum("members")} />
        <Kpi
          icon={Wallet}
          label={t.admin.kpi.paying}
          value={orgs.filter((o) => o.billing_status === "paid").length}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">{t.admin.health}</h2>
            {health && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                  alarms ? "bg-orange-100 text-orange-700" : "bg-success/15 text-green-800",
                )}
              >
                {alarms ? (
                  <AlertTriangle className="size-3.5" aria-hidden />
                ) : (
                  <CheckCircle2 className="size-3.5" aria-hidden />
                )}
                {alarms ? t.admin.healthWarn : t.admin.healthOk}
              </span>
            )}
          </div>
          {health ? (
            <>
              <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                {healthKeys.map((k) => {
                  const n = health[k] ?? 0;
                  const bad = alarmKeys.has(k) && n > 0;
                  return (
                    <li
                      key={k}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl border px-3 py-2",
                        bad && "border-orange-300 bg-orange-50",
                      )}
                    >
                      <span className="min-w-0">{t.admin.healthItems[k]}</span>
                      <span className={cn("font-semibold tabular-nums", bad && "text-orange-700")}>
                        {n}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <h3 className="mt-5 text-sm font-semibold">{t.admin.jobsTitle}</h3>
              <ul className="mt-2 grid gap-2 text-sm">
                {health.jobs.map((j) => {
                  const bad = !j.active || j.failed_24h > 0;
                  return (
                    <li
                      key={j.name}
                      className={cn(
                        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2",
                        bad && "border-orange-300 bg-orange-50",
                      )}
                    >
                      <span className="min-w-0 flex-1 font-medium">
                        {t.admin.jobNames[j.name] ?? j.name}
                      </span>
                      <span className="text-muted-foreground">
                        {!j.active
                          ? t.admin.jobOff
                          : j.last_run
                            ? `${t.admin.jobLast}: ${fmtDate(j.last_run, true)}`
                            : t.admin.jobNever}
                      </span>
                      {j.failed_24h > 0 && (
                        <span className="font-semibold text-orange-700">
                          {f(t.admin.jobFailed, { n: String(j.failed_24h) })}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="mt-3 text-muted-foreground">{t.common.loading}</p>
          )}
        </section>

        <div className="grid min-w-0 content-start gap-6">
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="font-display text-lg font-semibold">{t.admin.plansMix}</h2>
            <ul className="mt-3 grid gap-2 text-sm">
              {mix.map(([plan, n]) => (
                <li key={plan} className="grid gap-1">
                  <div className="flex justify-between">
                    <span>{planName(plan)}</span>
                    <span className="tabular-nums text-muted-foreground">{n}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-brand"
                      style={{ width: `${Math.max(4, (n / Math.max(1, orgs.length)) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <AlertTriangle className="size-4 text-orange-600" aria-hidden />
              {t.admin.kpi.attention}
            </h2>
            {orgs.filter(needsAttention).length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t.admin.healthOk}</p>
            ) : (
              <ul className="mt-2 grid gap-1 text-sm">
                {orgs.filter(needsAttention).map((o) => (
                  <li key={o.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{o.name}</span>
                    <span className="shrink-0 text-orange-700">
                      {t.plan.statuses[o.subscription_status ?? ""] ??
                        t.admin.billingStatuses[o.billing_status ?? ""]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Organizations({
  orgs,
  plans,
  fmtDate,
  onPlan,
  onBilling,
  onSuspend,
}: {
  orgs: Org[];
  plans: Plan[];
  fmtDate: (v: string | null) => string;
  onPlan: (o: Org, plan: string) => void;
  onBilling: (o: Org, billing: string) => void;
  onSuspend: (o: Org) => void;
}) {
  const { t } = useAppI18n();
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");

  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  const visible = orgs.filter(
    (o) =>
      (!q || o.name.toLowerCase().includes(q) || (digits && (o.cnpj ?? "").includes(digits))) &&
      (!plan || o.plan_id === plan) &&
      (!status || (o.subscription_status ?? "active") === status),
  );
  const statuses = [...new Set(orgs.map((o) => o.subscription_status ?? "active"))];

  return (
    <section className="rounded-2xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <h2 className="flex-1 font-display text-lg font-semibold">
          {t.admin.organizations}{" "}
          <span className="text-muted-foreground">
            ({visible.length}
            {visible.length !== orgs.length && `/${orgs.length}`})
          </span>
        </h2>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className={cn(selectClass, "w-auto")}
          aria-label={t.admin.plan}
        >
          <option value="">{t.admin.filterPlan}</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={cn(selectClass, "w-auto")}
          aria-label={t.admin.subStatus}
        >
          <option value="">{t.admin.filterStatus}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {t.plan.statuses[s] ?? s}
            </option>
          ))}
        </select>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.admin.search}
          aria-label={t.admin.search}
          className="w-full sm:max-w-xs"
        />
      </div>
      {visible.length === 0 ? (
        <p className="p-5 text-muted-foreground">{t.admin.noResults}</p>
      ) : (
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
                <th className="p-3 font-medium">
                  <span className="sr-only">{t.admin.subStatus}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((o) => {
                const suspended = o.subscription_status === "suspended";
                return (
                  <tr key={o.id} className={cn(suspended && "bg-muted/40")}>
                    <td className="p-3">
                      <p className="font-medium">{o.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {o.cnpj ?? "—"} ·{" "}
                        <span className={cn(needsAttention(o) && "font-semibold text-orange-700")}>
                          {t.plan.statuses[o.subscription_status ?? "active"] ??
                            o.subscription_status}
                        </span>
                      </p>
                    </td>
                    <td className="p-3">
                      <select
                        value={o.plan_id ?? ""}
                        onChange={(e) => onPlan(o, e.target.value)}
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
                        onChange={(e) => onBilling(o, e.target.value)}
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
                    <td className="whitespace-nowrap p-3">{fmtDate(o.last_document_at)}</td>
                    <td className="whitespace-nowrap p-3">{fmtDate(o.created_at)}</td>
                    <td className="p-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onSuspend(o)}
                        className={cn(!suspended && "text-destructive hover:text-destructive")}
                      >
                        {suspended ? <PlayCircle aria-hidden /> : <PauseCircle aria-hidden />}
                        {suspended ? t.admin.reactivate : t.admin.suspend}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
    <section className="rounded-2xl border bg-white shadow-sm">
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
              <th className="p-2 font-medium">{t.admin.provider}</th>
              <th className="p-2 font-medium">{t.admin.billingStatus}</th>
              <th className="p-2 font-medium">{t.admin.customer}</th>
              <th className="p-2 font-medium">{t.admin.subscription}</th>
              <th className="p-2 font-medium">{t.billing.nextDue}</th>
              <th className="p-2 font-medium">{t.billing.lastPayment}</th>
              <th className="p-2 font-medium">{t.admin.lastSync}</th>
              <th className="p-2 text-right font-medium">{t.admin.pendingEvents}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.organization_id}>
                <td className="p-2">{r.organization_name}</td>
                <td className="p-2">{r.plan_id}</td>
                <td className="p-2">{r.provider}</td>
                <td className="p-2">
                  {t.plan.statuses[r.status] ?? r.status} /{" "}
                  {t.admin.billingStatuses[r.billing_status] ?? r.billing_status}
                </td>
                <td className="p-2 font-mono text-xs">{r.asaas_customer_id ?? "—"}</td>
                <td className="p-2 font-mono text-xs">{r.asaas_subscription_id ?? "—"}</td>
                <td className="p-2">{date(r.next_due_date)}</td>
                <td className="p-2">{date(r.last_payment_at)}</td>
                <td className="p-2">{date(r.last_sync_at)}</td>
                <td
                  className={cn(
                    "p-2 text-right tabular-nums",
                    r.pending_events > 0 && "font-semibold text-orange-700",
                  )}
                >
                  {r.pending_events}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type EngineError = {
  id: number;
  created_at: string;
  operation: string;
  engine_document_id: string | null;
  kind: string;
  http_status: number | null;
  code: string | null;
  message: string | null;
};

/** Erros do motor de assinatura (sem dados pessoais), para diagnóstico e chamados à Lacuna. */
function EngineErrors({ fmtDate }: { fmtDate: (v: string | null, withTime?: boolean) => string }) {
  const { t } = useAppI18n();
  const [rows, setRows] = useState<EngineError[] | null>(null);
  useEffect(() => {
    void supabase
      .rpc("admin_engine_errors", { lim: 30 })
      .then(({ data }) => setRows((data as EngineError[] | null) ?? []));
  }, []);
  return (
    <section className="mt-6 rounded-2xl border bg-white shadow-sm">
      <div className="border-b p-4">
        <h2 className="font-display text-lg font-semibold">{t.admin.engineErrors}</h2>
        <p className="text-sm text-muted-foreground">{t.admin.engineErrorsHint}</p>
      </div>
      {rows === null ? (
        <p className="p-5 text-muted-foreground">{t.common.loading}</p>
      ) : rows.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">{t.admin.engineErrorsEmpty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">{t.admin.activityWhen}</th>
                <th className="p-3 font-medium">{t.admin.engineOperation}</th>
                <th className="p-3 font-medium">{t.admin.engineStatus}</th>
                <th className="p-3 font-medium">{t.admin.engineMessage}</th>
                <th className="p-3 font-medium">{t.admin.engineDocument}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap p-3">{fmtDate(r.created_at, true)}</td>
                  <td className="p-3 font-mono text-xs">{r.operation}</td>
                  <td className="p-3">
                    {r.kind === "http"
                      ? `HTTP ${r.http_status ?? "?"}`
                      : (t.admin.engineKinds[r.kind] ?? r.kind)}
                    {r.code && (
                      <span className="block text-xs text-muted-foreground">{r.code}</span>
                    )}
                  </td>
                  <td className="max-w-md p-3 text-xs break-words">{r.message ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">{r.engine_document_id ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type PlatformAlert = {
  id: number;
  kind: string;
  detail: { count?: number };
  first_seen: string;
  last_seen: string;
  resolved_at: string | null;
};

/** Alertas da plataforma (abertos e resolvidos na última semana), calculados de hora em hora. */
function PlatformAlerts({
  fmtDate,
}: {
  fmtDate: (v: string | null, withTime?: boolean) => string;
}) {
  const { t, f } = useAppI18n();
  const [rows, setRows] = useState<PlatformAlert[]>([]);
  useEffect(() => {
    void supabase
      .rpc("admin_alerts")
      .then(({ data }) => setRows((data as PlatformAlert[] | null) ?? []));
  }, []);
  const open = rows.filter((r) => !r.resolved_at);
  if (!rows.length) return null;
  return (
    <section
      aria-label={t.admin.alerts.title}
      className={cn(
        "mb-6 grid gap-2 rounded-2xl border p-4",
        open.length ? "border-destructive/40 bg-destructive/5" : "bg-white",
      )}
    >
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <AlertTriangle
          className={cn("size-5", open.length ? "text-destructive" : "text-muted-foreground")}
          aria-hidden
        />
        {open.length ? f(t.admin.alerts.open, { n: String(open.length) }) : t.admin.alerts.noneOpen}
      </h2>
      <ul className="grid gap-1 text-sm">
        {rows.map((r) => (
          <li key={r.id} className={cn(r.resolved_at && "text-muted-foreground")}>
            <b>{t.admin.alerts.kinds[r.kind] ?? r.kind}</b>
            {r.detail.count ? ` (${r.detail.count})` : ""} ·{" "}
            {r.resolved_at
              ? f(t.admin.alerts.resolved, { date: fmtDate(r.resolved_at, true) })
              : f(t.admin.alerts.since, { date: fmtDate(r.first_seen, true) })}
          </li>
        ))}
      </ul>
    </section>
  );
}
