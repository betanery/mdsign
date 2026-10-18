// Prévia de upgrade: o que é o recurso, para que serve, exemplos, plano necessário e comparação
// com o plano atual. Fecha sempre (não interrompe nada). Também protege páginas acessadas pelo
// endereço direto quando o recurso não está no plano (o backend recusa de qualquer forma).

import { useEffect, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Loader2, Lock, Minus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  fillText,
  requiredPlan,
  trackPlanEvent,
  useDocsLabel,
  useFeatureOffer,
  useFeaturePreview,
  useFeatures,
  useFeatureTexts,
  useMoney,
  type FeatureCode,
  type OfferPlan,
} from "../features";
import { useOrg } from "../org";
import { useOrgUsage } from "./plan-usage";

function PreviewBody({ code, where }: { code: FeatureCode; where: string }) {
  const x = useFeatureTexts();
  const offer = useFeatureOffer();
  const usage = useOrgUsage();
  const { current } = useOrg();
  const money = useMoney();
  const docs = useDocsLabel();
  const f = x.features[code];
  const target = requiredPlan(offer, code);
  const mine = offer?.plans.find((p) => p.id === usage?.plan_id) ?? null;

  useEffect(() => {
    trackPlanEvent(current?.id, "feature_preview_viewed", {
      feature: code,
      from_plan: usage?.plan_id,
      to_plan: target?.id,
      where,
    });
    // Uma vez por abertura (o servidor ainda evita repetir no mesmo dia).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, current?.id, target?.id]);

  const price = (p: OfferPlan) =>
    p.period === "contract"
      ? x.contract
      : !p.price_cents
        ? x.free
        : fillText(x.perMonth, { price: money(p.price_cents) });
  const has = (p: OfferPlan) =>
    offer?.features.find((y) => y.code === code)?.modes[p.id] === "available";

  return (
    <div className="grid gap-4 text-sm">
      <p>{f.text}</p>
      <p className="rounded-lg bg-brand-soft/60 p-3 font-medium">{f.benefit}</p>
      {f.examples.length > 0 && (
        <div>
          <p className="mb-1 font-semibold">{x.examples}</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {f.examples.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {target && (
        <div className="overflow-x-auto rounded-xl border" tabIndex={0}>
          <table className="w-full min-w-[320px] text-sm">
            <caption className="sr-only">{x.compare}</caption>
            <thead>
              <tr className="bg-muted/50 text-left text-xs uppercase">
                <th className="p-2 font-semibold" />
                {mine && (
                  <th className="p-2 font-semibold">
                    {x.current}: {mine.name}
                  </th>
                )}
                <th className="p-2 font-semibold text-brand">
                  {x.required}: {target.name}
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                [x.price, price],
                [x.documents, docs],
                [
                  x.users,
                  (p: OfferPlan) =>
                    p.period === "contract"
                      ? x.contract
                      : String(p.entitlements["users_max"] ?? "—"),
                ],
              ].map(([label, fn]) => (
                <tr key={label as string} className="border-t">
                  <th scope="row" className="p-2 text-left font-medium">
                    {label as string}
                  </th>
                  {mine && <td className="p-2">{(fn as (p: OfferPlan) => string)(mine)}</td>}
                  <td className="p-2 font-semibold">{(fn as (p: OfferPlan) => string)(target)}</td>
                </tr>
              ))}
              <tr className="border-t">
                <th scope="row" className="p-2 text-left font-medium">
                  {f.name}
                </th>
                {mine && (
                  <td className="p-2">
                    {has(mine) ? (
                      <Check className="size-4 text-green-700" aria-label={x.available} />
                    ) : (
                      <Minus className="size-4 text-muted-foreground" aria-label="—" />
                    )}
                  </td>
                )}
                <td className="p-2">
                  <Check className="size-4 text-green-700" aria-label={x.available} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PreviewActions({
  code,
  where,
  onDone,
}: {
  code: FeatureCode;
  where: string;
  onDone?: () => void;
}) {
  const x = useFeatureTexts();
  const offer = useFeatureOffer();
  const usage = useOrgUsage();
  const { current, can } = useOrg();
  const target = requiredPlan(offer, code);
  const track = (to: string | undefined, cta: string) => {
    trackPlanEvent(current?.id, "upgrade_cta_clicked", {
      feature: code,
      from_plan: usage?.plan_id,
      to_plan: to,
      where: `${where}:${cta}`,
    });
    onDone?.();
  };
  return (
    <>
      <Button asChild variant="outline">
        <Link to="/app/plan" onClick={() => track(target?.id, "plans")}>
          {x.seePlans}
        </Link>
      </Button>
      {target && target.id !== "mogno" && can("billing.manage") && (
        <Button asChild className="bg-brand hover:bg-brand-strong">
          <Link
            to="/app/plan"
            search={{ plano: target.id }}
            hash="mudar-plano"
            onClick={() => track(target.id, "subscribe")}
          >
            {fillText(x.subscribe, { plan: target.name })}
          </Link>
        </Button>
      )}
    </>
  );
}

/** Janela de prévia aberta pelo menu ou por atalhos (fechar não tem custo). */
export function FeaturePreviewDialog() {
  const x = useFeatureTexts();
  const { state, close } = useFeaturePreview();
  const offer = useFeatureOffer();
  if (!state) return null;
  const f = x.features[state.code];
  const target = requiredPlan(offer, state.code);
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-4 text-brand" aria-hidden />
            {f.name}
          </DialogTitle>
          <DialogDescription>
            {target ? fillText(x.preview, { plan: target.name }) : x.locked}
          </DialogDescription>
        </DialogHeader>
        <PreviewBody code={state.code} where={state.where} />
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={close}>
            {x.close}
          </Button>
          <PreviewActions code={state.code} where={state.where} onDone={close} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Página protegida por plano: disponível → conteúdo; senão, a prévia no lugar da tela.
 * O backend recusa as operações do recurso mesmo que alguém force a rota.
 */
export function FeatureGate({ code, children }: { code: FeatureCode; children: ReactNode }) {
  const x = useFeatureTexts();
  const { mode } = useFeatures();
  const m = mode(code);
  if (m === "loading")
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
      </p>
    );
  if (m === "available") return <>{children}</>;
  const f = x.features[code];
  return (
    <section
      className={cn("grid max-w-2xl gap-4 rounded-2xl border bg-white p-6 shadow-sm")}
      aria-labelledby="gate-title"
    >
      <h1 id="gate-title" className="flex items-center gap-2 font-display text-2xl font-bold">
        <Lock className="size-5 text-brand" aria-hidden />
        {f.name}
      </h1>
      <p className="text-sm text-muted-foreground">{x.notInPlan}</p>
      <PreviewBody code={code} where="direct_route" />
      <div className="flex flex-wrap gap-2">
        <PreviewActions code={code} where="direct_route" />
      </div>
    </section>
  );
}
