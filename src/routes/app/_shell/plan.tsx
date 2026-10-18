import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Gem, Loader2, Lock, Minus } from "lucide-react";

import { PageHeader } from "@/app/components/app-shell";
import { PlanChooser } from "@/app/components/plan-chooser";
import { useOrgUsage } from "@/app/components/plan-usage";
import {
  fillText,
  trackPlanEvent,
  useDocsLabel,
  useFeatureOffer,
  useFeatures,
  useFeatureTexts,
  useMoney,
  type FeatureCode,
  type OfferPlan,
} from "@/app/features";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// Meu plano: o que está contratado (versão da organização), consumo, usuários, recursos,
// o próximo plano, a troca de plano (#mudar-plano) e a comparação. Faturas e cancelamento
// continuam em Organização → Plano e cobrança.
type Search = { plano?: string | undefined; checkout?: string | undefined };

export const Route = createFileRoute("/app/_shell/plan")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    plano: typeof search["plano"] === "string" ? search["plano"] : undefined,
    checkout: typeof search["checkout"] === "string" ? search["checkout"] : undefined,
  }),
  component: PlanPage,
});

type OrgPlan = {
  plan_id: string;
  name: string;
  version: string;
  price_cents: number | null;
  period: "one_time" | "month" | "contract";
  value_cents: number | null;
  billing_status: string;
  status: string;
};

const T = {
  pt: {
    title: "Meu plano",
    subtitle:
      "O que está incluído no seu plano, quanto você já usou e o que outros planos oferecem.",
    plan: "Plano {name}",
    free: "Grátis",
    perMonth: "{price} por mês",
    contract: "Condições conforme contrato",
    cedroUsage: "{used} de {limit} documentos gratuitos utilizados",
    cedroNote:
      "A franquia gratuita é da pessoa e vale uma única vez, somando todas as organizações gratuitas que você criar.",
    monthUsage: "{used} de {limit} documentos utilizados neste mês",
    monthNote:
      "A franquia renova no dia 1º de cada mês (horário de Brasília). Não há cobrança de excedente: ao chegar ao limite, novos envios aguardam o próximo mês ou um upgrade.",
    unlimited: "Documentos ilimitados",
    unlimitedUsed: "{n} documentos neste mês",
    users: "{used} de {max} usuários",
    usersContract: "{used} usuários",
    features: "Recursos do seu plano",
    otherPlan: "Disponível em outro plano",
    next: "Próximo passo: {plan}",
    nextMogno: "Precisa de integrações ou condições sob medida?",
    compare: "Comparar planos",
    yourPlan: "Seu plano",
    upgrade: "Ver planos",
    billing: "Plano e cobrança",
    talk: "Falar com especialista",
    price: "Mensalidade",
    documents: "Documentos",
    usersRow: "Usuários",
    available: "Incluído",
    preview: "Disponível com upgrade",
    notIncluded: "Não incluído",
  },
  en: {
    title: "My plan",
    subtitle: "What your plan includes, how much you've used and what other plans offer.",
    plan: "{name} plan",
    free: "Free",
    perMonth: "{price} per month",
    contract: "Terms per contract",
    cedroUsage: "{used} of {limit} free documents used",
    cedroNote:
      "The free allowance belongs to the person and is granted once, across all free organizations you create.",
    monthUsage: "{used} of {limit} documents used this month",
    monthNote:
      "The allowance renews on the 1st of each month (Brasília time). There's no overage charge: at the limit, new sends wait for next month or an upgrade.",
    unlimited: "Unlimited documents",
    unlimitedUsed: "{n} documents this month",
    users: "{used} of {max} users",
    usersContract: "{used} users",
    features: "Your plan's features",
    otherPlan: "Available on another plan",
    next: "Next step: {plan}",
    nextMogno: "Need integrations or custom terms?",
    compare: "Compare plans",
    yourPlan: "Your plan",
    upgrade: "See plans",
    billing: "Plan and billing",
    talk: "Talk to a specialist",
    price: "Monthly price",
    documents: "Documents",
    usersRow: "Users",
    available: "Included",
    preview: "Available with upgrade",
    notIncluded: "Not included",
  },
  es: {
    title: "Mi plan",
    subtitle: "Qué incluye tu plan, cuánto ya usaste y qué ofrecen otros planes.",
    plan: "Plan {name}",
    free: "Gratis",
    perMonth: "{price} por mes",
    contract: "Condiciones según contrato",
    cedroUsage: "{used} de {limit} documentos gratuitos usados",
    cedroNote:
      "La franquicia gratuita es de la persona y vale una sola vez, sumando todas las organizaciones gratuitas que crees.",
    monthUsage: "{used} de {limit} documentos usados este mes",
    monthNote:
      "La franquicia se renueva el día 1 de cada mes (hora de Brasilia). No se cobra excedente: al llegar al límite, los nuevos envíos esperan al próximo mes o a un upgrade.",
    unlimited: "Documentos ilimitados",
    unlimitedUsed: "{n} documentos este mes",
    users: "{used} de {max} usuarios",
    usersContract: "{used} usuarios",
    features: "Funciones de tu plan",
    otherPlan: "Disponible en otro plan",
    next: "Próximo paso: {plan}",
    nextMogno: "¿Necesitas integraciones o condiciones a medida?",
    compare: "Comparar planes",
    yourPlan: "Tu plan",
    upgrade: "Ver planes",
    billing: "Plan y cobro",
    talk: "Hablar con un especialista",
    price: "Mensualidad",
    documents: "Documentos",
    usersRow: "Usuarios",
    available: "Incluido",
    preview: "Disponible con upgrade",
    notIncluded: "No incluido",
  },
};
export const planPageTexts = T;

function PlanPage() {
  const { locale, t } = useAppI18n();
  const p = T[locale as keyof typeof T] ?? T.pt;
  const x = useFeatureTexts();
  const { current, can } = useOrg();
  const usage = useOrgUsage();
  const offer = useFeatureOffer();
  const { modes } = useFeatures();
  const money = useMoney();
  const docs = useDocsLabel();
  const search = Route.useSearch();
  const [plan, setPlan] = useState<OrgPlan | null>(null);
  // Voltou do pagamento: o plano só muda quando o Asaas confirmar. Acompanha por 2 minutos.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (search.checkout !== "success") return;
    let n = 0;
    const id = window.setInterval(() => {
      n++;
      setTick((x) => x + 1);
      if (n >= 24) window.clearInterval(id);
    }, 5000);
    return () => window.clearInterval(id);
  }, [search.checkout]);

  useEffect(() => {
    if (!current) return;
    void supabase
      .rpc("org_plan", { org: current.id })
      .then(({ data }) => setPlan((data as OrgPlan | null) ?? null));
  }, [current, tick]);

  if (!current || !usage || !plan) return <PageHeader title={p.title} subtitle={p.subtitle} />;

  const plans = [...(offer?.plans ?? [])].sort((a, b) => a.sort - b.sort);
  const idx = plans.findIndex((x2) => x2.id === plan.plan_id);
  const next = idx >= 0 ? plans[idx + 1] : plans.find((x2) => x2.id === "jacaranda");
  const priceOf = (cents: number | null, period: string) =>
    period === "contract"
      ? p.contract
      : !cents
        ? p.free
        : fillText(p.perMonth, { price: money(cents) });
  const features = (offer?.features ?? []).filter((f) => !f.core);
  const track = (to: string | undefined, where: string) =>
    trackPlanEvent(current.id, "upgrade_cta_clicked", {
      from_plan: plan.plan_id,
      to_plan: to,
      where,
    });

  return (
    <>
      <PageHeader title={p.title} subtitle={p.subtitle} />
      {search.checkout === "success" && (
        <p
          className="mb-4 flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm"
          role="status"
        >
          <Loader2 className="size-4 animate-spin text-brand" aria-hidden />
          {t.billing.processing}
        </p>
      )}
      {(search.checkout === "canceled" || search.checkout === "expired") && (
        <p className="mb-4 rounded-xl border bg-white px-4 py-3 text-sm text-muted-foreground">
          {t.billing.checkoutLeft}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section
          className="grid content-start gap-4 rounded-2xl border bg-white p-5 shadow-sm"
          aria-labelledby="my-plan"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Gem className="size-5 text-brand" aria-hidden />
            <h2 id="my-plan" className="font-display text-xl font-semibold">
              {fillText(p.plan, { name: plan.name })}
            </h2>
          </div>
          <p className="text-lg font-semibold">
            {plan.billing_status === "paid" && plan.value_cents
              ? priceOf(plan.value_cents, plan.period)
              : priceOf(plan.price_cents, plan.period)}
          </p>
          {usage.plan_id === "cedro" && usage.has_total_limit ? (
            <div className="grid gap-2">
              <p className="font-medium">
                {fillText(p.cedroUsage, {
                  used: Math.min(usage.documents_total_used, usage.documents_total_limit ?? 0),
                  limit: usage.documents_total_limit ?? 0,
                })}
              </p>
              <Progress
                value={
                  usage.documents_total_limit
                    ? (Math.min(usage.documents_total_used, usage.documents_total_limit) /
                        usage.documents_total_limit) *
                      100
                    : 0
                }
                aria-label={fillText(p.cedroUsage, {
                  used: usage.documents_total_used,
                  limit: usage.documents_total_limit ?? 0,
                })}
              />
              <p className="text-xs text-muted-foreground">{p.cedroNote}</p>
            </div>
          ) : usage.has_month_limit ? (
            <div className="grid gap-2">
              <p className="font-medium">
                {fillText(p.monthUsage, {
                  used: usage.documents_month_used,
                  limit: usage.documents_month_limit ?? 0,
                })}
              </p>
              <Progress
                value={
                  usage.documents_month_limit
                    ? Math.min(
                        100,
                        (usage.documents_month_used / usage.documents_month_limit) * 100,
                      )
                    : 0
                }
                aria-label={fillText(p.monthUsage, {
                  used: usage.documents_month_used,
                  limit: usage.documents_month_limit ?? 0,
                })}
              />
              <p className="text-xs text-muted-foreground">{p.monthNote}</p>
            </div>
          ) : (
            <div>
              <p className="font-medium">{plan.period === "contract" ? p.contract : p.unlimited}</p>
              <p className="text-sm text-muted-foreground">
                {fillText(p.unlimitedUsed, { n: usage.documents_month_used })}
              </p>
            </div>
          )}
          <p className="text-sm">
            {usage.users_max != null
              ? fillText(p.users, { used: usage.users_used, max: usage.users_max })
              : fillText(p.usersContract, { used: usage.users_used })}
          </p>
          <div>
            <h3 className="mb-2 text-sm font-semibold">{p.features}</h3>
            <ul className="grid gap-1.5 text-sm">
              {features.map((f) => {
                const m = modes?.[f.code];
                if (m === "hidden" || !m) return null;
                return (
                  <li key={f.code} className="flex items-center gap-2">
                    {m === "available" ? (
                      <Check className="size-4 shrink-0 text-green-700" aria-hidden />
                    ) : (
                      <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className={cn(m !== "available" && "text-muted-foreground")}>
                      {x.features[f.code as FeatureCode]?.name ?? f.code}
                      {m !== "available" && ` · ${p.otherPlan}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          {can("billing.view") && (
            <Button asChild variant="outline" className="w-fit">
              <Link to="/app/organization" search={{ tab: "plan" }}>
                {p.billing}
              </Link>
            </Button>
          )}
        </section>

        {next && (
          <section
            className="grid content-start gap-3 rounded-2xl border border-brand/30 bg-brand-soft/40 p-5"
            aria-labelledby="next-plan"
          >
            <h2 id="next-plan" className="font-display text-lg font-semibold">
              {next.id === "mogno" ? p.nextMogno : fillText(p.next, { plan: next.name })}
            </h2>
            {next.description && <p className="text-sm">{next.description}</p>}
            <ul className="grid gap-1.5 text-sm">
              {next.benefits.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
            <p className="text-sm font-semibold">{priceOf(next.price_cents, next.period)}</p>
            {next.id !== "mogno" ? (
              <Button asChild className="w-fit bg-brand hover:bg-brand-strong">
                <Link
                  to="/app/plan"
                  search={{ plano: next.id }}
                  hash="mudar-plano"
                  onClick={() => track(next.id, "plan_page_next")}
                >
                  {p.upgrade}
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            ) : next.id === "mogno" ? (
              <Button asChild variant="outline" className="w-fit">
                <a href="/pt#contato" onClick={() => track("mogno", "plan_page_mogno")}>
                  {p.talk}
                </a>
              </Button>
            ) : null}
          </section>
        )}
      </div>

      <div className="mt-6">
        <PlanChooser key={tick} usage={usage} highlight={search.plano} />
      </div>

      <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm" aria-labelledby="compare">
        <h2 id="compare" className="mb-3 font-display text-lg font-semibold">
          {p.compare}
        </h2>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left">
                <th className="p-2" />
                {plans.map((pl) => (
                  <th
                    key={pl.id}
                    scope="col"
                    className={cn("p-2 align-bottom", pl.id === plan.plan_id && "bg-brand-soft")}
                  >
                    <span className="block font-display text-base">{pl.name}</span>
                    {pl.id === plan.plan_id && (
                      <span className="text-xs font-semibold text-brand">{p.yourPlan}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row
                label={p.price}
                plans={plans}
                mine={plan.plan_id}
                cell={(pl) => priceOf(pl.price_cents, pl.period)}
              />
              <Row label={p.documents} plans={plans} mine={plan.plan_id} cell={docs} />
              <Row
                label={p.usersRow}
                plans={plans}
                mine={plan.plan_id}
                cell={(pl) =>
                  pl.period === "contract"
                    ? x.contract
                    : String(pl.entitlements["users_max"] ?? "—")
                }
              />
              {features.map((f) => (
                <tr key={f.code} className="border-t">
                  <th scope="row" className="p-2 text-left font-medium">
                    {x.features[f.code as FeatureCode]?.name ?? f.code}
                  </th>
                  {plans.map((pl) => {
                    const m = f.modes[pl.id];
                    return (
                      <td
                        key={pl.id}
                        className={cn("p-2", pl.id === plan.plan_id && "bg-brand-soft/60")}
                      >
                        {m === "available" || m === "contract" ? (
                          <Check
                            className="size-4 text-green-700"
                            aria-label={m === "contract" ? x.contract : p.available}
                          />
                        ) : m === "preview" ? (
                          <Lock className="size-4 text-muted-foreground" aria-label={p.preview} />
                        ) : (
                          <Minus
                            className="size-4 text-muted-foreground"
                            aria-label={p.notIncluded}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Row({
  label,
  plans,
  mine,
  cell,
}: {
  label: string;
  plans: OfferPlan[];
  mine: string;
  cell: (p: OfferPlan) => string;
}) {
  return (
    <tr className="border-t">
      <th scope="row" className="p-2 text-left font-medium">
        {label}
      </th>
      {plans.map((pl) => (
        <td key={pl.id} className={cn("p-2", pl.id === mine && "bg-brand-soft/60 font-semibold")}>
          {cell(pl)}
        </td>
      ))}
    </tr>
  );
}
