// Super Admin → Planos & Funcionalidades. Oito seções (no celular, um seletor) sobre a matriz
// comercial versionada. Edição só no rascunho; publicação com confirmação e validação no servidor.

import { useEffect, useState } from "react";
import {
  BarChart3,
  Coins,
  Compass,
  Grid3x3,
  History,
  MonitorSmartphone,
  Settings2,
  ToggleRight,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { selectClass } from "../ui";
import { useCatalog } from "./api";
import { Loading } from "./shared";
import { PlansAudit, PlansConsumption, PlansOverview, PlansSettings } from "./reports";
import { PlansFeatures } from "./features-tab";
import { PlansMatrix } from "./matrix";
import { PlansNavigation, PlansSimulator } from "./simulator";
import { usePlansAdminTexts } from "./texts";

type Section =
  | "overview"
  | "matrix"
  | "features"
  | "navigation"
  | "simulator"
  | "consumption"
  | "settings"
  | "audit";

const SECTIONS: { key: Section; icon: LucideIcon }[] = [
  { key: "overview", icon: BarChart3 },
  { key: "matrix", icon: Grid3x3 },
  { key: "features", icon: ToggleRight },
  { key: "navigation", icon: Compass },
  { key: "simulator", icon: MonitorSmartphone },
  { key: "consumption", icon: Coins },
  { key: "settings", icon: Settings2 },
  { key: "audit", icon: History },
];

export function PlansAdminModule() {
  const P = usePlansAdminTexts();
  const [section, setSection] = useState<Section>("overview");
  const { catalog, error, reload } = useCatalog();
  const [versionId, setVersionId] = useState("");

  useEffect(() => {
    if (!catalog) return;
    if (catalog.versions.some((v) => v.id === versionId)) return;
    const draft = catalog.versions.find((v) => v.status === "draft");
    setVersionId(draft?.id ?? catalog.current ?? catalog.versions.at(-1)?.id ?? "");
  }, [catalog, versionId]);

  const needsCatalog = section !== "overview" && section !== "consumption" && section !== "audit";
  const version = catalog?.versions.find((v) => v.id === versionId) ?? null;

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="font-display text-xl font-semibold">{P.title}</h2>
        <p className="text-sm text-muted-foreground">{P.subtitle}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label={P.title}>
          <label className="sr-only" htmlFor="plans-section">
            {P.title}
          </label>
          <select
            id="plans-section"
            className={cn(selectClass, "w-full lg:hidden")}
            value={section}
            onChange={(e) => setSection(e.target.value as Section)}
          >
            {SECTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {P.sections[s.key]}
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
                  {P.sections[key]}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="grid min-w-0 content-start gap-4 [&>*]:min-w-0">
          {needsCatalog && error && <p className="text-sm text-destructive">{P.error}</p>}
          {needsCatalog && !error && (!catalog || !version) && <Loading />}
          {section === "overview" && <PlansOverview />}
          {catalog && version && (
            <>
              {section === "matrix" && (
                <PlansMatrix
                  catalog={catalog}
                  version={version}
                  onVersion={setVersionId}
                  reload={reload}
                />
              )}
              {section === "features" && (
                <PlansFeatures
                  catalog={catalog}
                  version={version}
                  onVersion={setVersionId}
                  reload={reload}
                />
              )}
              {section === "navigation" && (
                <PlansNavigation catalog={catalog} version={version} onVersion={setVersionId} />
              )}
              {section === "simulator" && (
                <PlansSimulator catalog={catalog} version={version} onVersion={setVersionId} />
              )}
              {section === "settings" && <PlansSettings catalog={catalog} reload={reload} />}
            </>
          )}
          {section === "consumption" && <PlansConsumption />}
          {section === "audit" && <PlansAudit />}
        </div>
      </div>
    </div>
  );
}
