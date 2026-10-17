// Navegação por plano e simulador: menu calculado com a mesma regra do app (buildNav), só a
// partir da configuração. Não entra em nenhuma organização nem usa privilégios de cliente.

import { useState } from "react";
import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n";
import { appMessages, useAppI18n } from "../i18n";
import { featureTexts, type FeatureCode } from "../features";
import { navItems, type NavItem } from "../components/app-shell";
import { selectClass } from "../ui";
import { Panel } from "../growth/ui";
import type { OrgRole } from "../org";
import { docsOf, hiddenNavItems, ROLES, simulateNav, type Catalog, type CatalogPlan } from "./api";
import type { VersionProps } from "./matrix";
import { VersionSelect } from "./shared";
import { usePlansAdminTexts } from "./texts";

function RoleSelect({
  value,
  onChange,
  id,
}: {
  value: OrgRole;
  onChange: (r: OrgRole) => void;
  id: string;
}) {
  const P = usePlansAdminTexts();
  const { t } = useAppI18n();
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm" htmlFor={id}>
      <span className="font-medium">{P.navigation.role}</span>
      <select
        id={id}
        className={selectClass}
        value={value}
        onChange={(e) => onChange(e.target.value as OrgRole)}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {t.roles[r]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Menu lateral simulado, agrupado como no app. */
function MenuPreview({
  catalog,
  plan,
  role,
  locale,
}: {
  catalog: Catalog;
  plan: CatalogPlan;
  role: OrgRole;
  locale: Locale;
}) {
  const t = appMessages[locale];
  const { nav } = simulateNav(catalog, plan, role);
  const groups = [...new Set(nav.map((n) => n.item.group))];
  return (
    <nav
      aria-label={`${t.nav.home} · ${plan.name}`}
      className="grid gap-3 rounded-xl border bg-white p-3"
    >
      {groups.map((g) => (
        <div key={g} className="grid gap-1">
          <span className="px-2 text-xs font-semibold uppercase text-muted-foreground">
            {t.nav.groups[g]}
          </span>
          {nav
            .filter((n) => n.item.group === g)
            .map(({ item, locked }) => (
              <NavRow
                key={item.key}
                item={item}
                locked={locked}
                label={t.nav[item.key]}
                lockedLabel={t.nav.locked}
              />
            ))}
        </div>
      ))}
    </nav>
  );
}

function NavRow({
  item,
  locked,
  label,
  lockedLabel,
}: {
  item: NavItem;
  locked: boolean;
  label: string;
  lockedLabel: string;
}) {
  const Icon = item.icon;
  return (
    <span
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
        locked ? "text-muted-foreground" : "font-medium",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {locked && (
        <>
          <Lock className="size-3.5 text-brand" aria-hidden />
          <span className="sr-only">{lockedLabel}</span>
        </>
      )}
    </span>
  );
}

export function PlansNavigation({ catalog, version, onVersion }: VersionProps) {
  const P = usePlansAdminTexts();
  const N = P.navigation;
  const { t } = useAppI18n();
  const [role, setRole] = useState<OrgRole>("owner");
  const plans = version.plans ?? [];
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <VersionSelect catalog={catalog} value={version.id} onChange={onVersion} />
        <RoleSelect id="nav-role" value={role} onChange={setRole} />
      </div>
      <Panel title={P.sections.navigation} hint={N.hint}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => {
            const { nav } = simulateNav(catalog, p, role);
            const hidden = hiddenNavItems(navItems, nav);
            return (
              <section key={p.plan_id} className="grid content-start gap-2 rounded-xl border p-3">
                <h4 className="font-display font-semibold">{p.name}</h4>
                <p className="text-xs font-semibold uppercase text-muted-foreground">{N.visible}</p>
                <ul className="grid gap-1 text-sm">
                  {nav.map(({ item, locked }) => (
                    <li key={item.key} className="flex items-center gap-2">
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      <span className={cn(locked && "text-muted-foreground")}>
                        {t.nav[item.key]}
                      </span>
                      {locked && (
                        <span className="ml-auto inline-flex items-center gap-1 text-xs text-brand">
                          <Lock className="size-3" aria-hidden />
                          {N.locked}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {hidden.length > 0 && (
                  <>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      {N.hidden}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {hidden.map((i) => t.nav[i.key]).join(", ")}
                    </p>
                  </>
                )}
              </section>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

export function PlansSimulator({ catalog, version, onVersion }: VersionProps) {
  const P = usePlansAdminTexts();
  const S = P.simulator;
  const { locale: appLocale } = useAppI18n();
  const plans = version.plans ?? [];
  const [planId, setPlanId] = useState(plans[0]?.plan_id ?? "cedro");
  const [compareId, setCompareId] = useState("");
  const [role, setRole] = useState<OrgRole>("owner");
  const [locale, setLocale] = useState<Locale>(appLocale);
  const plan = plans.find((p) => p.plan_id === planId) ?? plans[0];
  const compare = plans.find((p) => p.plan_id === compareId);
  if (!plan) return null;

  return (
    <div className="grid gap-4">
      <Panel title={P.sections.simulator} hint={S.hint}>
        <div className="flex flex-wrap items-center gap-4">
          <VersionSelect catalog={catalog} value={version.id} onChange={onVersion} />
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">{S.plan}</span>
            <select
              className={selectClass}
              value={plan.plan_id}
              onChange={(e) => setPlanId(e.target.value)}
            >
              {plans.map((p) => (
                <option key={p.plan_id} value={p.plan_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <RoleSelect id="sim-role" value={role} onChange={setRole} />
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">{S.locale}</span>
            <select
              className={selectClass}
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              <option value="pt">Português</option>
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">{S.compare}</span>
            <select
              className={selectClass}
              value={compareId}
              onChange={(e) => setCompareId(e.target.value)}
            >
              <option value="">{S.none}</option>
              {plans
                .filter((p) => p.plan_id !== plan.plan_id)
                .map((p) => (
                  <option key={p.plan_id} value={p.plan_id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </Panel>
      <div className={cn("grid gap-4", compare && "lg:grid-cols-2")}>
        {[plan, compare]
          .filter((p): p is CatalogPlan => !!p)
          .map((p) => (
            <SimulatedPlan
              key={p.plan_id}
              catalog={catalog}
              plan={p}
              role={role}
              locale={locale}
              stacked={!!compare}
            />
          ))}
      </div>
    </div>
  );
}

function SimulatedPlan({
  catalog,
  plan,
  role,
  locale,
  stacked,
}: {
  catalog: Catalog;
  plan: CatalogPlan;
  role: OrgRole;
  locale: Locale;
  stacked: boolean;
}) {
  const P = usePlansAdminTexts();
  const S = P.simulator;
  const M = P.matrix;
  const X = featureTexts[locale];
  const { modes } = simulateNav(catalog, plan, role);
  const name = (code: string) => X.features[code as FeatureCode]?.name ?? code;
  const by = (m: string) =>
    catalog.features.filter((f) => modes[f.code] === m).map((f) => name(f.code));
  const d = docsOf(plan);
  const users = plan.entitlements["users_max"];

  return (
    <Panel title={plan.name}>
      <div className={cn("grid gap-4", !stacked && "sm:grid-cols-[14rem_minmax(0,1fr)]")}>
        <div className="grid content-start gap-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">{S.menu}</p>
          <MenuPreview catalog={catalog} plan={plan} role={role} locale={locale} />
        </div>
        <div className="grid content-start gap-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">{S.limits}</p>
            <p>
              {S.docs}: {d.value ? `${d.value} · ${M.docsModes[d.mode]}` : M.docsModes[d.mode]}
            </p>
            <p>
              {S.users}: {typeof users === "number" ? users : M.contract}
            </p>
          </div>
          {(
            [
              [S.available, by("available")],
              [S.previews, by("preview")],
              [S.hiddenList, by("hidden")],
            ] as const
          ).map(([label, list]) => (
            <div key={label}>
              <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
              <p>{list.length ? list.join(", ") : "—"}</p>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
