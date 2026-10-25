import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, ExternalLink, FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { callFunction } from "../api";
import { useAppConfig } from "../app-config";
import { errorText } from "../errors";
import { useAppI18n } from "../i18n";
import { useOrg } from "../org";
import { useConfirm } from "./confirm-dialog";
import { money } from "./plan-chooser";
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
type Payment = {
  asaas_payment_id: string;
  billing_type: string | null;
  value_cents: number | null;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  invoice_url: string | null;
};

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
  const [payments, setPayments] = useState<Payment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const manage = can("billing.manage");

  const load = useCallback(async () => {
    if (!current) return;
    const [b, pay] = await Promise.all([
      supabase.rpc("org_billing", { org: current.id }),
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
  const overdue = payments.find((p) => p.status === "OVERDUE" && p.invoice_url);

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
                asChild
                variant={billing.plan_id === "cedro" ? "default" : "outline"}
                className={billing.plan_id === "cedro" ? "bg-brand hover:bg-brand-strong" : ""}
              >
                {/* A escolha e a contratação ficam em Meu plano (#mudar-plano). */}
                <Link to="/app/plan" hash="mudar-plano">
                  {billing.plan_id === "cedro" ? t.billing.upgrade : t.billing.changePlan}
                  <ArrowRight aria-hidden />
                </Link>
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
        {config.loaded &&
          !config.billingEnvironment &&
          manage &&
          billing.billing_status !== "exempt" && (
            <p className="text-sm text-muted-foreground">{t.errors["billing_not_configured"]}</p>
          )}
      </section>

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
                          className="inline-flex min-h-6 items-center px-1 text-brand hover:underline"
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
