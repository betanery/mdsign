import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { ApiError, callFunction } from "../api";
import { useAppConfig } from "../app-config";
import { errorText, fieldProblems } from "../errors";
import { useAppI18n } from "../i18n";
import { formatCep, formatPhone, lookupCep, onlyDigits } from "../validation";
import { useOrg } from "../org";
import { useConfirm } from "./confirm-dialog";
import { PlanUsage, type OrgUsage } from "./plan-usage";

type Billing = {
  plan_id: string;
  plan_name: string;
  price_cents: number | null;
  status: string;
  billing_status: string;
  provider: string;
  value_cents: number | null;
  next_due_date: string | null;
  last_payment_at: string | null;
  past_due_since: string | null;
  cancel_at: string | null;
  grace_days: number;
  pending_plan_id: string | null;
  pending_link: string | null;
};
type Plan = { id: string; name: string; price_cents: number | null; sort: number };
type Ent = { plan_id: string; key: string; value_int: number | null; value_bool: boolean | null };
type Payment = {
  asaas_payment_id: string;
  billing_type: string | null;
  value_cents: number | null;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  invoice_url: string | null;
};

const money = (cents: number | null | undefined, locale: string) =>
  cents == null
    ? "—"
    : new Intl.NumberFormat(locale === "en" ? "en-US" : locale === "es" ? "es" : "pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(cents / 100);

/** Data sem hora (vencimentos vêm como AAAA-MM-DD; não converte fuso). */
const formatDate = (value: string, locale: string) => {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale, { dateStyle: "short" }).format(
    new Date(y!, (m ?? 1) - 1, d ?? 1),
  );
};

/** Estado financeiro normalizado para a tela (free, pending, active, past_due, suspended, canceled). */
function state(b: Billing): string {
  if (b.cancel_at) return "canceled";
  if (b.status === "suspended") return "suspended";
  if (b.status === "past_due") return "past_due";
  if (b.billing_status === "exempt") return "exempt";
  if (b.pending_plan_id && b.provider !== "asaas") return "pending";
  if (b.plan_id === "cedro" || b.billing_status === "free") return "free";
  return "active";
}

/** Plano e cobrança: plano atual, situação financeira, uso, histórico e ações. */
export function BillingPanel({
  usage,
  checkoutState,
}: {
  usage: OrgUsage | null;
  checkoutState?: string | undefined;
}) {
  const { t, f, locale } = useAppI18n();
  const { current, can } = useOrg();
  const config = useAppConfig();
  const [confirm, confirmDialog] = useConfirm();
  const [billing, setBilling] = useState<Billing | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [ents, setEnts] = useState<Ent[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  // Cartão sem telefone/endereço no cadastro do Asaas: pede os dados e refaz o pedido.
  const [needData, setNeedData] = useState<string | null>(null);
  const manage = can("billing.manage");

  const load = useCallback(async () => {
    if (!current) return;
    const [b, p, e, pay] = await Promise.all([
      supabase.rpc("org_billing", { org: current.id }),
      supabase
        .from("plans")
        .select("id, name, price_cents, sort")
        .eq("is_public", true)
        .order("sort"),
      supabase.from("plan_entitlements").select("plan_id, key, value_int, value_bool"),
      supabase
        .from("billing_payments")
        .select(
          "asaas_payment_id, billing_type, value_cents, status, due_date, paid_at, invoice_url",
        )
        .eq("organization_id", current.id)
        .order("due_date", { ascending: false })
        .limit(24),
    ]);
    setBilling(((b.data as Billing[] | null) ?? [])[0] ?? null);
    setPlans((p.data as Plan[] | null) ?? []);
    setEnts((e.data as Ent[] | null) ?? []);
    setPayments((pay.data as Payment[] | null) ?? []);
  }, [current]);

  useEffect(() => {
    void load();
  }, [load]);

  // Voltou do Checkout: o plano só muda quando o Asaas confirmar (webhook). Acompanha por 2 min.
  useEffect(() => {
    if (checkoutState !== "success") return;
    let n = 0;
    const id = window.setInterval(() => {
      n++;
      void load();
      if (n >= 24) window.clearInterval(id);
    }, 5000);
    return () => window.clearInterval(id);
  }, [checkoutState, load]);

  if (!billing) return <p className="text-muted-foreground">{t.common.loading}</p>;
  const st = state(billing);
  const ent = (plan: string, key: string) => ents.find((x) => x.plan_id === plan && x.key === key);
  const overdue = payments.find((p) => p.status === "OVERDUE" && p.invoice_url);

  async function subscribe(planId: string, method: "CREDIT_CARD" | "PIX") {
    if (!current) return;
    // Rebaixar acima dos limites: avisa a pendência (nada é apagado).
    const users = ent(planId, "users_max")?.value_int;
    const month = ent(planId, "documents_month")?.value_int;
    const warn: string[] = [];
    if (usage && users != null && usage.users_used > users)
      warn.push(f(t.billing.overUsers, { used: String(usage.users_used), max: String(users) }));
    if (usage && month != null && usage.documents_month_used > month)
      warn.push(
        f(t.billing.overDocs, { used: String(usage.documents_month_used), max: String(month) }),
      );
    const plan = plans.find((p) => p.id === planId)!;
    const ok = await confirm({
      title: f(t.billing.confirmTitle, { plan: plan.name }),
      text: [
        f(method === "PIX" ? t.billing.confirmPix : t.billing.confirmCard, {
          plan: plan.name,
          value: money(plan.price_cents, locale),
        }),
        ...warn,
      ].join(" "),
      action: t.billing.goCheckout,
    });
    if (!ok) return;
    setBusy(planId);
    try {
      const r = await callFunction<{ link: string }>("billing", {
        action: "checkout",
        organizationId: current.id,
        planId,
        method,
      });
      window.location.assign(r.link);
    } catch (e) {
      setBusy(null);
      if (e instanceof ApiError && e.code === "billing_customer_data_required")
        return setNeedData(planId);
      toast.error(errorText(t, e));
    }
  }

  async function cancel() {
    if (!current) return;
    const ok = await confirm({
      title: t.billing.cancelTitle,
      text: f(t.billing.cancelText, {
        date: billing!.next_due_date ? formatDate(billing!.next_due_date, locale) : "—",
      }),
      action: t.billing.cancelConfirm,
    });
    if (!ok) return;
    setBusy("cancel");
    try {
      await callFunction("billing", { action: "cancel", organizationId: current.id });
      toast.success(t.billing.canceled);
      await load();
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setBusy(null);
    }
  }

  const tone =
    st === "past_due" || st === "pending"
      ? "border-orange-200 bg-orange-50 text-orange-900"
      : st === "suspended"
        ? "border-destructive/30 bg-destructive/5 text-destructive"
        : "border-success/30 bg-success/10 text-success";

  return (
    <div className="grid gap-5" data-tour="plan-panel">
      {confirmDialog}
      {needData && current && (
        <CustomerDataDialog
          organizationId={current.id}
          onClose={() => setNeedData(null)}
          onSaved={() => {
            const plan = needData;
            setNeedData(null);
            void subscribe(plan, "CREDIT_CARD");
          }}
        />
      )}
      {config.billingEnvironment === "sandbox" && (
        <p className="flex items-start gap-2 rounded-xl border border-brand/30 bg-brand-soft px-4 py-3 text-sm text-brand-strong">
          <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t.billing.sandbox}
        </p>
      )}
      {checkoutState === "success" && billing.provider !== "asaas" && (
        <p
          className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm"
          role="status"
        >
          <Loader2 className="size-4 animate-spin text-brand" aria-hidden />
          {t.billing.processing}
        </p>
      )}
      {(checkoutState === "canceled" || checkoutState === "expired") && (
        <p className="rounded-xl border bg-white px-4 py-3 text-sm text-muted-foreground">
          {t.billing.checkoutLeft}
        </p>
      )}

      <section className="grid gap-4 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{t.billing.currentPlan}</p>
            <p className="font-display text-xl font-semibold">{billing.plan_name}</p>
            <p className="text-sm">
              {billing.plan_id === "cedro"
                ? t.billing.free
                : f(t.billing.perMonth, {
                    value: money(billing.value_cents ?? billing.price_cents, locale),
                  })}
            </p>
          </div>
          <span className={cn("rounded-full border px-3 py-1 text-sm font-semibold", tone)}>
            {t.billing.states[st] ?? st}
          </span>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            {/* Cancelamento agendado: não há próxima cobrança, só a data em que o plano acaba. */}
            <dt className="text-muted-foreground">
              {billing.cancel_at ? t.billing.validUntil : t.billing.nextDue}
            </dt>
            <dd>
              {billing.cancel_at
                ? formatDate(billing.cancel_at, locale)
                : billing.next_due_date
                  ? formatDate(billing.next_due_date, locale)
                  : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t.billing.lastPayment}</dt>
            <dd>{billing.last_payment_at ? formatDate(billing.last_payment_at, locale) : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t.billing.situation}</dt>
            <dd>{t.billing.situations[st] ?? "—"}</dd>
          </div>
        </dl>
        {st === "past_due" && (
          <p className="flex items-start gap-2 text-sm text-orange-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {f(t.billing.pastDueHint, { days: String(billing.grace_days) })}
          </p>
        )}
        {st === "suspended" && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t.billing.suspendedHint}
          </p>
        )}
        {st === "canceled" && billing.cancel_at && (
          <p className="text-sm text-muted-foreground">
            {f(t.billing.canceledHint, { date: formatDate(billing.cancel_at, locale) })}
          </p>
        )}
        {usage && <PlanUsage usage={usage} hideUpgrade />}
        {manage && (
          <div className="flex flex-wrap gap-2">
            {overdue && (
              <Button asChild className="bg-brand hover:bg-brand-strong">
                <a href={overdue.invoice_url!} target="_blank" rel="noreferrer">
                  {t.billing.regularize}
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            )}
            {billing.pending_link && st !== "active" && (
              <Button asChild variant="outline">
                <a href={billing.pending_link}>{t.billing.resumeCheckout}</a>
              </Button>
            )}
            {billing.billing_status !== "exempt" && (
              <Button
                variant={billing.plan_id === "cedro" ? "default" : "outline"}
                className={billing.plan_id === "cedro" ? "bg-brand hover:bg-brand-strong" : ""}
                onClick={() => setChoosing(!choosing)}
                disabled={!config.billingEnvironment}
              >
                {billing.plan_id === "cedro" ? t.billing.upgrade : t.billing.changePlan}
              </Button>
            )}
            {billing.provider === "asaas" && !billing.cancel_at && (
              <Button variant="ghost" onClick={() => void cancel()} disabled={busy !== null}>
                {busy === "cancel" && <Loader2 className="animate-spin" aria-hidden />}
                {t.billing.cancel}
              </Button>
            )}
          </div>
        )}
        {billing.billing_status === "exempt" && (
          <p className="text-sm text-muted-foreground">{t.billing.exemptHint}</p>
        )}
        {!config.billingEnvironment && manage && billing.billing_status !== "exempt" && (
          <p className="text-sm text-muted-foreground">{t.errors["billing_not_configured"]}</p>
        )}
      </section>

      {choosing && (
        <section className="grid gap-3" aria-labelledby="choose-plan">
          <h3 id="choose-plan" className="font-display text-lg font-semibold">
            {t.billing.choose}
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {plans
              .filter((p) => p.id !== "cedro")
              .map((p) => {
                const isCurrent = p.id === billing.plan_id && billing.provider === "asaas";
                const docsMonth = ent(p.id, "documents_month")?.value_int;
                const users = ent(p.id, "users_max")?.value_int;
                return (
                  <li
                    key={p.id}
                    className={cn(
                      "flex flex-col gap-2 rounded-2xl border bg-white p-4 shadow-sm",
                      isCurrent && "border-brand ring-2 ring-brand/20",
                    )}
                  >
                    <p className="font-display font-semibold">{p.name}</p>
                    <p className="text-sm">
                      {p.price_cents
                        ? f(t.billing.perMonth, { value: money(p.price_cents, locale) })
                        : t.billing.onRequest}
                    </p>
                    <ul className="text-xs text-muted-foreground">
                      <li>
                        {docsMonth != null
                          ? f(t.billing.docsMonth, { n: String(docsMonth) })
                          : t.billing.docsUnlimited}
                      </li>
                      {users != null && (
                        <li>
                          {users === 1
                            ? t.billing.usersOne
                            : f(t.billing.usersUpTo, { n: String(users) })}
                        </li>
                      )}
                      {ent(p.id, "integrations_access")?.value_bool && (
                        <li>{t.billing.withIntegrations}</li>
                      )}
                    </ul>
                    {p.id === "mogno" ? (
                      <Button asChild variant="outline" size="sm" className="mt-auto">
                        <a href="/pt#planos" target="_blank" rel="noreferrer">
                          {t.billing.talkSales}
                        </a>
                      </Button>
                    ) : isCurrent ? (
                      <span className="mt-auto flex items-center gap-1 text-sm font-semibold text-brand">
                        <CheckCircle2 className="size-4" aria-hidden />
                        {t.billing.yourPlan}
                      </span>
                    ) : (
                      <div className="mt-auto flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="bg-brand hover:bg-brand-strong"
                          onClick={() => void subscribe(p.id, "CREDIT_CARD")}
                          disabled={busy !== null}
                        >
                          {busy === p.id && <Loader2 className="animate-spin" aria-hidden />}
                          {t.billing.subscribeCard}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void subscribe(p.id, "PIX")}
                          disabled={busy !== null}
                        >
                          {t.billing.subscribePix}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
          <p className="text-xs text-muted-foreground">{t.billing.changeHint}</p>
        </section>
      )}

      {payments.length > 0 && (
        <section className="grid gap-2" aria-labelledby="billing-history">
          <h3 id="billing-history" className="font-display text-lg font-semibold">
            {t.billing.history}
          </h3>
          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="p-2 font-medium">{t.billing.dueDate}</th>
                  <th className="p-2 font-medium">{t.billing.value}</th>
                  <th className="p-2 font-medium">{t.billing.method}</th>
                  <th className="p-2 font-medium">{t.billing.paymentStatus}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.map((p) => (
                  <tr key={p.asaas_payment_id}>
                    <td className="p-2">{p.due_date ? formatDate(p.due_date, locale) : "—"}</td>
                    <td className="p-2">{money(p.value_cents, locale)}</td>
                    <td className="p-2">{t.billing.methods[p.billing_type ?? ""] ?? "—"}</td>
                    <td className="p-2">{t.billing.paymentStatuses[p.status] ?? p.status}</td>
                    <td className="p-2 text-right">
                      {p.invoice_url && (
                        <a
                          href={p.invoice_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand hover:underline"
                        >
                          {t.billing.invoice}
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/** Dados de cobrança do cartão: vão direto para o cadastro do cliente no Asaas. */
function CustomerDataDialog({
  organizationId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useAppI18n();
  const [data, setData] = useState({
    phone: "",
    postalCode: "",
    address: "",
    addressNumber: "",
    complement: "",
    province: "",
    city: "",
  });
  const [bad, setBad] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [cepState, setCepState] = useState<"idle" | "loading" | "notFound">("idle");

  // CEP completo: busca o endereço e preenche rua, bairro e cidade (a pessoa pode corrigir).
  async function onCep(value: string) {
    const cep = formatCep(value);
    setData((d) => ({ ...d, postalCode: cep }));
    if (onlyDigits(cep).length !== 8) return setCepState("idle");
    setCepState("loading");
    const found = await lookupCep(cep);
    if (!found) return setCepState("notFound");
    setCepState("idle");
    setData((d) => ({
      ...d,
      address: found.address || d.address,
      province: found.province || d.province,
      city: found.city || d.city,
    }));
  }
  const fields = [
    ["phone", "tel"],
    ["postalCode", "text"],
    ["address", "text"],
    ["addressNumber", "text"],
    ["complement", "text"],
    ["province", "text"],
    ["city", "text"],
  ] as const;

  async function save() {
    setBusy(true);
    setBad([]);
    try {
      await callFunction("billing", { action: "customer-data", organizationId, data });
      onSaved();
    } catch (e) {
      setBad(fieldProblems(e));
      if (!fieldProblems(e).length) toast.error(errorText(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.billing.customerTitle}</DialogTitle>
          <DialogDescription>{t.billing.customerHint}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map(([k, type]) => (
            <div key={k} className={cn("grid gap-1.5", k === "address" && "sm:col-span-2")}>
              <Label htmlFor={`bc-${k}`}>{t.billing.customerFields[k]}</Label>
              <Input
                id={`bc-${k}`}
                type={type}
                inputMode={k === "postalCode" || k === "phone" ? "numeric" : undefined}
                value={data[k]}
                aria-invalid={bad.includes(k)}
                onChange={(e) =>
                  k === "postalCode"
                    ? void onCep(e.target.value)
                    : setData({
                        ...data,
                        [k]: k === "phone" ? formatPhone(e.target.value) : e.target.value,
                      })
                }
              />
              {k === "postalCode" && cepState !== "idle" && (
                <p className="text-xs text-muted-foreground" role="status">
                  {cepState === "loading" ? t.billing.cepLoading : t.billing.cepNotFound}
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            className="bg-brand hover:bg-brand-strong"
            onClick={() => void save()}
            disabled={busy}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {t.billing.customerSave}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
