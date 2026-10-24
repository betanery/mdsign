import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BadgeCheck,
  ChartNoAxesColumn,
  ChevronsUpDown,
  Compass,
  ContactRound,
  FilePlus2,
  Files,
  FileStack,
  Gem,
  Home,
  LayoutTemplate,
  Lock,
  LogOut,
  Menu,
  PenLine,
  Plug,
  Plus,
  Settings,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { logoIcon } from "@/components/landing/logo";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../auth";
import { useAppI18n } from "../i18n";
import { useOrg, type Permission } from "../org";
import { ClosedBanner } from "./account-tab";
import { CedroBanner } from "./free-plan-card";
import { OnboardingHost } from "./onboarding-panel";
import { openGuide } from "../onboarding";
import { GlobalSearch } from "./global-search";
import { LanguageSelect, SkipLink } from "./language-select";
import { useOrgUsage } from "./plan-usage";
import { FeaturePreviewDialog } from "./feature-preview";
import {
  FeaturePreviewProvider,
  trackPlanEvent,
  useFeaturePreview,
  useFeatures,
  type FeatureCode,
} from "../features";

type NavKey =
  | "home"
  | "documents"
  | "templates"
  | "processes"
  | "bulk"
  | "forms"
  | "contacts"
  | "organization"
  | "integrations"
  | "reports"
  | "plan"
  | "settings";

export type NavGroup = "operation" | "productivity" | "team" | "integrations" | "account";

export type NavItem = {
  key: NavKey;
  icon: LucideIcon;
  group: NavGroup;
  to:
    | "/app"
    | "/app/documents"
    | "/app/templates"
    | "/app/bulk"
    | "/app/contacts"
    | "/app/integrations"
    | "/app/organization"
    | "/app/reports"
    | "/app/plan"
    | "/app/settings";
  /** Outras rotas que acendem o mesmo item (abas da seção). */
  also?: string[];
  /** Funcionalidade do plano (navegação progressiva); sem ela, sempre disponível. */
  feature?: FeatureCode;
  /** Permissão do papel da pessoa; sem ela, o item não aparece. */
  perm?: Permission;
};

/** Menu por categoria. A ordem dentro da categoria é a ordem de exibição. */
export const navItems: NavItem[] = [
  { key: "home", to: "/app", icon: Home, group: "operation" },
  { key: "documents", to: "/app/documents", icon: Files, group: "operation" },
  {
    key: "contacts",
    to: "/app/contacts",
    icon: ContactRound,
    group: "operation",
    feature: "contacts",
  },
  {
    key: "templates",
    to: "/app/templates",
    icon: LayoutTemplate,
    group: "productivity",
    also: ["/app/forms"],
    feature: "templates",
  },
  {
    key: "bulk",
    to: "/app/bulk",
    icon: FileStack,
    group: "productivity",
    also: ["/app/processes"],
    feature: "bulk_send",
    perm: "bulk.send",
  },
  { key: "organization", to: "/app/organization", icon: UsersRound, group: "team" },
  {
    key: "reports",
    to: "/app/reports",
    icon: ChartNoAxesColumn,
    group: "team",
    feature: "reports",
    perm: "reports.export",
  },
  {
    key: "integrations",
    to: "/app/integrations",
    icon: Plug,
    group: "integrations",
    feature: "api_webhooks",
    perm: "integrations.manage",
  },
  { key: "plan", to: "/app/plan", icon: Gem, group: "account" },
  { key: "settings", to: "/app/settings", icon: Settings, group: "account" },
];

/** No máximo 2 recursos com cadeado no menu; os demais ficam na comparação de planos. */
export const MAX_MENU_PREVIEWS = 2;

/**
 * Regra única do menu (o app e o simulador do Super Admin usam a mesma): permissão do papel +
 * modo do plano; no máximo MAX_MENU_PREVIEWS itens com cadeado, os demais somem do menu.
 */
export function buildNav(mode: (code: FeatureCode) => string, can: (perm: Permission) => boolean) {
  let previews = 0;
  return navItems
    .filter((item) => !item.perm || can(item.perm))
    .map((item) => {
      const m = item.feature ? mode(item.feature) : "available";
      if (m === "available") return { item, locked: false };
      if (m === "preview" && previews < MAX_MENU_PREVIEWS) {
        previews++;
        return { item, locked: true };
      }
      return null;
    })
    .filter((x): x is { item: NavItem; locked: boolean } => x !== null);
}

/** Itens visíveis: plano (banco) + permissão do papel; prévias limitadas. */
export function useNavModel() {
  const { mode } = useFeatures();
  const { can } = useOrg();
  return buildNav(mode, can);
}

/** As quatro portas principais (PRD §1 e §6), com o recurso de plano de cada uma. */
export const journeys = [
  { key: "selfSign", icon: PenLine, to: "/app/sign" },
  { key: "send", icon: FilePlus2, to: "/app/send" },
  { key: "template", icon: LayoutTemplate, to: "/app/templates", feature: "templates" },
  { key: "bulk", icon: FileStack, to: "/app/bulk/new", feature: "bulk_send" },
] as const;

/** Atalhos de ação: só os recursos disponíveis no plano (sem oferta no meio do fluxo). */
export function useJourneys() {
  const { mode } = useFeatures();
  const { can } = useOrg();
  return journeys.filter(
    (j) =>
      (!("feature" in j) || mode(j.feature) === "available") &&
      (j.key !== "bulk" || can("bulk.send")),
  );
}

function NavLink({
  item,
  locked,
  onNavigate,
}: {
  item: NavItem;
  locked: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const { t } = useAppI18n();
  const preview = useFeaturePreview();
  const { current } = useOrg();
  const usage = useOrgUsage();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active =
    item.to === "/app"
      ? pathname === "/app" || pathname === "/app/"
      : [item.to, ...(item.also ?? [])].some((p) => pathname.startsWith(p));
  const Icon = item.icon;
  const className = cn(
    "flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors",
    active ? "bg-white/15 text-white" : "text-white/85 hover:bg-white/10 hover:text-white",
  );
  if (locked && item.feature)
    return (
      <button
        type="button"
        className={cn(className, "text-white/70")}
        aria-haspopup="dialog"
        onClick={() => {
          trackPlanEvent(current?.id, "locked_feature_clicked", {
            feature: item.feature,
            from_plan: usage?.plan_id,
            where: "menu",
          });
          onNavigate?.();
          preview.open(item.feature!, "menu");
        }}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">{t.nav[item.key]}</span>
        <Lock className="size-3.5 shrink-0" aria-label={t.nav.locked} />
      </button>
    );
  return (
    <Link
      to={item.to}
      // "/app" é pai de todas as rotas: sem exact, "Início" ficava como página atual em tudo.
      activeOptions={{ exact: item.to === "/app" }}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">{t.nav[item.key]}</span>
    </Link>
  );
}

function OrgSwitcher() {
  const { organizations, current, setCurrent } = useOrg();
  const { t } = useAppI18n();
  if (!current) return null;
  if (organizations.length < 2) {
    return <p className="truncate px-3 text-sm font-semibold text-white">{current.name}</p>;
  }
  return (
    <label className="relative block px-1">
      <span className="sr-only">{t.nav.switchOrg}</span>
      <select
        value={current.id}
        onChange={(e) => setCurrent(e.target.value)}
        className="w-full appearance-none rounded-lg bg-white/10 py-2 pr-8 pl-3 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        {organizations.map((o) => (
          <option key={o.id} value={o.id} className="text-foreground">
            {o.name}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute top-2.5 right-3 size-4 text-white/70" />
    </label>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { t, locale } = useAppI18n();
  const { signOut, user } = useAuth();
  const { isPlatformAdmin } = useOrg();
  const nav = useNavModel();
  return (
    <div className="flex h-full flex-col gap-4 bg-brand-strong p-3 text-white">
      <Link
        to="/app"
        activeOptions={{ exact: true }}
        onClick={onNavigate}
        className="flex items-center gap-2 px-2 pt-1"
      >
        <img
          src={logoIcon}
          alt=""
          width={102}
          height={112}
          className="h-7 w-auto brightness-0 invert"
        />
        <span className="font-display text-lg font-bold">MDSign</span>
      </Link>
      <OrgSwitcher />
      <nav aria-label="MDSign" className="flex-1 space-y-3 overflow-y-auto">
        {(["operation", "productivity", "team", "integrations", "account"] as const).map((g) => {
          const items = nav.filter((x) => x.item.group === g);
          if (!items.length) return null;
          return (
            <div key={g} className="space-y-0.5">
              <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-white/60 uppercase">
                {t.nav.groups[g]}
              </p>
              {items.map(({ item, locked }) => (
                <NavLink key={item.key} item={item} locked={locked} onNavigate={onNavigate} />
              ))}
            </div>
          );
        })}
        {isPlatformAdmin && (
          <Link
            to="/admin"
            onClick={onNavigate}
            className="mt-2 flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/85 hover:bg-white/10"
          >
            <ShieldCheck className="size-4" aria-hidden />
            {t.nav.admin}
            <AdminAlertsBadge />
          </Link>
        )}
      </nav>
      <div className="space-y-3 border-t border-white/15 pt-3">
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            openGuide();
          }}
          className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/85 hover:bg-white/10"
        >
          <Compass className="size-4" aria-hidden />
          {t.guide.menu}
        </button>
        <a
          href={`/${locale}/validar`}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/85 hover:bg-white/10"
        >
          <BadgeCheck className="size-4" aria-hidden />
          {t.nav.validate}
        </a>
        <LanguageSelect className="w-fit border-white/30 bg-white" />
        <p className="truncate px-1 text-xs text-white/70">{user?.email}</p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/85 hover:bg-white/10"
        >
          <LogOut className="size-4" aria-hidden />
          {t.auth.logout}
        </button>
      </div>
    </div>
  );
}

/** Folha com as quatro jornadas, aberta pelo botão "+" (PRD §6). */
export function JourneySheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useAppI18n();
  const list = useJourneys();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{t.nav.newAction}</SheetTitle>
        </SheetHeader>
        <ul className="grid gap-2 p-4 pt-0 sm:grid-cols-2">
          {list.map(({ key, icon: Icon, to }) => (
            <li key={key}>
              <Link
                to={to}
                onClick={() => onOpenChange(false)}
                className="flex items-start gap-3 rounded-xl border p-4 hover:border-brand hover:bg-brand-soft"
              >
                <Icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                <div>
                  <p className="font-semibold">{t.actions[key]}</p>
                  <p className="text-sm text-muted-foreground">{t.actions[`${key}Text`]}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

/** Barra inferior do celular: Início, Documentos, +, Modelos, Mais (PRD §6). */
function MobileBar({ onMore, onPlus }: { onMore: () => void; onPlus: () => void }) {
  const { t } = useAppI18n();
  const { mode } = useFeatures();
  const templates = mode("templates") === "available";
  const item = "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium";
  return (
    <nav
      aria-label="MDSign"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <Link to="/app" activeOptions={{ exact: true }} className={item}>
        <Home className="size-5" aria-hidden />
        {t.nav.home}
      </Link>
      <Link to="/app/documents" className={item}>
        <Files className="size-5" aria-hidden />
        {t.nav.documents}
      </Link>
      <button type="button" onClick={onPlus} className={item} aria-label={t.nav.newAction}>
        <span className="-mt-6 flex size-12 items-center justify-center rounded-full bg-brand text-white shadow-lg">
          <Plus className="size-6" aria-hidden />
        </span>
      </button>
      {templates ? (
        <Link to="/app/templates" className={item}>
          <LayoutTemplate className="size-5" aria-hidden />
          {t.nav.templates}
        </Link>
      ) : (
        <Link to="/app/plan" className={item}>
          <Gem className="size-5" aria-hidden />
          {t.nav.plan}
        </Link>
      )}
      <button type="button" onClick={onMore} className={item}>
        <Menu className="size-5" aria-hidden />
        {t.nav.more}
      </button>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <FeaturePreviewProvider>
      <Shell>{children}</Shell>
      <FeaturePreviewDialog />
    </FeaturePreviewProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  return (
    <div className="min-h-svh bg-[#f6f5f9] lg:pl-64">
      <SkipLink />
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block">
        <SidebarContent />
      </aside>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>MDSign</SheetTitle>
          </SheetHeader>
          <SidebarContent onNavigate={() => setMoreOpen(false)} />
        </SheetContent>
      </Sheet>
      <JourneySheet open={plusOpen} onOpenChange={setPlusOpen} />
      <main id="conteudo" className="mx-auto max-w-6xl px-4 pt-6 pb-24 sm:px-6 lg:px-8 lg:pb-10">
        <GlobalSearch />
        <ClosedBanner />
        <ShellCedroBanner />
        {children}
      </main>
      <MobileBar onMore={() => setMoreOpen(true)} onPlus={() => setPlusOpen(true)} />
      <OnboardingHost />
    </div>
  );
}

/**
 * Abas entre telas irmãs que dividem um item do menu (Modelos | Links públicos;
 * Envios | Processos salvos). Cada aba é uma rota própria.
 */
export function SectionTabs({ tabs }: { tabs: { to: string; label: string }[] }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="mb-5 flex gap-1 border-b" aria-label={tabs.map((x) => x.label).join(" / ")}>
      {tabs.map((tab) => {
        const active = pathname === tab.to || pathname === `${tab.to}/`;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              active
                ? "border-brand text-brand"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div data-tour="page-actions">{actions}</div>}
    </div>
  );
}

/** Faixa do plano grátis (falta 1 documento ou acabaram), em todas as telas do app. */
function ShellCedroBanner() {
  const usage = useOrgUsage();
  return <CedroBanner usage={usage} />;
}

/** Super Admin: quantos alertas da plataforma estão abertos (só aparece se houver). */
function AdminAlertsBadge() {
  const { t } = useAppI18n();
  const [n, setN] = useState(0);
  useEffect(() => {
    void supabase
      .rpc("admin_alerts")
      .then(({ data }) =>
        setN(
          ((data as { resolved_at: string | null }[] | null) ?? []).filter((a) => !a.resolved_at)
            .length,
        ),
      );
  }, []);
  if (!n) return null;
  return (
    <span
      className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white"
      aria-label={`${n} ${t.admin.alerts.menu}`}
    >
      {n}
    </span>
  );
}
