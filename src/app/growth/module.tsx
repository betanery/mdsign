// Super Admin → Growth & Aquisição. Menu lateral com as 7 seções (no celular, um seletor) e
// filtros compartilhados entre Visão geral, Leads e Funil.

import { useCallback, useState } from "react";
import {
  BarChart3,
  Filter,
  Gem,
  Link2,
  Megaphone,
  Settings2,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { selectClass } from "../ui";
import { isoDay, type Filters, type GrowthSection, type Overview } from "./api";
import { GrowthCampaigns, GrowthLinks } from "./campaigns";
import { GrowthLeads } from "./leads";
import { GrowthOpportunities } from "./opportunities";
import { GrowthPlans } from "./plans";
import { GrowthFunnel, GrowthOverview } from "./overview";
import { GrowthSettingsPanel } from "./settings";
import { useGrowthTexts } from "./texts";
import { FiltersBar } from "./ui";

const SECTIONS: { key: GrowthSection; icon: LucideIcon }[] = [
  { key: "overview", icon: BarChart3 },
  { key: "campaigns", icon: Megaphone },
  { key: "links", icon: Link2 },
  { key: "leads", icon: Users },
  { key: "funnel", icon: Filter },
  { key: "opportunities", icon: Target },
  { key: "plans", icon: Gem },
  { key: "settings", icon: Settings2 },
];

export function GrowthModule() {
  const g = useGrowthTexts();
  const [section, setSection] = useState<GrowthSection>("overview");
  const [campaignId, setCampaignId] = useState("");
  const [filters, setFilters] = useState<Filters>(() => ({
    from: isoDay(new Date(Date.now() - 29 * 86400000)),
    to: isoDay(new Date()),
    model: "first",
    internal: false,
  }));
  const [options, setOptions] = useState<Overview["filters"] | undefined>();
  const onOptions = useCallback((o: Overview["filters"]) => setOptions(o), []);
  const withFilters =
    section === "overview" || section === "leads" || section === "funnel" || section === "plans";

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="font-display text-xl font-semibold">{g.title}</h2>
        <p className="text-sm text-muted-foreground">{g.subtitle}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label={g.title}>
          <label className="sr-only" htmlFor="growth-section">
            {g.title}
          </label>
          <select
            id="growth-section"
            className={cn(selectClass, "w-full lg:hidden")}
            value={section}
            onChange={(e) => setSection(e.target.value as GrowthSection)}
          >
            {SECTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {g.sections[s.key]}
              </option>
            ))}
          </select>
          <ul className="hidden gap-1 lg:grid">
            {SECTIONS.map(({ key, icon: Icon }) => (
              <li key={key}>
                <button
                  type="button"
                  aria-current={section === key ? "page" : undefined}
                  onClick={() => setSection(key)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium",
                    section === key ? "bg-brand text-white" : "hover:bg-brand-soft",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {g.sections[key]}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="grid min-w-0 content-start gap-4">
          {withFilters && (
            <FiltersBar
              value={filters}
              onChange={setFilters}
              options={options}
              show={
                section === "funnel" || section === "plans"
                  ? ["source", "campaign", "plan"]
                  : section === "leads"
                    ? ["source", "campaign", "plan", "stage"]
                    : ["source", "campaign", "landing", "plan", "stage"]
              }
            />
          )}
          {section === "overview" && <GrowthOverview filters={filters} onOptions={onOptions} />}
          {section === "campaigns" && (
            <GrowthCampaigns
              onLinks={(id) => {
                setCampaignId(id);
                setSection("links");
              }}
            />
          )}
          {section === "links" && (
            <GrowthLinks campaignId={campaignId} onCampaign={setCampaignId} />
          )}
          {section === "leads" && <GrowthLeads filters={filters} />}
          {section === "funnel" && <GrowthFunnel filters={filters} />}
          {section === "opportunities" && <GrowthOpportunities />}
          {section === "plans" && <GrowthPlans filters={filters} />}
          {section === "settings" && <GrowthSettingsPanel />}
        </div>
      </div>
    </div>
  );
}
