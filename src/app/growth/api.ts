// Super Admin → Growth & Aquisição: chamadas às funções do banco (todas exigem Super Admin com
// MFA no servidor), tipos e utilidades (URL rastreável, identificadores, CSV).

import { siteConfig } from "@/config/site";
import { acquisition, CAMPAIGN_SLUGS, DEFAULT_VARIANT } from "@/content/acquisition";
import { supabase } from "@/lib/supabase";

export type GrowthSection =
  "overview" | "campaigns" | "links" | "leads" | "funnel" | "opportunities" | "plans" | "settings";

export type CampaignStatus = "draft" | "active" | "paused" | "ended";

export type Campaign = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  channel: string | null;
  medium: string | null;
  landing_path: string | null;
  starts_on: string | null;
  ends_on: string | null;
  owner_name: string | null;
  objective: string | null;
  status: CampaignStatus;
  budget_cents: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  links: number;
  visits: number;
  signups_first: number;
  signups_last: number;
  paid_last: number;
  created_by_name: string | null;
};

export type TrackedLink = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  campaign_slug: string;
  label: string | null;
  landing_path: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string | null;
  utm_term: string | null;
  active: boolean;
  created_at: string;
  visits: number;
};

export type Filters = {
  from: string;
  to: string;
  source?: string | undefined;
  campaign?: string | undefined;
  landing?: string | undefined;
  plan?: string | undefined;
  stage?: string | undefined;
  model: "first" | "last";
  internal: boolean;
};

export type Breakdown = {
  key: string | null;
  name?: string | null;
  visits?: number;
  signups: number;
  activated?: number;
  paid?: number;
};

export type Overview = {
  period: { from: string; to: string; model: string; internal: boolean };
  kpis: Record<string, number | string | null>;
  daily: { day: string; visits: number; signups: number; paid: number }[];
  by_campaign: Breakdown[];
  by_channel: Breakdown[];
  by_landing: Breakdown[];
  stages: Record<string, number>;
  filters: { sources: string[]; campaigns: string[]; landings: string[]; plans: string[] };
};

export type LeadRow = {
  row_type: "user" | "form";
  id: string;
  name: string | null;
  email: string | null;
  organization: string | null;
  created_at: string;
  source: string | null;
  campaign: string | null;
  landing: string | null;
  plan_id: string | null;
  stage: string | null;
  docs_used: number | null;
  interest: string | null;
  marketing: boolean | null;
  kind: "form" | "registered" | "activated" | "paid";
  also_form: boolean;
  org_id: string | null;
};

export type Funnel = {
  period: { from: string; to: string; model: string; internal: boolean };
  web: { visitors: number; cta: number; signup_started: number; signup_completed: number };
  people: {
    signup_completed: number;
    organization: number;
    first_document: number;
    recurring: number;
    upgrade_interest: number;
    paid: number;
    checkout_clicks: number;
  };
  weekly: { week: string; signups: number; first_document: number; paid: number }[];
  by_campaign: (Record<string, number> & { key: string | null })[];
  by_channel: (Record<string, number> & { key: string | null })[];
};

export type Opportunity = {
  id: string;
  name: string;
  created_at: string;
  user_id: string;
  stage: string;
  plan_id: string | null;
  docs_used: number;
  first_source: string | null;
  first_campaign: string | null;
  last_source: string | null;
  last_campaign: string | null;
  concluded: number;
  free_used: number;
  signals: string[];
  qualification: Record<string, unknown> | null;
  last_activity: string | null;
  owner_id: string | null;
  owner_name: string | null;
  notes: number;
};

export type GrowthSettings = {
  channels: string[];
  mediums: string[];
  naming_hint: string;
  attribution_days: number;
  goals: { visit_to_signup?: number; signup_to_activation?: number; activation_to_paid?: number };
  internal_email_domains: string[];
  exclude_org_ids: string[];
};

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

/** O período vai como [início do dia "de", início do dia seguinte a "até"). */
export function periodArgs(f: Filters) {
  const end = new Date(`${f.to}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return {
    from: new Date(`${f.from}T00:00:00`).toISOString(),
    to: end.toISOString(),
    source: f.source || null,
    campaign: f.campaign || null,
    landing: f.landing || null,
    plan: f.plan || null,
    stage: f.stage || null,
    model: f.model,
    internal: f.internal,
  };
}

export const growthApi = {
  overview: (f: Filters) => rpc<Overview>("admin_growth_overview", { f: periodArgs(f) }),
  funnel: (f: Filters) => rpc<Funnel>("admin_growth_funnel_v2", { f: periodArgs(f) }),
  leads: (
    f: Filters,
    extra: { q?: string; kind?: string; page: number; size: number; sort: string },
  ) =>
    rpc<{ total: number; rows: LeadRow[] }>("admin_growth_leads", {
      f: { ...periodArgs(f), ...extra, q: extra.q || null, kind: extra.kind || null },
    }),
  timeline: (usr: string | null, org: string | null) =>
    rpc<{
      acquisition: Record<string, string | null> | null;
      events: { event: string; at: string; data: Record<string, unknown> }[];
      consents: { kind: string; granted: boolean; version: string | null; at: string }[];
      qualification: Record<string, unknown> | null;
    }>("admin_growth_timeline", { usr, org }),
  campaigns: (q?: string, st?: string) =>
    rpc<Campaign[]>("admin_growth_campaigns", { q: q || null, st: st || null }),
  saveCampaign: (c: Record<string, unknown>) => rpc<string>("admin_growth_campaign_save", { c }),
  setCampaignStatus: (cid: string, st: CampaignStatus) =>
    rpc<void>("admin_growth_campaign_status", { cid, st }),
  links: (cid?: string) => rpc<TrackedLink[]>("admin_growth_links", { cid: cid ?? null }),
  saveLink: (l: Record<string, unknown>) => rpc<string>("admin_growth_link_save", { l }),
  setLinkActive: (lid: string, on: boolean) =>
    rpc<void>("admin_growth_link_active", { lid, on_off: on }),
  opportunities: (f: {
    stage?: string;
    owner?: string;
    internal: boolean;
    page: number;
    size: number;
  }) =>
    rpc<{ total: number; counts: Record<string, number>; rows: Opportunity[] }>(
      "admin_growth_opportunities",
      { f: { ...f, stage: f.stage || null, owner: f.owner || null } },
    ),
  admins: () => rpc<{ id: string; name: string }[]>("admin_growth_admins"),
  setOwner: (org: string, owner: string | null) =>
    rpc<void>("admin_growth_set_owner", { org, owner }),
  notes: (org: string) =>
    rpc<{ id: number; body: string; at: string; author: string }[]>("admin_growth_notes", { org }),
  addNote: (org: string, body: string) => rpc<void>("admin_growth_note_add", { org, body }),
  settings: () =>
    rpc<{ settings: GrowthSettings; stages: Record<string, number> }>("admin_growth_settings"),
  saveSettings: (cfg: GrowthSettings) => rpc<void>("admin_growth_save_settings", { cfg }),
  saveStages: (cfg: Record<string, number>) =>
    rpc<void>("admin_set_policy", { policy: "growth_stages", is_active: true, new_config: cfg }),
  logExport: (what: string, n: number) => rpc<void>("admin_growth_log_export", { what, n }),
};

/** Identificador padronizado: minúsculas, sem acento, palavras separadas por "_". */
export function slugify(text: string, max = 80) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max)
    .replace(/_+$/g, "");
}

export const UTM_VALUE = /^[a-z0-9][a-z0-9_.-]{0,99}$/;
export const CAMPAIGN_SLUG = /^[a-z0-9][a-z0-9_-]{1,78}[a-z0-9]$/;

/** Destinos válidos: as landings existentes do site, nos 3 idiomas. */
export function landingOptions() {
  const out: { path: string; label: string }[] = [];
  for (const lang of ["pt", "en", "es"] as const) {
    out.push({
      path: `/${lang}/assinar-gratis`,
      label: `${lang.toUpperCase()} · ${acquisition[lang].variants[DEFAULT_VARIANT]?.title ?? "assinar-gratis"}`,
    });
    for (const slug of CAMPAIGN_SLUGS)
      out.push({
        path: `/${lang}/lp/${slug}`,
        label: `${lang.toUpperCase()} · ${acquisition[lang].variants[slug]?.title ?? slug}`,
      });
  }
  return out;
}

/** URL comercial no domínio configurado do ambiente (VITE_SITE_URL), sem encurtador. */
export function buildTrackedUrl(l: {
  landing_path: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content?: string | null;
  utm_term?: string | null;
}) {
  const url = new URL(l.landing_path, `${siteConfig.siteUrl}/`);
  url.searchParams.set("utm_source", l.utm_source);
  url.searchParams.set("utm_medium", l.utm_medium);
  url.searchParams.set("utm_campaign", l.utm_campaign);
  if (l.utm_content) url.searchParams.set("utm_content", l.utm_content);
  if (l.utm_term) url.searchParams.set("utm_term", l.utm_term);
  return url.toString();
}

/** CSV com separador ";" (abre direto no Excel em pt-BR) e proteção contra fórmulas. */
export function downloadCsv(
  filename: string,
  header: string[],
  rows: (string | number | null | undefined)[][],
) {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
  // BOM: o Excel abre o UTF-8 com acentos certos.
  const blob = new Blob([String.fromCharCode(0xfeff), text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const pct = (a: number, b: number) =>
  b > 0 ? `${(Math.round((a / b) * 1000) / 10).toLocaleString("pt-BR")}%` : "—";

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
