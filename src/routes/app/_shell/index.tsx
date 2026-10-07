import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  FileCheck2,
  PenLine,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/app/auth";
import { journeys, PageHeader } from "@/app/components/app-shell";
import { PlanUsage, useOrgUsage } from "@/app/components/plan-usage";
import { documentSelect, type DocumentRow } from "@/app/documents";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/app/_shell/")({ component: Dashboard });

type Doc = DocumentRow & { expires_at: string | null };
const DAY = 24 * 60 * 60 * 1000;

/** Atrasado: pendente há mais de 7 dias ou vencendo em até 2 dias (PRD §5). */
function isLate(d: Doc, now: number) {
  if (d.status !== "pending") return false;
  if (now - new Date(d.created_at).getTime() > 7 * DAY) return true;
  return Boolean(d.expires_at && new Date(d.expires_at).getTime() - now < 2 * DAY);
}

function Dashboard() {
  const { t, f } = useAppI18n();
  const { user } = useAuth();
  const { current } = useOrg();
  const usage = useOrgUsage();
  const [profile, setProfile] = useState<{ full_name: string | null; cpf: string | null } | null>(
    null,
  );
  const [memberCount, setMemberCount] = useState(1);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [hasTemplate, setHasTemplate] = useState(false);

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
    supabase
      .from("documents")
      .select(`${documentSelect}, expires_at`)
      .eq("organization_id", current.id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(300)
      .then(({ data }) => setDocs((data as Doc[] | null) ?? []));
    supabase
      .from("templates")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", current.id)
      .then(({ count }) => setHasTemplate((count ?? 0) > 0));
  }, [current]);

  const stats = useMemo(() => {
    const now = Date.now();
    const forMe = docs.filter(
      (d) =>
        d.status === "pending" &&
        d.document_participants.some((p) => p.user_id === user?.id && p.status === "pending"),
    );
    const late = docs.filter((d) => isLate(d, now));
    const refused = docs.filter(
      (d) => d.status === "refused" && now - new Date(d.updated_at).getTime() < 7 * DAY,
    );
    return {
      waiting: docs.filter((d) => d.status === "pending").length,
      forMe,
      late,
      refused,
      concluded: docs.filter((d) => d.status === "concluded").length,
    };
  }, [docs, user]);

  const attention: { doc: Doc; label: string; icon: LucideIcon; tone: string }[] = [
    ...stats.forMe.map((doc) => ({
      doc,
      label: f(t.dashboard.attentionSign, { name: doc.name }),
      icon: PenLine,
      tone: "text-brand",
    })),
    ...stats.late
      .filter((d) => !stats.forMe.includes(d))
      .map((doc) => ({
        doc,
        label: f(t.dashboard.attentionLate, { name: doc.name }),
        icon: AlertTriangle,
        tone: "text-orange-600",
      })),
    ...stats.refused.map((doc) => ({
      doc,
      label: f(t.dashboard.attentionRefused, { name: doc.name }),
      icon: XCircle,
      tone: "text-destructive",
    })),
  ].slice(0, 8);

  const firstName = profile?.full_name?.split(" ")[0];
  const steps = [
    {
      label: t.dashboard.stepProfile,
      done: Boolean(profile?.full_name && profile?.cpf),
      to: "/app/settings" as const,
    },
    {
      label: t.dashboard.stepSign,
      done: docs.some((d) => d.kind === "self" && d.status === "concluded"),
      to: "/app/sign" as const,
    },
    {
      label: t.dashboard.stepSend,
      done: docs.some((d) => d.kind === "send"),
      to: "/app/send" as const,
    },
    { label: t.dashboard.stepTemplate, done: hasTemplate, to: "/app/templates/new" as const },
    { label: t.dashboard.stepInvite, done: memberCount > 1, to: "/app/organization" as const },
  ];

  const indicators = [
    { key: "waiting", value: stats.waiting, icon: Clock, tab: "waiting" },
    { key: "forMe", value: stats.forMe.length, icon: PenLine, tab: "forMe" },
    { key: "late", value: stats.late.length, icon: AlertTriangle, tab: "waiting" },
    { key: "concluded", value: stats.concluded, icon: FileCheck2, tab: "concluded" },
  ] as const;

  return (
    <>
      <PageHeader
        title={
          firstName ? f(t.dashboard.greeting, { name: firstName }) : t.dashboard.greetingNoName
        }
        subtitle={t.dashboard.subtitle}
      />

      <section aria-label={t.nav.newAction}>
        {/* No celular: 2 por linha e sem descrição, para "Precisa da sua atenção" aparecer logo. */}
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {journeys.map(({ key, icon: Icon, to }) => (
            <li key={key}>
              <Link
                to={to}
                className="flex h-full flex-col gap-2 rounded-2xl border bg-white p-3 shadow-sm transition-colors hover:border-brand sm:gap-3 sm:p-5"
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft sm:size-11">
                  <Icon className="size-5 text-brand" aria-hidden />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-sm font-semibold sm:text-base">
                    {t.actions[key]}
                  </h2>
                  <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
                    {t.actions[`${key}Text`]}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6" aria-label={t.documents.title}>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {indicators.map(({ key, value, icon: Icon, tab }) => (
            <li key={key}>
              <Link
                to="/app/documents"
                search={{ tab }}
                className="flex items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm hover:border-brand"
                title={key === "late" ? t.dashboard.lateHint : undefined}
              >
                <Icon
                  className={
                    key === "late" && value ? "size-5 text-orange-600" : "size-5 text-brand"
                  }
                  aria-hidden
                />
                <span>
                  <span className="block font-display text-2xl font-bold">{value}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.dashboard.indicators[key]}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section
          className="rounded-2xl border bg-white p-5 shadow-sm"
          aria-labelledby="attention-title"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 id="attention-title" className="font-display text-lg font-semibold">
              {t.dashboard.attention}
            </h2>
            <Link to="/app/documents" className="text-sm font-semibold text-brand">
              {t.dashboard.seeAll}
            </Link>
          </div>
          {attention.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t.dashboard.attentionEmpty}</p>
          ) : (
            <ul className="mt-3 divide-y">
              {attention.map(({ doc, label, icon: Icon, tone }) => (
                <li key={`${doc.id}-${label}`}>
                  <Link
                    to="/app/documents/$id"
                    params={{ id: doc.id }}
                    className="flex items-center gap-3 py-2.5 text-sm hover:text-brand"
                  >
                    <Icon className={`size-4 shrink-0 ${tone}`} aria-hidden />
                    <span className="truncate">{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid content-start gap-6">
          {usage && (
            <section
              className="rounded-2xl border bg-white p-5 shadow-sm"
              aria-label={t.dashboard.usageTitle}
            >
              <PlanUsage usage={usage} compact />
            </section>
          )}
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
                    {step.done ? (
                      content
                    ) : (
                      <Link to={step.to} className="hover:text-brand">
                        {content}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
