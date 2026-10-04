import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  ChevronsUpDown,
  FilePen,
  FileStack,
  Files,
  FormInput,
  Home,
  LayoutTemplate,
  LogOut,
  Menu,
  Plug,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { logoIcon } from "@/components/landing/logo";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "../auth";
import { useAppI18n } from "../i18n";
import { useOrg } from "../org";
import { LanguageSelect, SkipLink } from "./language-select";

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
  | "settings";

type NavItem = { key: NavKey; icon: LucideIcon } & (
  | { to: "/app" | "/app/documents" | "/app/organization" | "/app/settings"; section?: never }
  | { section: Exclude<NavKey, "home" | "documents" | "organization" | "settings">; to?: never }
);

/** Navegação desktop do PRD §6, na ordem definida. Itens com `section` ainda não existem. */
const navItems: NavItem[] = [
  { key: "home", to: "/app", icon: Home },
  { key: "documents", to: "/app/documents", icon: Files },
  { key: "templates", section: "templates", icon: LayoutTemplate },
  { key: "processes", section: "processes", icon: Workflow },
  { key: "bulk", section: "bulk", icon: FileStack },
  { key: "forms", section: "forms", icon: FormInput },
  { key: "contacts", section: "contacts", icon: Users },
  { key: "organization", to: "/app/organization", icon: Building2 },
  { key: "integrations", section: "integrations", icon: Plug },
  { key: "reports", section: "reports", icon: BarChart3 },
  { key: "settings", to: "/app/settings", icon: Settings },
];

/** As quatro portas principais (PRD §1 e §6). `to` = jornada já disponível. */
export const journeys = [
  { key: "selfSign", icon: FilePen, to: "/app/sign" },
  { key: "send", icon: Send, to: null },
  { key: "template", icon: LayoutTemplate, to: null },
  { key: "bulk", icon: FileStack, to: null },
] as const;

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: (() => void) | undefined }) {
  const { t } = useAppI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const path = item.section ? `/app/${item.section}` : item.to;
  const active =
    path === "/app" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(path);
  const Icon = item.icon;
  const className = cn(
    "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
    active ? "bg-white/15 text-white" : "text-white/85 hover:bg-white/10 hover:text-white",
  );
  const content = (
    <>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">{t.nav[item.key]}</span>
      {item.section && (
        <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
          {t.common.soon}
        </span>
      )}
    </>
  );
  return item.section ? (
    <Link
      to="/app/$section"
      params={{ section: item.section }}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {content}
    </Link>
  ) : (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {content}
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
  const { t } = useAppI18n();
  const { signOut, user } = useAuth();
  const { isPlatformAdmin } = useOrg();
  return (
    <div className="flex h-full flex-col gap-4 bg-brand-strong p-3 text-white">
      <Link to="/app" onClick={onNavigate} className="flex items-center gap-2 px-2 pt-1">
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
      <nav aria-label="MDSign" className="flex-1 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink key={item.key} item={item} onNavigate={onNavigate} />
        ))}
        {isPlatformAdmin && (
          <Link
            to="/admin"
            onClick={onNavigate}
            className="mt-2 flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/85 hover:bg-white/10"
          >
            <ShieldCheck className="size-4" aria-hidden />
            {t.nav.admin}
          </Link>
        )}
      </nav>
      <div className="space-y-3 border-t border-white/15 pt-3">
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
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{t.nav.newAction}</SheetTitle>
        </SheetHeader>
        <ul className="grid gap-2 p-4 pt-0 sm:grid-cols-2">
          {journeys.map(({ key, icon: Icon, to }) => {
            const body = (
              <>
                <Icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                <div>
                  <p className="font-semibold">
                    {t.actions[key]}
                    {!to && (
                      <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand uppercase">
                        {t.common.soon}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">{t.actions[`${key}Text`]}</p>
                </div>
              </>
            );
            return (
              <li key={key}>
                {to ? (
                  <Link
                    to={to}
                    onClick={() => onOpenChange(false)}
                    className="flex items-start gap-3 rounded-xl border p-4 hover:border-brand hover:bg-brand-soft"
                  >
                    {body}
                  </Link>
                ) : (
                  <div
                    aria-disabled
                    className="flex items-start gap-3 rounded-xl border p-4 opacity-70"
                  >
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

/** Barra inferior do celular: Início, Documentos, +, Modelos, Mais (PRD §6). */
function MobileBar({ onMore, onPlus }: { onMore: () => void; onPlus: () => void }) {
  const { t } = useAppI18n();
  const item = "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium";
  return (
    <nav
      aria-label="MDSign"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <Link to="/app" className={item}>
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
      <Link to="/app/$section" params={{ section: "templates" }} className={item}>
        <LayoutTemplate className="size-5" aria-hidden />
        {t.nav.templates}
      </Link>
      <button type="button" onClick={onMore} className={item}>
        <Menu className="size-5" aria-hidden />
        {t.nav.more}
      </button>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
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
        {children}
      </main>
      <MobileBar onMore={() => setMoreOpen(true)} onPlus={() => setPlusOpen(true)} />
    </div>
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
      {actions}
    </div>
  );
}
