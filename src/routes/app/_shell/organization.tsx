import { useCallback, useEffect, useState } from "react";
import { FeatureGate } from "@/app/components/feature-preview";
import { useFeaturePreview, useFeatures } from "@/app/features";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/app/auth";
import { AccountTab } from "@/app/components/account-tab";
import { markGuideStep } from "@/app/onboarding";
import { PageHeader } from "@/app/components/app-shell";
import { FormMessage } from "@/app/components/auth-layout";
import { useConfirm } from "@/app/components/confirm-dialog";
import { BillingPanel } from "@/app/components/billing-panel";
import { NotificationsTab } from "@/app/components/notification-settings";
import { DelegationsTab, GroupsTab } from "@/app/components/org-groups";
import { PlanUsage, useOrgUsage } from "@/app/components/plan-usage";
import { useAppI18n } from "@/app/i18n";
import { useOrg, type OrgRole } from "@/app/org";
import { selectClass } from "@/app/ui";
import { formatCnpj, friendlyError, isValidCnpj, onlyDigits } from "@/app/validation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { locales, localeNames, type Locale } from "@/i18n";
import { track } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";

type Search = { tab?: string | undefined; checkout?: string | undefined };

export const Route = createFileRoute("/app/_shell/organization")({
  // ?tab=plan abre "Plano e cobrança"; ?checkout= é o retorno do Checkout do Asaas.
  validateSearch: (search: Record<string, unknown>): Search => ({
    tab: typeof search["tab"] === "string" ? search["tab"] : undefined,
    checkout: typeof search["checkout"] === "string" ? search["checkout"] : undefined,
  }),
  component: OrganizationPage,
});

const roles: OrgRole[] = ["owner", "admin", "manager", "operator", "member", "viewer", "finance"];

type Member = {
  user_id: string;
  full_name: string | null;
  email: string;
  role: OrgRole;
  status: "active" | "suspended";
  unit_id: string | null;
};
type Unit = { id: string; name: string; parent_id: string | null };
type Invitation = { id: string; email: string; role: OrgRole; token: string; expires_at: string };
type AuditEntry = {
  id: number;
  action: string;
  entity: string;
  created_at: string;
  data: Record<string, unknown>;
};

function OrganizationPage() {
  const { t } = useAppI18n();
  const { current, can } = useOrg();
  const search = Route.useSearch();
  const { mode } = useFeatures();
  // Gestão avançada (unidades, grupos, delegações): aba some se oculta; em prévia mostra a oferta.
  const adv = mode("advanced_management") !== "hidden";
  if (!current) return <p>{t.notFoundOrg}</p>;
  return (
    <>
      <PageHeader title={t.organization.title} subtitle={current.name} />
      <Tabs
        defaultValue={
          search.tab &&
          ["plan", "groups", "delegations", "notifications", "account"].includes(search.tab)
            ? search.tab
            : "members"
        }
      >
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
          <TabsTrigger value="members">{t.organization.tabMembers}</TabsTrigger>
          {adv && <TabsTrigger value="units">{t.organization.tabUnits}</TabsTrigger>}
          {adv && <TabsTrigger value="groups">{t.organization.tabGroups}</TabsTrigger>}
          {adv && <TabsTrigger value="delegations">{t.organization.tabDelegations}</TabsTrigger>}
          <TabsTrigger value="notifications">{t.organization.tabNotifications}</TabsTrigger>
          {can("audit.view") && <TabsTrigger value="audit">{t.organization.tabAudit}</TabsTrigger>}
          <TabsTrigger value="profile">{t.organization.tabProfile}</TabsTrigger>
          <TabsTrigger value="plan">{t.organization.tabPlan}</TabsTrigger>
          <TabsTrigger value="account">{t.organization.tabAccount}</TabsTrigger>
        </TabsList>
        <TabsContent value="members">
          <MembersTab orgId={current.id} />
        </TabsContent>
        <TabsContent value="units">
          <FeatureGate code="advanced_management">
            <UnitsTab orgId={current.id} />
          </FeatureGate>
        </TabsContent>
        <TabsContent value="groups">
          <FeatureGate code="advanced_management">
            <GroupsTab orgId={current.id} />
          </FeatureGate>
        </TabsContent>
        <TabsContent value="delegations">
          <FeatureGate code="advanced_management">
            <DelegationsTab orgId={current.id} />
          </FeatureGate>
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsTab orgId={current.id} />
        </TabsContent>
        {can("audit.view") && (
          <TabsContent value="audit">
            <AuditTab orgId={current.id} />
          </TabsContent>
        )}
        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="plan">
          <PlanTab checkout={search.checkout} />
        </TabsContent>
        <TabsContent value="account">
          <AccountTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

function PlanTab({ checkout }: { checkout?: string | undefined }) {
  const { t } = useAppI18n();
  const { can, current } = useOrg();
  const usage = useOrgUsage();
  const guideOrg = current?.id;
  useEffect(() => markGuideStep(guideOrg, "viewed_billing"), [guideOrg]);
  // Plano e cobrança para quem vê a cobrança; os demais veem só o consumo.
  if (can("billing.view"))
    return (
      <div className="max-w-4xl">
        <BillingPanel usage={usage} checkoutState={checkout} />
      </div>
    );
  return (
    <section className="max-w-xl rounded-2xl border bg-white p-5 shadow-sm">
      {usage ? (
        <PlanUsage usage={usage} />
      ) : (
        <p className="text-muted-foreground">{t.common.loading}</p>
      )}
    </section>
  );
}

function MembersTab({ orgId }: { orgId: string }) {
  const { t, f } = useAppI18n();
  const [confirm, confirmDialog] = useConfirm();
  const { user } = useAuth();
  const { can, current } = useOrg();
  const [members, setMembers] = useState<Member[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const manage = can("members.manage");
  const preview = useFeaturePreview();
  const teamMode = useFeatures().mode("team");
  const isOwner = current?.role === "owner";

  const load = useCallback(async () => {
    const [m, u] = await Promise.all([
      supabase.rpc("list_members", { org: orgId }),
      supabase
        .from("organization_units")
        .select("id, name, parent_id")
        .eq("organization_id", orgId)
        .order("name"),
    ]);
    setMembers((m.data as Member[] | null) ?? []);
    setUnits((u.data as Unit[] | null) ?? []);
    if (manage) {
      const { data } = await supabase
        .from("invitations")
        .select("id, email, role, token, expires_at")
        .eq("organization_id", orgId)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      setInvites((data as Invitation[] | null) ?? []);
    }
  }, [orgId, manage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(promise: PromiseLike<{ error: { message: string; code?: string } | null }>) {
    const { error } = await promise;
    if (error) toast.error(friendlyError(error, t));
    else toast.success(t.common.saved);
    await load();
  }

  const roleOptions = roles.filter((r) => r !== "owner" || isOwner);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <h2 className="font-display text-lg font-semibold">
            {t.organization.members}{" "}
            <span className="text-muted-foreground">({members.length})</span>
          </h2>
          {manage && (
            <Button
              data-tour="members-invite"
              onClick={() =>
                teamMode === "available" ? setInviteOpen(true) : preview.open("team", "invite")
              }
              className="bg-brand hover:bg-brand-strong"
            >
              <UserPlus aria-hidden />
              {t.organization.invite}
            </Button>
          )}
        </div>
        {/* Papéis explicados: os nomes sozinhos (Gestor, Operador, Usuário) se confundem. */}
        <details className="border-b px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-brand">
            {t.organization.rolesHelp}
          </summary>
          <dl className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-[9rem_1fr]">
            {roles.map((r) => (
              <div key={r} className="contents">
                <dt className="font-medium">{t.roles[r]}</dt>
                <dd className="text-muted-foreground">{t.roleDescriptions[r]}</dd>
              </div>
            ))}
          </dl>
        </details>
        <ul className="divide-y">
          {members.map((m) => {
            const self = m.user_id === user?.id;
            const locked = !manage || (m.role === "owner" && !isOwner);
            return (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {m.full_name || m.email}
                    {self && <span className="text-muted-foreground"> ({t.organization.you})</span>}
                    {m.status === "suspended" && (
                      <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                        {t.organization.statusSuspended}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{m.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.roles[m.role]}: {t.roleDescriptions[m.role]}
                  </p>
                </div>
                <label className="sr-only" htmlFor={`role-${m.user_id}`}>
                  {t.organization.inviteRole}
                </label>
                <select
                  id={`role-${m.user_id}`}
                  className={selectClass}
                  value={m.role}
                  disabled={locked}
                  title={t.roleDescriptions[m.role]}
                  onChange={(e) =>
                    void run(
                      supabase.rpc("update_member", {
                        org: orgId,
                        member: m.user_id,
                        new_role: e.target.value,
                      }),
                    )
                  }
                >
                  {(locked ? roles : roleOptions).map((r) => (
                    <option key={r} value={r}>
                      {t.roles[r]}
                    </option>
                  ))}
                </select>
                {units.length > 0 && (
                  <select
                    aria-label={t.organization.inviteUnit}
                    className={selectClass}
                    value={m.unit_id ?? ""}
                    disabled={!manage}
                    onChange={(e) =>
                      e.target.value &&
                      void run(
                        supabase.rpc("update_member", {
                          org: orgId,
                          member: m.user_id,
                          new_unit: e.target.value,
                        }),
                      )
                    }
                  >
                    <option value="">{t.organization.noUnit}</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                )}
                {manage && !self && !locked && (
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void run(
                          supabase.rpc("update_member", {
                            org: orgId,
                            member: m.user_id,
                            new_status: m.status === "active" ? "suspended" : "active",
                          }),
                        )
                      }
                    >
                      {m.status === "active" ? t.organization.suspend : t.organization.reactivate}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`${t.common.remove} ${m.full_name || m.email}`}
                      onClick={() =>
                        void confirm({
                          title: t.common.remove,
                          text: f(t.organization.removeConfirm, { name: m.full_name || m.email }),
                          action: t.common.remove,
                        }).then((ok) => {
                          if (ok)
                            void run(
                              supabase.rpc("remove_member", { org: orgId, member: m.user_id }),
                            );
                        })
                      }
                    >
                      <Trash2 className="text-destructive" aria-hidden />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {manage && invites.length > 0 && (
        <section className="rounded-2xl border bg-white shadow-sm">
          <h2 className="border-b p-4 font-display text-lg font-semibold">
            {t.organization.pendingInvites}
          </h2>
          <ul className="divide-y">
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{inv.email}</span>
                <span className="text-muted-foreground">{t.roles[inv.role]}</span>
                <CopyLinkButton token={inv.token} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void run(supabase.from("invitations").delete().eq("id", inv.id))}
                >
                  {t.organization.revoke}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        orgId={orgId}
        roleOptions={roleOptions}
        units={units}
        onDone={load}
      />
      {confirmDialog}
    </div>
  );
}

function inviteLink(token: string) {
  return `${window.location.origin}/app/invite/${token}`;
}

function CopyLinkButton({ token }: { token: string }) {
  const { t } = useAppI18n();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(inviteLink(token));
        toast.success(t.common.copied);
      }}
    >
      <Copy aria-hidden />
      {t.common.copy}
    </Button>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  orgId,
  roleOptions,
  units,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  roleOptions: OrgRole[];
  units: Unit[];
  onDone: () => Promise<void>;
}) {
  const { t } = useAppI18n();
  const [role, setRole] = useState<OrgRole>("member");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const { data: id, error: err } = await supabase.rpc("invite_member", {
      org: orgId,
      invite_email: String(form.get("email")).trim(),
      invite_role: role,
      invite_unit: (form.get("unit") as string) || null,
    });
    if (err) {
      setError(friendlyError(err, t));
      setBusy(false);
      return;
    }
    const { data } = await supabase
      .from("invitations")
      .select("token")
      .eq("id", id as string)
      .single();
    setToken(data?.token ?? null);
    setBusy(false);
    track("member_invited", { role });
    await onDone();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setToken(null);
          setError(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.organization.inviteTitle}</DialogTitle>
          <DialogDescription>{t.roleDescriptions[role]}</DialogDescription>
        </DialogHeader>
        {token ? (
          <div className="grid gap-3">
            <FormMessage kind="success">{t.organization.inviteCreated}</FormMessage>
            <Input readOnly value={inviteLink(token)} onFocus={(e) => e.currentTarget.select()} />
            <CopyLinkButton token={token} />
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-1.5">
              <Label htmlFor="invite-email">{t.organization.inviteEmail}</Label>
              <Input id="invite-email" name="email" type="email" required autoFocus />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="invite-role">{t.organization.inviteRole}</Label>
              <select
                id="invite-role"
                className={selectClass}
                value={role}
                onChange={(e) => setRole(e.target.value as OrgRole)}
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {t.roles[r]}
                  </option>
                ))}
              </select>
            </div>
            {units.length > 0 && (
              <div className="grid gap-1.5">
                <Label htmlFor="invite-unit">{t.organization.inviteUnit}</Label>
                <select id="invite-unit" name="unit" className={selectClass} defaultValue="">
                  <option value="">{t.organization.noUnit}</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {error && <FormMessage kind="error">{error}</FormMessage>}
            <Button type="submit" disabled={busy} className="bg-brand hover:bg-brand-strong">
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {t.organization.invite}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UnitsTab({ orgId }: { orgId: string }) {
  const { t } = useAppI18n();
  const { can } = useOrg();
  const [units, setUnits] = useState<Unit[]>([]);
  const [name, setName] = useState("");
  const manage = can("units.manage");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("organization_units")
      .select("id, name, parent_id")
      .eq("organization_id", orgId)
      .order("name");
    setUnits((data as Unit[] | null) ?? []);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const { error } = await supabase
      .from("organization_units")
      .insert({ organization_id: orgId, name: name.trim() });
    if (error) toast.error(friendlyError(error, t));
    else setName("");
    await load();
  }

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="font-display text-lg font-semibold">{t.organization.units}</h2>
      {units.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t.organization.noUnits}</p>
      ) : (
        <ul className="mt-3 divide-y">
          {units.map((u) => (
            <li key={u.id} className="flex items-center justify-between py-2.5">
              <span>{u.name}</span>
              {manage && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${t.common.remove} ${u.name}`}
                  onClick={async () => {
                    const { error } = await supabase
                      .from("organization_units")
                      .delete()
                      .eq("id", u.id);
                    if (error) toast.error(friendlyError(error, t));
                    await load();
                  }}
                >
                  <Trash2 className="text-destructive" aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {manage && (
        <form onSubmit={add} className="mt-4 flex gap-2">
          <label htmlFor="unit-name" className="sr-only">
            {t.organization.unitName}
          </label>
          <Input
            id="unit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.organization.unitName}
            required
            maxLength={120}
          />
          <Button type="submit" variant="outline">
            <Plus aria-hidden />
            {t.organization.addUnit}
          </Button>
        </form>
      )}
    </section>
  );
}

function AuditTab({ orgId }: { orgId: string }) {
  const { t, locale } = useAppI18n();
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    supabase
      .from("audit_log")
      .select("id, action, entity, created_at, data")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setEntries((data as AuditEntry[] | null) ?? []));
  }, [orgId]);

  const fmt = new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale, {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="font-display text-lg font-semibold">{t.organization.audit}</h2>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t.organization.auditEmpty}</p>
      ) : (
        <ul className="mt-3 divide-y text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2.5">
              <span>
                {t.organization.auditActions[e.action] ?? e.action}
                {typeof e.data["email"] === "string" && (
                  <span className="text-muted-foreground"> · {e.data["email"]}</span>
                )}
              </span>
              <time className="text-muted-foreground" dateTime={e.created_at}>
                {fmt.format(new Date(e.created_at))}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProfileTab() {
  const { t } = useAppI18n();
  const { current, can, refresh } = useOrg();
  const [name, setName] = useState(current?.name ?? "");
  const [cnpj, setCnpj] = useState(formatCnpj(current?.cnpj ?? ""));
  const [locale, setLocale] = useState<Locale>((current?.locale as Locale) ?? "pt");
  const [error, setError] = useState<string | null>(null);
  const editable = can("settings.manage");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!current) return;
    if (cnpj && !isValidCnpj(cnpj)) {
      setError(t.onboarding.cnpjInvalid);
      return;
    }
    setError(null);
    const { error: err } = await supabase
      .from("organizations")
      .update({ name: name.trim(), cnpj: cnpj ? onlyDigits(cnpj) : null, locale })
      .eq("id", current.id);
    if (err) setError(friendlyError(err, t));
    else {
      toast.success(t.common.saved);
      await refresh();
    }
  }

  return (
    <form onSubmit={save} className="grid max-w-lg gap-4 rounded-2xl border bg-white p-5 shadow-sm">
      <div className="grid gap-1.5">
        <Label htmlFor="org-name">{t.organization.name}</Label>
        <Input
          id="org-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!editable}
          required
          minLength={2}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="org-cnpj">{t.organization.cnpj}</Label>
        <Input
          id="org-cnpj"
          inputMode="numeric"
          value={cnpj}
          onChange={(e) => setCnpj(formatCnpj(e.target.value))}
          disabled={!editable}
          placeholder="00.000.000/0000-00"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="org-locale">{t.organization.language}</Label>
        <select
          id="org-locale"
          className={selectClass}
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          disabled={!editable}
        >
          {locales.map((l) => (
            <option key={l} value={l}>
              {localeNames[l]}
            </option>
          ))}
        </select>
      </div>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      {editable && (
        <Button type="submit" className="w-fit bg-brand hover:bg-brand-strong">
          {t.common.save}
        </Button>
      )}
    </form>
  );
}
