import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { type Permission, useOrg } from "./org";

// Onboarding guiado: catálogo de passos ("Primeiros passos") e o tour de cada um.
// Os passos se marcam pelo uso real (RPC onboarding_progress); alguns passos de tela são
// marcados pelo app (onboarding_update 'mark'). Textos em t.guide.

export type GuideStepId =
  | "profile"
  | "self_sign"
  | "send"
  | "track_status"
  | "remind"
  | "contacts"
  | "template"
  | "form"
  | "invite"
  | "group"
  | "sign_pending"
  | "download"
  | "billing"
  | "reports";

export type GuideGroup = "basics" | "productivity" | "team";
type Track = "full" | "invited";

/** Um passo do tour: em qual tela, qual elemento destacar (data-tour) e o índice do texto. */
export type TourStop = { to: string; search?: Record<string, string>; target?: string };

export type GuideStep = {
  id: GuideStepId;
  group: GuideGroup;
  tracks: Track[];
  /** Permissão necessária na organização (sem ela o passo não aparece). */
  perm?: Permission;
  /** Só em planos com mais de 1 usuário. */
  team?: boolean;
  /** Só aparece se houver algo pendente para a pessoa (ou se já foi feito). */
  onlyIfPending?: boolean;
  /** Ação principal ("Fazer agora"). */
  to: string;
  search?: Record<string, string>;
  tour: TourStop[];
};

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "profile",
    group: "basics",
    tracks: ["full", "invited"],
    to: "/app/settings",
    tour: [{ to: "/app/settings", target: "settings-profile" }],
  },
  {
    id: "self_sign",
    group: "basics",
    tracks: ["full"],
    perm: "documents.create",
    to: "/app/sign",
    tour: [
      { to: "/app", target: "journey-selfSign" },
      { to: "/app/sign", target: "pdf-drop" },
      { to: "/app/sign" },
    ],
  },
  {
    id: "sign_pending",
    group: "basics",
    tracks: ["invited"],
    onlyIfPending: true,
    to: "/app/documents",
    search: { tab: "forMe" },
    tour: [{ to: "/app/documents", search: { tab: "forMe" }, target: "documents-list" }],
  },
  {
    id: "send",
    group: "basics",
    tracks: ["full", "invited"],
    perm: "documents.create",
    to: "/app/send",
    tour: [
      { to: "/app", target: "journey-send" },
      { to: "/app/send", target: "pdf-drop" },
      { to: "/app/send" },
    ],
  },
  {
    id: "track_status",
    group: "basics",
    tracks: ["full", "invited"],
    perm: "documents.view",
    to: "/app/documents",
    tour: [{ to: "/app/documents", target: "documents-list" }, { to: "/app/documents" }],
  },
  {
    id: "remind",
    group: "basics",
    tracks: ["full"],
    perm: "documents.create",
    to: "/app/documents",
    search: { tab: "waiting" },
    tour: [{ to: "/app/documents", search: { tab: "waiting" }, target: "documents-list" }],
  },
  {
    id: "download",
    group: "basics",
    tracks: ["invited"],
    perm: "documents.view",
    to: "/app/documents",
    search: { tab: "concluded" },
    tour: [{ to: "/app/documents", search: { tab: "concluded" }, target: "documents-list" }],
  },
  {
    id: "contacts",
    group: "productivity",
    tracks: ["full", "invited"],
    perm: "contacts.manage",
    to: "/app/contacts",
    tour: [{ to: "/app/contacts", target: "page-actions" }],
  },
  {
    id: "template",
    group: "productivity",
    tracks: ["full"],
    perm: "templates.manage",
    to: "/app/templates",
    tour: [{ to: "/app/templates", target: "page-actions" }, { to: "/app/templates" }],
  },
  {
    id: "form",
    group: "productivity",
    tracks: ["full"],
    perm: "templates.manage",
    to: "/app/forms",
    tour: [{ to: "/app/forms", target: "page-actions" }],
  },
  {
    id: "billing",
    group: "productivity",
    tracks: ["invited"],
    perm: "billing.view",
    to: "/app/organization",
    search: { tab: "plan" },
    tour: [{ to: "/app/organization", search: { tab: "plan" }, target: "plan-panel" }],
  },
  {
    id: "reports",
    group: "productivity",
    tracks: ["invited"],
    perm: "reports.export",
    to: "/app/reports",
    tour: [{ to: "/app/reports", target: "reports-filters" }],
  },
  {
    id: "invite",
    group: "team",
    tracks: ["full"],
    perm: "members.manage",
    team: true,
    to: "/app/organization",
    tour: [{ to: "/app/organization", target: "members-invite" }],
  },
  {
    id: "group",
    group: "team",
    tracks: ["full"],
    perm: "members.manage",
    team: true,
    to: "/app/organization",
    search: { tab: "groups" },
    tour: [{ to: "/app/organization", search: { tab: "groups" }, target: "groups-new" }],
  },
];

export type GuideProgress = {
  track: Track;
  dismissed: boolean;
  completed: boolean;
  team: boolean;
  steps: Record<GuideStepId | "has_pending", boolean>;
};

/** Passos que valem para esta pessoa (trilha, permissões, plano e pendências). */
export function visibleSteps(p: GuideProgress, can: (perm: Permission) => boolean) {
  return GUIDE_STEPS.filter(
    (s) =>
      s.tracks.includes(p.track) &&
      (!s.perm || can(s.perm)) &&
      (!s.team || p.team) &&
      (!s.onlyIfPending || p.steps.has_pending || p.steps[s.id]),
  );
}

const GUIDE_EVENT = "mdsign:guide-changed";
const OPEN_EVENT = "mdsign:guide-open";

/** Recarrega o progresso em todas as telas (passo feito, dispensado, reaberto). */
export function notifyGuideChanged() {
  window.dispatchEvent(new Event(GUIDE_EVENT));
}

/** Abre o checklist (menu Ajuda → Primeiros passos). */
export function openGuide() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}
export const GUIDE_OPEN_EVENT = OPEN_EVENT;

export function useGuide() {
  const { current, can } = useOrg();
  const orgId = current?.id;
  const [progress, setProgress] = useState<GuideProgress | null>(null);

  const load = useCallback(() => {
    if (!orgId) return;
    void supabase
      .rpc("onboarding_progress", { org: orgId })
      .then(({ data }) => setProgress((data as GuideProgress | null) ?? null));
  }, [orgId]);

  useEffect(() => {
    load();
    window.addEventListener(GUIDE_EVENT, load);
    // Documento criado (consumo mudou) também pode concluir passos.
    window.addEventListener("mdsign:usage-changed", load);
    return () => {
      window.removeEventListener(GUIDE_EVENT, load);
      window.removeEventListener("mdsign:usage-changed", load);
    };
  }, [load]);

  const update = useCallback(
    async (op: "mark" | "dismiss" | "reopen" | "complete", step?: string) => {
      if (!orgId) return;
      await supabase.rpc("onboarding_update", { org: orgId, op, step: step ?? null });
      notifyGuideChanged();
    },
    [orgId],
  );

  const steps = progress ? visibleSteps(progress, can) : [];
  const done = steps.filter((s) => progress?.steps[s.id]).length;
  return { orgId, progress, steps, done, total: steps.length, update, reload: load };
}

/** Marca um passo de tela (ex.: abriu a página de um documento), sem esperar resposta. */
export function markGuideStep(
  orgId: string | undefined,
  step: "viewed_document" | "downloaded" | "viewed_billing" | "viewed_reports",
) {
  if (!orgId) return;
  void supabase
    .rpc("onboarding_update", { org: orgId, op: "mark", step })
    .then(() => notifyGuideChanged());
}
