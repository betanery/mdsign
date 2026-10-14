import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, UserMinus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../auth";
import { formatDate } from "../documents";
import { useAppI18n } from "../i18n";
import { useOrg } from "../org";
import { selectClass } from "../ui";
import { friendlyError } from "../validation";
import { useConfirm } from "./confirm-dialog";

type Member = { user_id: string; full_name: string | null; email: string; status: string };
type Group = { id: string; name: string; description: string | null };
type GroupMember = { group_id: string; user_id: string };
type Delegation = {
  id: string;
  delegator_id: string;
  delegate_id: string;
  starts_at: string;
  ends_at: string;
  scope: string;
  active: boolean;
  revoked_at: string | null;
  note: string | null;
};

function useMembers(orgId: string) {
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    void supabase
      .rpc("list_members", { org: orgId })
      .then(({ data }) =>
        setMembers(((data as Member[] | null) ?? []).filter((m) => m.status === "active")),
      );
  }, [orgId]);
  return members;
}

const label = (m: Member | undefined) => (m ? m.full_name?.trim() || m.email : "—");

/** Grupos da organização (Diretoria, Jurídico, RH…) para usar nos envios e processos. */
export function GroupsTab({ orgId }: { orgId: string }) {
  const { t } = useAppI18n();
  const { can } = useOrg();
  const manage = can("members.manage");
  const members = useMembers(orgId);
  const [groups, setGroups] = useState<Group[]>([]);
  const [links, setLinks] = useState<GroupMember[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(async () => {
    const [g, l] = await Promise.all([
      supabase
        .from("org_groups")
        .select("id, name, description")
        .eq("organization_id", orgId)
        .order("name"),
      supabase.from("org_group_members").select("group_id, user_id").eq("organization_id", orgId),
    ]);
    setGroups((g.data as Group[] | null) ?? []);
    setLinks((l.data as GroupMember[] | null) ?? []);
  }, [orgId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("org_groups")
      .insert({ organization_id: orgId, name: name.trim(), created_by: auth.user?.id });
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error, t));
      return;
    }
    setName("");
    void load();
  }

  async function addMember(groupId: string, userId: string) {
    const { error } = await supabase
      .from("org_group_members")
      .insert({ group_id: groupId, organization_id: orgId, user_id: userId });
    if (error) toast.error(friendlyError(error, t));
    void load();
  }

  async function removeMember(groupId: string, userId: string) {
    await supabase.from("org_group_members").delete().eq("group_id", groupId).eq("user_id", userId);
    void load();
  }

  async function removeGroup(g: Group) {
    const ok = await confirm({
      title: t.groups.removeTitle.replace("{name}", g.name),
      text: t.groups.removeText,
      action: t.groups.remove,
    });
    if (!ok) return;
    const { error } = await supabase.from("org_groups").delete().eq("id", g.id);
    if (error) toast.error(friendlyError(error, t));
    void load();
  }

  return (
    <div className="grid max-w-3xl gap-4">
      {confirmDialog}
      <p className="text-sm text-muted-foreground">{t.groups.hint}</p>
      {manage && (
        <form
          data-tour="groups-new"
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) void create();
          }}
        >
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="group-name">{t.groups.newName}</Label>
            <Input
              id="group-name"
              value={name}
              maxLength={80}
              placeholder={t.groups.placeholder}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            className="bg-brand hover:bg-brand-strong"
            disabled={busy || name.trim().length < 2}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
            {t.groups.create}
          </Button>
        </form>
      )}
      {groups.length === 0 ? (
        <p className="rounded-2xl border bg-white p-5 text-sm text-muted-foreground">
          {t.groups.empty}
        </p>
      ) : (
        <ul className="grid gap-3">
          {groups.map((g) => {
            const inGroup = links.filter((l) => l.group_id === g.id).map((l) => l.user_id);
            const others = members.filter((m) => !inGroup.includes(m.user_id));
            return (
              <li key={g.id} className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <h3 className="flex-1 font-display font-semibold">
                    {g.name}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      · {t.groups.count.replace("{n}", String(inGroup.length))}
                    </span>
                  </h3>
                  {manage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void removeGroup(g)}
                      aria-label={t.groups.remove}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </div>
                <ul className="flex flex-wrap gap-2">
                  {inGroup.map((uid) => (
                    <li
                      key={uid}
                      className="flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 text-sm"
                    >
                      {label(members.find((m) => m.user_id === uid))}
                      {manage && (
                        <button
                          type="button"
                          onClick={() => void removeMember(g.id, uid)}
                          aria-label={t.groups.removeMember}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <UserMinus className="size-3.5" aria-hidden />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {manage && others.length > 0 && (
                  <select
                    aria-label={t.groups.addMember}
                    value=""
                    onChange={(e) => e.target.value && void addMember(g.id, e.target.value)}
                    className={selectClass + " h-9 w-fit"}
                  >
                    <option value="">{t.groups.addMember}</option>
                    {others.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {label(m)}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Delegações de aprovação: durante o período, as aprovações enviadas a quem delegou vão para
 * o delegado (registradas "em delegação de"). Assinaturas não são delegáveis.
 */
export function DelegationsTab({ orgId }: { orgId: string }) {
  const { t, locale } = useAppI18n();
  const { user } = useAuth();
  const { can } = useOrg();
  const manage = can("members.manage");
  const members = useMembers(orgId);
  const [list, setList] = useState<Delegation[]>([]);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    delegator: "",
    delegate: "",
    starts: today,
    ends: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("delegations")
      .select("id, delegator_id, delegate_id, starts_at, ends_at, scope, active, revoked_at, note")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    setList((data as Delegation[] | null) ?? []);
  }, [orgId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (user && !form.delegator) setForm((f) => ({ ...f, delegator: user.id }));
  }, [user, form.delegator]);

  async function create() {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("delegations").insert({
      organization_id: orgId,
      delegator_id: form.delegator,
      delegate_id: form.delegate,
      starts_at: new Date(`${form.starts}T00:00:00`).toISOString(),
      ends_at: new Date(`${form.ends}T23:59:59`).toISOString(),
      scope: "approvals",
      note: form.note.trim() || null,
      created_by: user.id,
    });
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error, t));
      return;
    }
    toast.success(t.delegations.created);
    setForm((f) => ({ ...f, delegate: "", ends: "", note: "" }));
    void load();
  }

  async function revoke(d: Delegation) {
    if (!user) return;
    const { error } = await supabase
      .from("delegations")
      .update({ active: false, revoked_at: new Date().toISOString(), revoked_by: user.id })
      .eq("id", d.id);
    if (error) toast.error(friendlyError(error, t));
    void load();
  }

  const now = Date.now();
  const state = (d: Delegation) =>
    d.revoked_at || !d.active
      ? "revoked"
      : new Date(d.ends_at).getTime() < now
        ? "ended"
        : new Date(d.starts_at).getTime() > now
          ? "scheduled"
          : "active";
  const valid =
    form.delegator &&
    form.delegate &&
    form.delegator !== form.delegate &&
    form.ends &&
    form.ends >= form.starts;

  return (
    <div className="grid max-w-3xl gap-4">
      <p className="text-sm text-muted-foreground">{t.delegations.hint}</p>
      <form
        className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void create();
        }}
      >
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{t.delegations.delegator}</span>
          <select
            value={form.delegator}
            disabled={!manage}
            onChange={(e) => setForm({ ...form, delegator: e.target.value })}
            className={selectClass + " h-10"}
          >
            {(manage ? members : members.filter((m) => m.user_id === user?.id)).map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {label(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{t.delegations.delegate}</span>
          <select
            value={form.delegate}
            onChange={(e) => setForm({ ...form, delegate: e.target.value })}
            className={selectClass + " h-10"}
          >
            <option value="">{t.delegations.choose}</option>
            {members
              .filter((m) => m.user_id !== form.delegator)
              .map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {label(m)}
                </option>
              ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{t.delegations.starts}</span>
          <Input
            type="date"
            value={form.starts}
            onChange={(e) => setForm({ ...form, starts: e.target.value })}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{t.delegations.ends}</span>
          <Input
            type="date"
            min={form.starts}
            value={form.ends}
            onChange={(e) => setForm({ ...form, ends: e.target.value })}
          />
        </label>
        <p className="text-xs text-muted-foreground sm:col-span-2">{t.delegations.scopeHint}</p>
        <label className="grid gap-1.5 text-sm sm:col-span-2">
          <span className="font-medium">{t.delegations.note}</span>
          <Input
            value={form.note}
            maxLength={300}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </label>
        <Button
          type="submit"
          className="w-fit bg-brand hover:bg-brand-strong"
          disabled={!valid || busy}
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
          {t.delegations.create}
        </Button>
      </form>
      {list.length === 0 ? (
        <p className="rounded-2xl border bg-white p-5 text-sm text-muted-foreground">
          {t.delegations.empty}
        </p>
      ) : (
        <ul className="divide-y rounded-2xl border bg-white shadow-sm">
          {list.map((d) => {
            const st = state(d);
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {t.delegations.line
                      .replace("{from}", label(members.find((m) => m.user_id === d.delegator_id)))
                      .replace("{to}", label(members.find((m) => m.user_id === d.delegate_id)))}
                  </p>
                  <p className="text-muted-foreground">
                    {formatDate(d.starts_at, locale)} → {formatDate(d.ends_at, locale)} ·{" "}
                    {t.delegations.scopes[d.scope]}
                    {d.note ? ` · ${d.note}` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                  {t.delegations.states[st]}
                </span>
                {(st === "active" || st === "scheduled") &&
                  (manage || d.delegator_id === user?.id) && (
                    <Button size="sm" variant="outline" onClick={() => void revoke(d)}>
                      {t.delegations.revoke}
                    </Button>
                  )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
