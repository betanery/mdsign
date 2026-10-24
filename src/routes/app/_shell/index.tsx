import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  Files,
  Circle,
  Clock,
  FileCheck2,
  PenLine,
  Send,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/app/auth";
import { PageHeader } from "@/app/components/app-shell";
import { FreePlanCard, freeUsage } from "@/app/components/free-plan-card";
import { PlanUsage, useOrgUsage } from "@/app/components/plan-usage";
import { GuideCard } from "@/app/components/onboarding-panel";
import { QualificationCard } from "@/app/components/qualification-card";
import { documentSelect, type DocumentRow } from "@/app/documents";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

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
  const [docsLoaded, setDocsLoaded] = useState(false);
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
      .then(({ data }) => {
        setDocs((data as Doc[] | null) ?? []);
        setDocsLoaded(true);
      });
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
    const approvals = forMe.filter((d) =>
      d.document_participants.some(
        (p) => p.user_id === user?.id && p.status === "pending" && p.role === "approver",
      ),
    );
    return {
      waiting: docs.filter((d) => d.status === "pending").length,
      forMe,
      approvals,
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

      {/* Primeira experiência: duas portas de entrada claras (fluxos atuais, sem motor novo). */}
      {docsLoaded && docs.length === 0 && (
        <section
          aria-labelledby="first-title"
          className="mb-6 rounded-2xl border bg-white p-5 shadow-sm"
        >
          <h2 id="first-title" className="font-display text-xl font-semibold">
            {t.cedro.firstTitle}
          </h2>
          {freeUsage(usage) && (
            <p className="mt-1 text-sm text-muted-foreground">{t.cedro.firstText}</p>
          )}
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  to: "/app/sign",
                  icon: PenLine,
                  title: t.cedro.firstSign,
                  text: t.cedro.firstSignText,
                },
                {
                  to: "/app/send",
                  icon: Send,
                  title: t.cedro.firstSend,
                  text: t.cedro.firstSendText,
                },
              ] as const
            ).map(({ to, icon: Icon, title, text }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="flex h-full items-start gap-3 rounded-xl border-2 border-brand/20 p-4 transition-colors hover:border-brand hover:bg-brand-soft/40"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-display font-semibold">{title}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Acesso rápido: ícone + título curto + uma linha, cada cartão abre a ação de verdade. */}
      <section aria-label={t.nav.newAction}>
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {(
            [
              {
                key: "newDoc",
                to: "/app/send",
                icon: FilePlus2,
                primary: true,
                count: 0,
              },
              { key: "signDoc", to: "/app/sign", icon: PenLine, count: 0 },
              { key: "myDocs", to: "/app/documents", icon: Files, count: 0 },
              {
                key: "approvals",
                to: "/app/documents",
                search: { tab: "forMe" },
                icon: ClipboardCheck,
                count: stats.approvals.length,
              },
            ] as const
          ).map((card) => {
            const Icon = card.icon;
            const primary = "primary" in card && card.primary;
            return (
              <li key={card.key}>
                <Link
                  to={card.to}
                  {...("search" in card ? { search: card.search } : {})}
                  data-tour={`quick-${card.key}`}
                  className={cn(
                    "flex h-full flex-col gap-2 rounded-2xl border p-3 shadow-sm transition-colors sm:gap-3 sm:p-5",
                    primary
                      ? "border-brand bg-brand text-white hover:bg-brand-strong"
                      : "bg-white hover:border-brand",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-xl sm:size-11",
                        primary ? "bg-white/20" : "bg-brand-soft",
                      )}
                    >
                      <Icon
                        className={cn("size-5", primary ? "text-white" : "text-brand")}
                        aria-hidden
                      />
                    </span>
                    {card.count > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                        {f(t.quick.pending, { n: String(card.count) })}
                      </span>
                    )}
                  </span>
                  <span className="flex-1">
                    <span className="block font-display text-sm font-semibold sm:text-base">
                      {t.quick[card.key]}
                    </span>
                    <span
                      className={cn(
                        "mt-1 hidden text-sm sm:block",
                        primary ? "text-white/85" : "text-muted-foreground",
                      )}
                    >
                      {t.quick[`${card.key}Text`]}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
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

      {/* minmax(0,…) e min-w-0: nomes longos de documento cortam com "…" em vez de alargar a tela. */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section
          className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm"
          aria-labelledby="attention-title"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 id="attention-title" className="font-display text-lg font-semibold">
              {t.dashboard.attention}
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              {stats.forMe.length > 1 && (
                <Link
                  to="/app/documents"
                  search={{ tab: "forMe", fila: 1 }}
                  className="text-sm font-semibold text-brand"
                >
                  {f(t.documents.signAll, { n: String(stats.forMe.length) })}
                </Link>
              )}
              <Link to="/app/documents" className="text-sm font-semibold text-brand">
                {t.dashboard.seeAll}
              </Link>
            </div>
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
                    <span className="min-w-0 truncate">{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid min-w-0 content-start gap-6">
          <QualificationCard concluded={stats.concluded} />
          {usage && (
            <section
              className="rounded-2xl border bg-white p-5 shadow-sm"
              aria-label={t.dashboard.usageTitle}
            >
              {freeUsage(usage) ? (
                <FreePlanCard usage={usage} />
              ) : (
                <PlanUsage usage={usage} compact />
              )}
            </section>
          )}
          <GuideCard />
        </div>
      </div>
    </>
  );
}
