// Mudar de plano: os planos sempre à vista, o atual marcado e a contratação (cartão ou Pix)
// pelo Asaas. Fica em "Meu plano"; Plano e cobrança só leva para cá.

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FlaskConical, Loader2 } from "lucide-react";
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
import type { OrgUsage } from "./plan-usage";

type Billing = {
  plan_id: string;
  provider: string;
  billing_status: string;
  pending_link: string | null;
  cancel_at: string | null;
};
type OfferPlan = {
  id: string;
  name: string;
  price_cents: number | null;
  sort: number;
  is_public: boolean;
  highlight: boolean;
  entitlements: Record<string, number | boolean>;
};

export const money = (cents: number | null | undefined, locale: string) =>
  cents == null
    ? "—"
    : new Intl.NumberFormat(locale === "en" ? "en-US" : locale === "es" ? "es" : "pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(cents / 100);

/** Plano escolhido em relação ao atual, pela ordem da matriz (mais recursos ou plano menor). */
export function planDirection(
  plans: { id: string; sort: number }[],
  current: string,
  target: string,
): "current" | "up" | "down" {
  if (current === target) return "current";
  const a = plans.find((p) => p.id === current)?.sort ?? 0;
  const b = plans.find((p) => p.id === target)?.sort ?? 0;
  return b >= a ? "up" : "down";
}

/** Seção "Mudar de plano" (âncora #mudar-plano). `highlight` destaca o plano vindo de um atalho. */
export function PlanChooser({
  usage,
  highlight,
}: {
  usage: OrgUsage | null;
  highlight?: string | undefined;
}) {
  const { t, f, locale } = useAppI18n();
  const { current, can } = useOrg();
  const config = useAppConfig();
  const [confirm, confirmDialog] = useConfirm();
  const [billing, setBilling] = useState<Billing | null>(null);
  const [plans, setPlans] = useState<OfferPlan[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // Cartão sem telefone/endereço no cadastro do Asaas: pede os dados e refaz o pedido.
  const [needData, setNeedData] = useState<string | null>(null);
  const manage = can("billing.manage");

  const load = useCallback(async () => {
    if (!current) return;
    const [b, offer] = await Promise.all([
      supabase.rpc("org_billing", { org: current.id }),
      // Planos oferecidos para contratar: a matriz publicada (versão vigente).
      supabase.rpc("plan_offer"),
    ]);
    setBilling(((b.data as Billing[] | null) ?? [])[0] ?? null);
    setPlans(
      ((offer.data as { plans: OfferPlan[] } | null)?.plans ?? [])
        .filter((x) => x.is_public)
        .sort((x, y) => x.sort - y.sort),
    );
  }, [current]);

  useEffect(() => {
    void load();
  }, [load]);

  // Veio de um atalho ("Contratar Jacarandá", "Fazer upgrade"): leva a pessoa até os planos.
  useEffect(() => {
    if (!billing || (!highlight && window.location.hash !== "#mudar-plano")) return;
    const target =
      (highlight && document.getElementById(`plano-${highlight}`)) ||
      document.getElementById("mudar-plano");
    target?.scrollIntoView({ behavior: "smooth", block: highlight ? "center" : "start" });
  }, [billing, highlight]);

  if (!billing || !plans.length) return null;
  const num = (p: OfferPlan, key: string) =>
    typeof p.entitlements[key] === "number" ? (p.entitlements[key] as number) : null;
  const exempt = billing.billing_status === "exempt";
  const canBuy = manage && !exempt && Boolean(config.billingEnvironment);

  async function subscribe(planId: string, method: "CREDIT_CARD" | "PIX") {
    if (!current) return;
    const plan = plans.find((p) => p.id === planId)!;
    // Rebaixar acima dos limites: avisa a pendência (nada é apagado).
    const users = num(plan, "users_max");
    const month = num(plan, "documents_month");
    const warn: string[] = [];
    if (usage && users != null && usage.users_used > users)
      warn.push(f(t.billing.overUsers, { used: String(usage.users_used), max: String(users) }));
    if (usage && month != null && usage.documents_month_used > month)
      warn.push(
        f(t.billing.overDocs, { used: String(usage.documents_month_used), max: String(month) }),
      );
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

  return (
    <section id="mudar-plano" className="grid scroll-mt-6 gap-3" aria-labelledby="choose-plan">
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
      <h2 id="choose-plan" className="font-display text-lg font-semibold">
        {t.billing.changePlanTitle}
      </h2>
      {config.billingEnvironment === "sandbox" && canBuy && (
        <p className="flex items-start gap-2 rounded-xl border border-brand/30 bg-brand-soft px-4 py-3 text-sm text-brand-strong">
          <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t.billing.sandbox}
        </p>
      )}
      {exempt && <p className="text-sm text-muted-foreground">{t.billing.exemptHint}</p>}
      {!exempt && !manage && (
        <p className="text-sm text-muted-foreground">{t.billing.askBillingAdmin}</p>
      )}
      {!exempt && manage && config.loaded && !config.billingEnvironment && (
        <p className="text-sm text-muted-foreground">{t.errors["billing_not_configured"]}</p>
      )}
      {canBuy && billing.pending_link && billing.provider !== "asaas" && (
        <Button asChild variant="outline" className="w-fit">
          <a href={billing.pending_link}>{t.billing.resumeCheckout}</a>
        </Button>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {plans
          .filter((p) => p.id !== "cedro" || billing.plan_id === "cedro")
          .map((p) => {
            const dir = planDirection(plans, billing.plan_id, p.id);
            const isCurrent = dir === "current";
            const docsMonth = num(p, "documents_month");
            const docsTotal = num(p, "documents_total");
            const users = num(p, "users_max");
            const marked = highlight === p.id && !isCurrent;
            return (
              <li
                key={p.id}
                id={`plano-${p.id}`}
                className={cn(
                  "flex flex-col gap-2 rounded-2xl border bg-white p-4 shadow-sm",
                  isCurrent && "border-brand ring-2 ring-brand/20",
                  marked && "border-brand ring-4 ring-brand/30",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display font-semibold">{p.name}</p>
                  {isCurrent ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-brand">
                      <CheckCircle2 className="size-4" aria-hidden />
                      {t.billing.yourPlan}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        dir === "up"
                          ? "bg-brand-soft text-brand-strong"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {dir === "up" ? t.billing.moreFeatures : t.billing.smallerPlan}
                    </span>
                  )}
                </div>
                <p className="text-sm">
                  {p.id === "cedro"
                    ? t.billing.free
                    : p.price_cents
                      ? f(t.billing.perMonth, { value: money(p.price_cents, locale) })
                      : t.billing.onRequest}
                </p>
                <ul className="text-xs text-muted-foreground">
                  <li>
                    {docsTotal != null
                      ? f(t.billing.docsTotal, { n: String(docsTotal) })
                      : docsMonth != null
                        ? f(t.billing.docsMonth, { n: String(docsMonth) })
                        : p.id === "mogno"
                          ? t.billing.docsContract
                          : t.billing.docsUnlimited}
                  </li>
                  {users != null && (
                    <li>
                      {users === 1
                        ? t.billing.usersOne
                        : f(t.billing.usersUpTo, { n: String(users) })}
                    </li>
                  )}
                  {p.id === "mogno" && <li>{t.billing.withIntegrations}</li>}
                </ul>
                {p.id === "mogno" ? (
                  <Button asChild variant="outline" size="sm" className="mt-auto w-fit">
                    <a href="/pt#planos" target="_blank" rel="noreferrer">
                      {t.billing.talkSales}
                    </a>
                  </Button>
                ) : !isCurrent && canBuy && p.id !== "cedro" ? (
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
                ) : null}
              </li>
            );
          })}
      </ul>
      {canBuy && <p className="text-xs text-muted-foreground">{t.billing.changeHint}</p>}
    </section>
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
