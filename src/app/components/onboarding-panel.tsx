import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, Compass, PartyPopper, PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAppI18n } from "../i18n";
import {
  GUIDE_OPEN_EVENT,
  type GuideGroup,
  type GuideStep,
  type GuideStepId,
  useGuide,
} from "../onboarding";
import { GuidedTour, type TourItem } from "./guided-tour";

// "Primeiros passos": checklist com progresso + "Me mostre como" (tour na tela).
// Fica no início do app e numa gaveta acessível de qualquer tela; some ao concluir ou dispensar.

const TOUR_EVENT = "mdsign:guide-tour";
const startTour = (id: GuideStepId) =>
  window.dispatchEvent(new CustomEvent<GuideStepId>(TOUR_EVENT, { detail: id }));

function GuideChecklist({
  guide,
  onAction,
}: {
  guide: ReturnType<typeof useGuide>;
  onAction?: () => void;
}) {
  const { t, f } = useAppI18n();
  const { progress, steps, done, total, update } = guide;
  if (!progress) return null;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const groups: GuideGroup[] = ["basics", "productivity", "team"];

  if (done === total)
    return (
      <div className="grid gap-3 text-sm">
        <p className="flex items-center gap-2 font-display text-lg font-semibold">
          <PartyPopper className="size-5 text-brand" aria-hidden />
          {t.guide.allDone}
        </p>
        <p className="text-muted-foreground">{t.guide.allDoneText}</p>
        <Button variant="outline" className="w-fit" onClick={() => void update("dismiss")}>
          {t.guide.close}
        </Button>
      </div>
    );

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <p className="text-sm font-medium">
          {f(t.guide.progress, { done: String(done), total: String(total) })}
        </p>
        <Progress value={pct} aria-label={`${pct}%`} />
      </div>
      {groups.map((g) => {
        const list = steps.filter((s) => s.group === g);
        if (!list.length) return null;
        return (
          <div key={g} className="grid gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t.guide.groups[g]}
            </p>
            <ul className="grid gap-2">
              {list.map((s: GuideStep) => {
                const ok = progress.steps[s.id];
                const copy = t.guide.steps[s.id];
                return (
                  <li
                    key={s.id}
                    className={cn("rounded-xl border p-3 text-sm", ok && "bg-muted/40")}
                  >
                    <div className="flex items-start gap-2">
                      {ok ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      ) : (
                        <Circle
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn("font-medium", ok && "text-muted-foreground line-through")}
                        >
                          {copy?.title}
                        </p>
                        {!ok && <p className="text-muted-foreground">{copy?.text}</p>}
                      </div>
                    </div>
                    {!ok && (
                      <div className="mt-2 flex flex-wrap gap-2 pl-6">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => {
                            onAction?.();
                            startTour(s.id);
                          }}
                        >
                          <PlayCircle aria-hidden />
                          {t.guide.showMe}
                        </Button>
                        <Button asChild size="sm" variant="ghost" className="h-8">
                          <Link
                            to={s.to}
                            {...(s.search ? { search: s.search } : {})}
                            onClick={onAction}
                          >
                            {t.guide.doIt}
                          </Link>
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => void update("dismiss")}
        className="w-fit text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        {t.guide.dismiss}
      </button>
    </div>
  );
}

/** Cartão no início do app. */
export function GuideCard() {
  const { t } = useAppI18n();
  const guide = useGuide();
  if (!guide.progress || guide.progress.dismissed || !guide.total) return null;
  return (
    <section aria-labelledby="guide-title" className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2
        id="guide-title"
        className="mb-3 flex items-center gap-2 font-display text-lg font-semibold"
      >
        <Compass className="size-5 text-brand" aria-hidden />
        {t.guide.title}
      </h2>
      <GuideChecklist guide={guide} />
    </section>
  );
}

/** Botão flutuante + gaveta + tour, em todas as telas do app. */
export function OnboardingHost() {
  const { t } = useAppI18n();
  const guide = useGuide();
  const { progress, steps, done, total, update, orgId } = guide;
  const [open, setOpen] = useState(false);
  const [tour, setTour] = useState<GuideStepId | null>(null);
  const announced = useRef(false);

  useEffect(() => {
    const onOpen = () => {
      if (progress?.dismissed) void update("reopen");
      setOpen(true);
    };
    const onTour = (e: Event) => {
      const id = (e as CustomEvent<GuideStepId>).detail;
      setOpen(false);
      setTour(id);
      if (orgId)
        void supabase.rpc("growth_app_event", {
          org: orgId,
          ev: "onboarding_tour_started",
          payload: { step: id },
        });
    };
    window.addEventListener(GUIDE_OPEN_EVENT, onOpen);
    window.addEventListener(TOUR_EVENT, onTour);
    return () => {
      window.removeEventListener(GUIDE_OPEN_EVENT, onOpen);
      window.removeEventListener(TOUR_EVENT, onTour);
    };
  }, [progress?.dismissed, update, orgId]);

  // Concluiu todos os passos: registra uma vez.
  useEffect(() => {
    if (!progress || !total || done < total || progress.completed || announced.current) return;
    announced.current = true;
    void update("complete");
    if (orgId)
      void supabase.rpc("growth_app_event", {
        org: orgId,
        ev: "onboarding_completed",
        payload: {},
      });
  }, [progress, done, total, update, orgId]);

  const step = tour ? steps.find((s) => s.id === tour) : null;
  const items: TourItem[] = step
    ? step.tour.map((stop, i) => ({
        stop,
        title: t.guide.tours[step.id]?.[i]?.title ?? t.guide.steps[step.id]?.title ?? "",
        text: t.guide.tours[step.id]?.[i]?.text ?? "",
      }))
    : [];
  const showButton = progress && !progress.dismissed && total > 0 && done < total;

  return (
    <>
      {showButton && !tour && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-24 z-40 hidden items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm font-semibold shadow-lg hover:border-brand lg:bottom-6 lg:flex"
        >
          <Compass className="size-4 text-brand" aria-hidden />
          {t.guide.title} {done}/{total}
        </button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Compass className="size-5 text-brand" aria-hidden />
              {t.guide.title}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {progress && total > 0 ? (
              <GuideChecklist guide={guide} onAction={() => setOpen(false)} />
            ) : (
              <p className="text-sm text-muted-foreground">{t.common.loading}</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
      {step && items.length > 0 && (
        <GuidedTour
          key={step.id}
          items={items}
          onClose={() => setTour(null)}
          onFinish={() => setTour(null)}
        />
      )}
    </>
  );
}
