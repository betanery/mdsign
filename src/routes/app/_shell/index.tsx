import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, Info } from "lucide-react";

import { useAuth } from "@/app/auth";
import { journeys, PageHeader } from "@/app/components/app-shell";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/app/_shell/")({ component: Dashboard });

function Dashboard() {
  const { t, f } = useAppI18n();
  const { user } = useAuth();
  const { current } = useOrg();
  const [profile, setProfile] = useState<{ full_name: string | null; cpf: string | null } | null>(
    null,
  );
  const [memberCount, setMemberCount] = useState(1);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, cpf")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data));
  }, [user]);

  useEffect(() => {
    if (!current) return;
    supabase
      .from("memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", current.id)
      .then(({ count }) => setMemberCount(count ?? 1));
  }, [current]);

  const firstName = profile?.full_name?.split(" ")[0];
  const steps = [
    {
      label: t.dashboard.stepProfile,
      done: Boolean(profile?.full_name && profile?.cpf),
      to: "/app/settings" as const,
    },
    { label: t.dashboard.stepSign, done: false },
    { label: t.dashboard.stepSend, done: false },
    { label: t.dashboard.stepTemplate, done: false },
    { label: t.dashboard.stepInvite, done: memberCount > 1, to: "/app/organization" as const },
  ];

  return (
    <>
      <PageHeader
        title={
          firstName ? f(t.dashboard.greeting, { name: firstName }) : t.dashboard.greetingNoName
        }
        subtitle={t.dashboard.subtitle}
      />

      <p className="mb-6 flex items-start gap-2 rounded-xl border border-brand/20 bg-brand-soft px-4 py-3 text-sm text-brand-strong">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t.dashboard.engineNotice}
      </p>

      <section aria-label={t.nav.newAction}>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {journeys.map(({ key, icon: Icon, to }) => {
            const card = (
              <div
                className={
                  to
                    ? "flex h-full flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm transition-colors hover:border-brand"
                    : "flex h-full flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm"
                }
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft">
                  <Icon className="size-5 text-brand" aria-hidden />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-base font-semibold">{t.actions[key]}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t.actions[`${key}Text`]}</p>
                </div>
                {!to && (
                  <span className="w-fit rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground uppercase">
                    {t.common.soon}
                  </span>
                )}
              </div>
            );
            return <li key={key}>{to ? <Link to={to}>{card}</Link> : card}</li>;
          })}
        </ul>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section
          className="rounded-2xl border bg-white p-5 shadow-sm"
          aria-labelledby="attention-title"
        >
          <h2 id="attention-title" className="font-display text-lg font-semibold">
            {t.dashboard.attention}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">{t.dashboard.attentionEmpty}</p>
        </section>

        <section
          className="rounded-2xl border bg-white p-5 shadow-sm"
          aria-labelledby="checklist-title"
        >
          <h2 id="checklist-title" className="font-display text-lg font-semibold">
            {t.dashboard.checklist}
          </h2>
          <ul className="mt-3 space-y-2.5 text-sm">
            {steps.map((step) => {
              const Icon = step.done ? CheckCircle2 : Circle;
              const content = (
                <span className="flex items-center gap-2">
                  <Icon
                    className={step.done ? "size-4 text-success" : "size-4 text-muted-foreground"}
                    aria-hidden
                  />
                  <span className={step.done ? "text-muted-foreground line-through" : ""}>
                    {step.label}
                  </span>
                </span>
              );
              return (
                <li key={step.label}>
                  {step.to && !step.done ? (
                    <Link to={step.to} className="hover:text-brand">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}
