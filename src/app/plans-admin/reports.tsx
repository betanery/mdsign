// Visão geral, consumo e custos, configurações (custo por documento e contratos Mogno) e
// auditoria comercial. Números só do servidor; receita só confirmada; saldo não é lucro.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAppI18n } from "../i18n";
import { featureTexts, useMoney, type FeatureCode } from "../features";
import { selectClass } from "../ui";
import { fmtDay, Kpi, Panel } from "../growth/ui";
import { centsToInput, parseMoney, rpcErrorCode, type Catalog } from "./api";
import { Loading } from "./shared";
import { usePlansAdminTexts } from "./texts";

/** Planos tirados do catálogo no lançamento (continuam no banco pelo histórico). */
const RETIRED = new Set(["angico", "aroeira"]);

/** Chamada de leitura com descarte de respostas antigas. */
function useRpc<T>(fn: string, args: Record<string, unknown> | undefined, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const seq = useRef(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const mine = ++seq.current;
    setError(false);
    void supabase.rpc(fn, args).then(({ data: d, error: e }) => {
      if (mine !== seq.current) return;
      if (e) return setError(true);
      setData(d as T);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, refresh: () => setTick((n) => n + 1) };
}

type Overview = {
  month: string;
  by_plan: { plan_id: string; name: string; orgs: number; users: number; docs_month: number }[];
  free_orgs: number;
  paid_orgs: number;
  exempt_orgs: number;
  mrr_cents: number | null;
  mrr_environment: string | null;
  docs_month: number;
  cost_month_cents: number;
  exceptional: number;
  conversions: number;
  free_people: number;
  free_exhausted: number;
};

const isSandbox = (env: string | null | undefined) => !env || env.includes("sandbox");

export function PlansOverview() {
  const P = usePlansAdminTexts();
  const O = P.overview;
  const money = useMoney();
  const { data, error } = useRpc<Overview>("admin_plans_overview", undefined, []);
  if (error) return <p className="text-sm text-destructive">{P.error}</p>;
  if (!data) return <Loading />;
  const orgs = data.by_plan.reduce((a, p) => a + p.orgs, 0);
  const users = data.by_plan.reduce((a, p) => a + p.users, 0);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        <Kpi label={O.orgs} value={orgs} help={O.byPlan} />
        <Kpi label={O.users} value={users} help={O.byPlan} />
        <Kpi label={O.free} value={data.free_orgs} help="Cedro" />
        <Kpi label={O.paid} value={data.paid_orgs} help={O.help["conversions"]!} />
        <Kpi label={O.exempt} value={data.exempt_orgs} help={O.exempt} />
        <Kpi
          label={O.mrr}
          value={data.mrr_cents === null ? null : money(data.mrr_cents)}
          help={O.help["mrr"]!}
          note={data.mrr_cents && isSandbox(data.mrr_environment) ? P.sandbox : undefined}
        />
        <Kpi label={O.docs} value={data.docs_month} help={data.month} />
        <Kpi label={O.cost} value={money(data.cost_month_cents)} help={O.help["cost"]!} />
        <Kpi label={O.exceptional} value={data.exceptional} help={O.help["exceptional"]!} />
        <Kpi label={O.conversions} value={data.conversions} help={O.help["conversions"]!} />
        <Kpi label={O.freePeople} value={data.free_people} help="Cedro" />
        <Kpi label={O.freeExhausted} value={data.free_exhausted} help="Cedro" />
      </div>
      <Panel title={O.byPlan}>
        <div className="relative overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="p-2 font-semibold">{O.plan}</th>
                <th className="p-2 font-semibold">{O.orgs}</th>
                <th className="p-2 font-semibold">{O.users}</th>
                <th className="p-2 font-semibold">{O.docs}</th>
              </tr>
            </thead>
            <tbody>
              {/* Planos fora do catálogo só aparecem se ainda tiverem organizações. */}
              {data.by_plan
                .filter((p) => p.orgs > 0 || !RETIRED.has(p.plan_id))
                .map((p) => (
                  <tr key={p.plan_id} className="border-b last:border-0">
                    <th scope="row" className="p-2 text-left font-medium">
                      {p.name}
                    </th>
                    <td className="p-2 tabular-nums">{p.orgs}</td>
                    <td className="p-2 tabular-nums">{p.users}</td>
                    <td className="p-2 tabular-nums">{p.docs_month}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

type Money = { cost_cents: number; revenue_cents: number; balance_cents: number };
type Consumption = {
  month: string;
  cost_cents_per_document: number;
  rows: ({
    id: string;
    name: string;
    plan_id: string;
    docs: number;
    docs_total: number;
    exceptional: boolean;
  } & Money)[];
  by_plan: ({ plan_id: string; orgs: number; docs: number; avg_docs: number | null } & Money)[];
  totals: { docs: number; avg_docs: number | null } & Money;
  revenue_environment: string | null;
};

export function PlansConsumption() {
  const P = usePlansAdminTexts();
  const C = P.consumption;
  const money = useMoney();
  const [month, setMonth] = useState(() =>
    new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7),
  );
  const { data, error } = useRpc<Consumption>("admin_consumption", { month }, [month]);
  const sandbox = data && data.totals.revenue_cents > 0 && isSandbox(data.revenue_environment);

  return (
    <div className="grid gap-4">
      <label className="flex items-center gap-2 text-sm">
        <span className="font-medium">{C.month}</span>
        <Input
          type="month"
          className="w-44"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
        />
      </label>
      {error && <p className="text-sm text-destructive">{P.error}</p>}
      {!error && !data && <Loading />}
      {data && (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            <Kpi label={C.docs} value={data.totals.docs} help={data.month} />
            <Kpi label={C.avg} value={data.totals.avg_docs} help={C.org} />
            <Kpi label={C.cost} value={money(data.totals.cost_cents)} help={P.settings.costHint} />
            <Kpi
              label={C.revenue}
              value={money(data.totals.revenue_cents)}
              help={P.overview.help["mrr"]!}
              note={sandbox ? P.sandbox : undefined}
            />
            <Kpi label={C.balance} value={money(data.totals.balance_cents)} help={C.balanceHint} />
          </div>
          <MoneyTable
            title={C.byPlan}
            head={[C.plan, P.overview.orgs, C.docs, C.avg, C.cost, C.revenue, C.balance]}
            rows={data.by_plan
              .filter((r) => r.orgs > 0 || !RETIRED.has(r.plan_id))
              .map((r) => [
                r.plan_id,
                r.orgs,
                r.docs,
                r.avg_docs ?? "—",
                money(r.cost_cents),
                money(r.revenue_cents),
                money(r.balance_cents),
              ])}
          />
          <MoneyTable
            title={C.org}
            hint={C.balanceHint}
            head={[C.org, C.plan, C.docs, C.total, C.cost, C.revenue, C.balance]}
            rows={data.rows.slice(0, 200).map((r) => [
              <span key="n" className={cn(r.exceptional && "font-semibold text-orange-700")}>
                {r.name}
                {r.exceptional && ` · ${C.exceptional}`}
              </span>,
              r.plan_id,
              r.docs,
              r.docs_total,
              money(r.cost_cents),
              money(r.revenue_cents),
              money(r.balance_cents),
            ])}
          />
        </>
      )}
    </div>
  );
}

function MoneyTable({
  title,
  hint,
  head,
  rows,
}: {
  title: string;
  hint?: string;
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <Panel title={title} {...(hint ? { hint } : {})}>
      <div className="relative overflow-x-auto" tabIndex={0}>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              {head.map((h) => (
                <th key={h} className="p-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                {r.map((c, j) => (
                  <td key={j} className={cn("p-2", j > 1 && "tabular-nums")}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

type MognoContract = {
  id: string;
  name: string;
  features: Record<string, string>;
  limits: Record<string, number | null>;
};

export function PlansSettings({
  catalog,
  reload,
}: {
  catalog: Catalog;
  reload: () => Promise<void>;
}) {
  const P = usePlansAdminTexts();
  const S = P.settings;
  const [cost, setCost] = useState(centsToInput(catalog.cost.cents_per_document ?? 3));
  const [excep, setExcep] = useState(String(catalog.cost.exceptional_month_docs ?? 500));
  const [busy, setBusy] = useState(false);
  const mogno = useRpc<MognoContract[]>("admin_mogno_contracts", undefined, []);

  const saveCost = async () => {
    const cents = parseMoney(cost);
    const n = Number(excep);
    if (cents === null || !Number.isInteger(n) || n < 1) return void toast.error(P.error);
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_policy", {
      policy: "document_cost",
      is_active: true,
      new_config: { cents_per_document: cents, exceptional_month_docs: n },
    });
    setBusy(false);
    if (error) return void toast.error(P.error);
    toast.success(P.saved);
    await reload();
  };

  return (
    <div className="grid gap-4">
      <Panel title={S.cost} hint={S.costHint}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label htmlFor="doc-cost">{S.cost}</Label>
            <Input
              id="doc-cost"
              className="w-36"
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="doc-excep">{S.exceptional}</Label>
            <Input
              id="doc-excep"
              className="w-36"
              inputMode="numeric"
              value={excep}
              onChange={(e) => setExcep(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <Button
            className="bg-brand hover:bg-brand-strong"
            disabled={busy}
            onClick={() => void saveCost()}
          >
            {S.save}
          </Button>
        </div>
      </Panel>
      <WhatsAppTest />
      <Panel title={S.mogno} hint={S.mognoHint}>
        {mogno.error && <p className="text-sm text-destructive">{P.error}</p>}
        {!mogno.error && !mogno.data && <Loading />}
        {mogno.data?.length === 0 && <p className="text-sm text-muted-foreground">{S.noMogno}</p>}
        {mogno.data?.map((c) => (
          <MognoEditor key={c.id} catalog={catalog} contract={c} onSaved={mogno.refresh} />
        ))}
      </Panel>
    </div>
  );
}

function MognoEditor({
  catalog,
  contract,
  onSaved,
}: {
  catalog: Catalog;
  contract: MognoContract;
  onSaved: () => void;
}) {
  const P = usePlansAdminTexts();
  const S = P.settings;
  const { locale } = useAppI18n();
  const X = featureTexts[locale as keyof typeof featureTexts] ?? featureTexts.pt;
  const [features, setFeatures] = useState<Record<string, string>>(contract.features);
  const [docs, setDocs] = useState(String(contract.limits["documents_month"] ?? ""));
  const [users, setUsers] = useState(String(contract.limits["users_max"] ?? ""));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const limits: Record<string, number> = {};
    if (docs) limits["documents_month"] = Number(docs);
    if (users) limits["users_max"] = Number(users);
    setBusy(true);
    const { error } = await supabase.rpc("admin_mogno_contract_save", {
      org: contract.id,
      features,
      limits,
    });
    setBusy(false);
    if (error) {
      const code = rpcErrorCode(error);
      return void toast.error((code && P.matrix.errors[code]) || P.error);
    }
    toast.success(P.saved);
    onSaved();
  };

  return (
    <section className="grid gap-3 rounded-xl border p-3">
      <h4 className="font-semibold">{contract.name}</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor={`md-${contract.id}`}>{S.docsMonth}</Label>
          <Input
            id={`md-${contract.id}`}
            inputMode="numeric"
            value={docs}
            onChange={(e) => setDocs(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`mu-${contract.id}`}>{S.usersMax}</Label>
          <Input
            id={`mu-${contract.id}`}
            inputMode="numeric"
            value={users}
            onChange={(e) => setUsers(e.target.value.replace(/\D/g, ""))}
          />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {catalog.features
          .filter((f) => !f.core)
          .map((f) => (
            <label key={f.code} className="flex items-center justify-between gap-2 text-sm">
              <span>{X.features[f.code as FeatureCode]?.name ?? f.name}</span>
              <select
                className={selectClass}
                value={features[f.code] ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setFeatures((cur) => {
                    const next = { ...cur };
                    if (v) next[f.code] = v;
                    else delete next[f.code];
                    return next;
                  });
                }}
              >
                <option value="">{S.default}</option>
                {(["available", "preview", "hidden"] as const).map((m) => (
                  <option key={m} value={m}>
                    {P.features.modes[m]}
                  </option>
                ))}
              </select>
            </label>
          ))}
      </div>
      <div>
        <Button
          className="bg-brand hover:bg-brand-strong"
          disabled={busy}
          onClick={() => void save()}
        >
          {S.save}
        </Button>
      </div>
    </section>
  );
}

type AuditRow = {
  at: string;
  action: string;
  entity: string;
  entity_id: string;
  data: Record<string, unknown> | null;
  actor: string;
};

export function PlansAudit() {
  const P = usePlansAdminTexts();
  const A = P.audit;
  const { locale } = useAppI18n();
  const { data, error } = useRpc<AuditRow[]>("admin_commercial_audit", undefined, []);
  if (error) return <p className="text-sm text-destructive">{P.error}</p>;
  if (!data) return <Loading />;
  if (data.length === 0) return <p className="text-sm text-muted-foreground">{A.empty}</p>;
  return (
    <Panel title={P.sections.audit}>
      <div className="relative overflow-x-auto" tabIndex={0}>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="p-2 font-semibold">{A.when}</th>
              <th className="p-2 font-semibold">{A.who}</th>
              <th className="p-2 font-semibold">{A.what}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i} className="border-b align-top last:border-0">
                <td className="whitespace-nowrap p-2">{fmtDay(r.at, locale, true)}</td>
                <td className="p-2">{r.actor}</td>
                <td className="p-2">
                  <span className="font-medium">{r.action}</span> · {r.entity_id}
                  {r.data && (
                    <code className="mt-1 block max-w-xl break-all text-xs text-muted-foreground">
                      {JSON.stringify(r.data).slice(0, 300)}
                    </code>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function WhatsAppTest() {
  const P = usePlansAdminTexts();
  const S = P.settings;
  const [phone, setPhone] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    const { error } = await supabase.functions.invoke("admin-whatsapp-test", {
      body: { phone, confirmed: true },
    });
    setBusy(false);
    if (error) {
      const code = await (error as { context?: Response }).context
        ?.json()
        .then((b: { error?: string }) => b.error)
        .catch(() => null);
      return void toast.error(
        code === "whatsapp_not_configured"
          ? S.whatsappOff
          : code === "invalid_phone"
            ? S.whatsappInvalid
            : S.whatsappFailed,
      );
    }
    setConfirmed(false);
    toast.success(S.whatsappSent);
  };

  return (
    <Panel title={S.whatsapp} hint={S.whatsappHint}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label htmlFor="wa-test-phone">{S.whatsappPhone}</Label>
          <Input
            id="wa-test-phone"
            className="w-48"
            inputMode="tel"
            autoComplete="off"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setConfirmed(false);
            }}
          />
        </div>
        <label className="flex min-h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          {S.whatsappConfirm}
        </label>
        <Button
          className="bg-brand hover:bg-brand-strong"
          disabled={busy || !confirmed || phone.replace(/\D/g, "").length < 10}
          onClick={() => void send()}
        >
          {S.whatsappSend}
        </Button>
      </div>
    </Panel>
  );
}
