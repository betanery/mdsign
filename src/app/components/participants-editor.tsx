import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { needsPhone, type AppConfig, type AuthLevel } from "../app-config";
import { useAuth } from "../auth";
import { useAppI18n } from "../i18n";
import { useOrg } from "../org";
import { selectClass } from "../ui";
import {
  formatCpf,
  formatPhone,
  isValidCpf,
  normalizePhone,
  onlyDigits,
  reservedEmailDomain,
} from "../validation";

export type ParticipantDraft = {
  key: string;
  name: string;
  email: string;
  cpf: string;
  noCpf: boolean;
  phone: string;
  role: "signer" | "approver" | "witness";
  authLevel: AuthLevel;
  /** Quórum: membros de um grupo em que basta N assinarem. */
  rule?: { key: string; name: string; required: number } | null;
  /** Grupo de onde a pessoa veio (só na tela: permite escolher o quórum depois de adicionar). */
  group?: { key: string; name: string } | null;
};

/** Mantém as regras de quórum coerentes depois de remover ou mover pessoas. */
export function normalizeRules(list: ParticipantDraft[]): ParticipantDraft[] {
  const count = new Map<string, number>();
  for (const p of list) if (p.rule) count.set(p.rule.key, (count.get(p.rule.key) ?? 0) + 1);
  return list.map((p) => {
    if (!p.rule) return p;
    const n = count.get(p.rule.key) ?? 0;
    if (n < 2) return { ...p, rule: null };
    return p.rule.required > n ? { ...p, rule: { ...p.rule, required: n } } : p;
  });
}

type Contact = {
  name: string;
  email: string;
  cpf: string | null;
  no_cpf: boolean;
  phone: string | null;
};

export const newParticipant = (role: ParticipantDraft["role"] = "signer"): ParticipantDraft => ({
  key: crypto.randomUUID(),
  name: "",
  email: "",
  cpf: "",
  noCpf: false,
  phone: "",
  role,
  authLevel: "basic",
});

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Mesmas regras do backend (cleanParticipants), para avisar antes de enviar. */
export function validateParticipants(
  list: ParticipantDraft[],
  config: AppConfig,
): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  const seen = new Set<string>();
  list.forEach((p, i) => {
    const bad: string[] = [];
    const email = p.email.trim().toLowerCase();
    if (p.name.trim().length < 2) bad.push("name");
    if (!EMAIL.test(email)) bad.push("email");
    else if (reservedEmailDomain(email)) bad.push("email_domain");
    if (p.noCpf ? !config.foreignSigners : !isValidCpf(p.cpf)) bad.push("cpf");
    if (!config.authLevels.includes(p.authLevel)) bad.push("authLevel");
    const phone = normalizePhone(p.phone);
    if ((p.phone.trim() && !phone) || (needsPhone(p.authLevel) && !phone)) bad.push("phone");
    if (p.authLevel === "identity_datavalid" && p.noCpf) bad.push("authLevel");
    if (email && seen.has(email)) bad.push("duplicate");
    seen.add(email);
    if (bad.length) out[i] = bad;
  });
  return out;
}

export const identityFields = ["name", "email", "cpf", "duplicate"];

/** Mantém só os problemas dos campos indicados (cada passo valida os seus). */
export function onlyFields(problems: Record<number, string[]>, fields: string[]) {
  const out: Record<number, string[]> = {};
  for (const [i, list] of Object.entries(problems)) {
    const kept = list.filter((f) => fields.includes(f));
    if (kept.length) out[Number(i)] = kept;
  }
  return out;
}

/** Formato que as funções esperam. */
export const toPayload = (list: ParticipantDraft[]) =>
  list.map((p) => ({
    name: p.name.trim(),
    email: p.email.trim().toLowerCase(),
    cpf: p.noCpf ? null : onlyDigits(p.cpf),
    noCpf: p.noCpf,
    phone: p.phone.trim() || null,
    role: p.role,
    authLevel: p.authLevel,
    ...(p.rule ? { rule: p.rule } : {}),
  }));

function useContacts() {
  const { current } = useOrg();
  const [contacts, setContacts] = useState<Contact[]>([]);
  useEffect(() => {
    if (!current) return;
    supabase
      .from("contacts")
      .select("name, email, cpf, no_cpf, phone")
      .eq("organization_id", current.id)
      .order("name")
      .limit(1000)
      .then(({ data }) => setContacts((data as Contact[] | null) ?? []));
  }, [current]);
  return contacts;
}

function FieldError({ fields, field }: { fields: string[] | undefined; field: string }) {
  const { t } = useAppI18n();
  if (!fields?.includes(field)) return null;
  return <p className="text-xs text-destructive">{t.participants.fieldErrors[field]}</p>;
}

/** "Diretoria · 2 de 3": nome do grupo e quantas pessoas precisam assinar. */
function ruleLabel(rule: NonNullable<ParticipantDraft["rule"]>, list: ParticipantDraft[]) {
  const total = list.filter((p) => p.rule?.key === rule.key).length;
  return `${rule.name} · ${rule.required}/${total}`;
}

/** Passo "Participantes": quem assina (nome, e-mail, CPF ou estrangeiro, celular). */
export function ParticipantsEditor({
  value,
  onChange,
  config,
  problems,
  labels,
}: {
  value: ParticipantDraft[];
  onChange: (next: ParticipantDraft[]) => void;
  config: AppConfig;
  problems: Record<number, string[]>;
  /** Papéis fixos do modelo (um bloco por papel, sem adicionar/remover). */
  labels?: string[] | undefined;
}) {
  const { t } = useAppI18n();
  const { user } = useAuth();
  const contacts = useContacts();
  const fixed = Boolean(labels);
  const listId = useId();
  const { current } = useOrg();
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const orgId = current?.id;
  useEffect(() => {
    if (!orgId || fixed) return;
    void supabase
      .from("org_groups")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name")
      .then(({ data }) => setGroups((data as { id: string; name: string }[] | null) ?? []));
  }, [orgId, fixed]);

  // Grupo inteiro de uma vez ("todos do grupo"): cada membro vira um participante.
  async function addGroup(groupId: string) {
    if (!orgId) return;
    const groupName = groups.find((g) => g.id === groupId)?.name ?? "";
    // CPF e celular vêm do cadastro do usuário; se faltar, dos Contatos.
    const { data: members } = await supabase.rpc("group_member_identities", { grp: groupId });
    const taken = new Set(value.map((p) => p.email.trim().toLowerCase()).filter(Boolean));
    const add = (
      (members as
        | {
            full_name: string | null;
            email: string;
            cpf: string | null;
            no_cpf: boolean;
            phone: string | null;
          }[]
        | null) ?? []
    )
      .filter((m) => !taken.has(m.email.toLowerCase()))
      .map((m) => {
        const c = contacts.find((x) => x.email.toLowerCase() === m.email.toLowerCase());
        const cpf = m.cpf ?? c?.cpf ?? null;
        return {
          ...newParticipant(),
          name: m.full_name ?? c?.name ?? "",
          email: m.email,
          cpf: cpf ? formatCpf(cpf) : "",
          noCpf: !cpf && (m.no_cpf || Boolean(c?.no_cpf)) && config.foreignSigners,
          phone: m.phone ?? c?.phone ?? "",
        };
      });
    const group = { key: crypto.randomUUID(), name: groupName };
    const keep = value.filter((p) => p.name || p.email);
    onChange([...keep, ...add.map((p) => ({ ...p, group, rule: null }))].slice(0, 30));
  }

  // Quórum escolhido depois de adicionar o grupo: 0 = todos assinam (um por vez);
  // N = basta N, e os membros viram uma etapa só, juntos na lista.
  function setGroupQuorum(groupKey: string, required: number) {
    const members = value.filter((p) => p.group?.key === groupKey);
    const name = members[0]?.group?.name ?? "";
    const rule = required > 0 ? { key: groupKey, name, required } : null;
    const list: ParticipantDraft[] = [];
    for (const p of value) {
      if (p.group?.key !== groupKey) list.push(p);
      else if (p === members[0]) list.push(...members.map((m) => ({ ...m, rule })));
    }
    onChange(normalizeRules(list));
  }
  const addedGroups = [
    ...new Map(value.filter((p) => p.group).map((p) => [p.group!.key, p.group!] as const)).values(),
  ]
    .map((g) => ({
      ...g,
      count: value.filter((p) => p.group?.key === g.key).length,
      required: value.find((p) => p.group?.key === g.key)?.rule?.required ?? 0,
    }))
    .filter((g) => g.count >= 2);

  const update = (i: number, patch: Partial<ParticipantDraft>) =>
    onChange(value.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  function fromContact(i: number, email: string) {
    const c = contacts.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!c) return update(i, { email });
    update(i, {
      email: c.email,
      name: c.name,
      cpf: c.cpf ? formatCpf(c.cpf) : "",
      noCpf: c.no_cpf && config.foreignSigners,
      phone: c.phone ?? "",
    });
  }

  async function addMe() {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("full_name, cpf, phone")
      .eq("id", user.id)
      .maybeSingle();
    const me: ParticipantDraft = {
      ...newParticipant(),
      name: data?.full_name ?? "",
      email: user.email ?? "",
      cpf: data?.cpf ? formatCpf(data.cpf) : "",
      phone: data?.phone ?? "",
    };
    const empty = value.length === 1 && !value[0]!.name && !value[0]!.email;
    onChange(empty ? [me] : [...value, me]);
  }

  return (
    <div className="grid gap-4">
      <datalist id={listId}>
        {contacts.map((c) => (
          <option key={c.email} value={c.email}>
            {c.name}
          </option>
        ))}
      </datalist>
      {config.quorumGroups &&
        addedGroups.map((g) => (
          <div
            key={g.key}
            className="grid gap-1 rounded-xl border border-brand/30 bg-brand-soft/40 p-4 text-sm"
          >
            <label className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {g.name} · {t.participants.quorumLabel}
              </span>
              <select
                value={g.required}
                onChange={(e) => setGroupQuorum(g.key, Number(e.target.value))}
                className={cn(selectClass, "h-10 w-auto")}
              >
                <option value={0}>{t.participants.quorumAll}</option>
                {Array.from({ length: g.count - 1 }, (_, n) => n + 1).map((n) => (
                  <option key={n} value={n}>
                    {t.participants.quorumAny.replace("{n}", String(n))}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-muted-foreground">
              {g.required > 0 ? t.participants.quorumHintAny : t.participants.quorumHintAll}
            </p>
          </div>
        ))}
      {value.map((p, i) => {
        const bad = problems[i];
        return (
          <fieldset
            key={p.key}
            className={cn(
              "grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2",
              bad && "border-destructive/50",
            )}
          >
            <legend className="sr-only">
              {t.participants.title} {i + 1}
            </legend>
            <div className="flex items-center justify-between sm:col-span-2">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex size-6 items-center justify-center rounded-full bg-brand-soft text-xs text-brand">
                  {i + 1}
                </span>
                {labels?.[i] ? (
                  <>
                    {labels[i]}
                    {p.name && (
                      <span className="font-normal text-muted-foreground"> · {p.name}</span>
                    )}
                  </>
                ) : (
                  p.name || t.participants.title
                )}
                {p.role === "witness" && (
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 uppercase">
                    {t.participants.roles.witness}
                  </span>
                )}
                {p.rule && (
                  <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                    {ruleLabel(p.rule, value)}
                  </span>
                )}
              </span>
              {!fixed && value.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(normalizeRules(value.filter((_, idx) => idx !== i)))}
                  aria-label={`${t.common.remove} ${p.name}`}
                >
                  <Trash2 aria-hidden />
                </Button>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${p.key}-email`}>{t.participants.email}</Label>
              <Input
                id={`${p.key}-email`}
                type="email"
                list={listId}
                autoComplete="off"
                value={p.email}
                onChange={(e) => fromContact(i, e.target.value)}
                aria-invalid={
                  bad?.includes("email") ||
                  bad?.includes("email_domain") ||
                  bad?.includes("duplicate")
                }
              />
              <FieldError fields={bad} field="email" />
              <FieldError fields={bad} field="email_domain" />
              <FieldError fields={bad} field="duplicate" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${p.key}-name`}>{t.participants.name}</Label>
              <Input
                id={`${p.key}-name`}
                value={p.name}
                onChange={(e) => update(i, { name: e.target.value })}
                aria-invalid={bad?.includes("name")}
              />
              <FieldError fields={bad} field="name" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${p.key}-cpf`}>{t.participants.cpf}</Label>
              <Input
                id={`${p.key}-cpf`}
                inputMode="numeric"
                value={p.noCpf ? "" : p.cpf}
                disabled={p.noCpf}
                onChange={(e) => update(i, { cpf: formatCpf(e.target.value) })}
                aria-invalid={bad?.includes("cpf")}
              />
              {/* Sem CPF só aparece quando liberado (ou num rascunho antigo que já marcou). */}
              {(config.foreignSigners || p.noCpf) && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={p.noCpf}
                    disabled={!config.foreignSigners && !p.noCpf}
                    onChange={(e) => update(i, { noCpf: e.target.checked })}
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  {t.participants.noCpf}
                </label>
              )}
              {!config.foreignSigners && p.noCpf && (
                <p className="text-xs text-muted-foreground">{t.participants.noCpfOff}</p>
              )}
              <FieldError fields={bad} field="cpf" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${p.key}-phone`}>
                {t.participants.phone}{" "}
                <span className="font-normal text-muted-foreground">({t.common.optional})</span>
              </Label>
              <Input
                id={`${p.key}-phone`}
                type="tel"
                inputMode="tel"
                value={p.phone}
                onChange={(e) => update(i, { phone: formatPhone(e.target.value) })}
                aria-invalid={bad?.includes("phone")}
              />
              <p className="text-xs text-muted-foreground">{t.participants.phoneHint}</p>
              <FieldError fields={bad} field="phone" />
            </div>
          </fieldset>
        );
      })}
      {contacts.length > 0 && (
        <p className="text-xs text-muted-foreground">{t.participants.contactsHint}</p>
      )}
      <div className={fixed ? "hidden" : "flex flex-wrap gap-2"}>
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...value, newParticipant()])}
          disabled={value.length >= 30}
        >
          <Plus aria-hidden />
          {t.participants.add}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...value, newParticipant("witness")])}
          disabled={value.length >= 30}
        >
          <Plus aria-hidden />
          {t.participants.addWitness}
        </Button>
        <Button type="button" variant="ghost" onClick={() => void addMe()}>
          <UserRound aria-hidden />
          {t.participants.addMe}
        </Button>
        {groups.length > 0 && (
          <select
            aria-label={t.participants.addGroup}
            value=""
            onChange={(e) => e.target.value && void addGroup(e.target.value)}
            className={cn(selectClass, "h-10 w-auto")}
          >
            <option value="">{t.participants.addGroup}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

/** Passo "Fluxo": ordem, papel e autenticação de cada participante (PRD §9 e §10). */
export function FlowEditor({
  value,
  onChange,
  sequential,
  onSequentialChange,
  config,
  problems,
  fixedOrder,
}: {
  value: ParticipantDraft[];
  onChange: (next: ParticipantDraft[]) => void;
  sequential: boolean;
  onSequentialChange: (v: boolean) => void;
  config: AppConfig;
  problems: Record<number, string[]>;
  /** Papéis do modelo: a ordem e o papel (assina/aprova) vêm do modelo. */
  fixedOrder?: boolean | undefined;
}) {
  const { t } = useAppI18n();
  // Papel e autenticação valem para o grupo inteiro (quórum).
  const update = (i: number, patch: Partial<ParticipantDraft>) => {
    const key = value[i]?.rule?.key;
    onChange(
      value.map((p, idx) => (idx === i || (key && p.rule?.key === key) ? { ...p, ...patch } : p)),
    );
  };
  const move = (i: number, dir: -1 | 1) => moveBlock(i, dir);
  // Membros de um grupo com quórum andam juntos (são uma etapa só).
  const moveBlock = (i: number, dir: -1 | 1) => {
    const blocks: ParticipantDraft[][] = [];
    for (const p of value) {
      const last = blocks[blocks.length - 1];
      if (last && p.rule && last[0]!.rule?.key === p.rule.key) last.push(p);
      else blocks.push([p]);
    }
    const b = blocks.findIndex((blk) => blk.includes(value[i]!));
    const to = b + dir;
    if (b < 0 || to < 0 || to >= blocks.length) return;
    [blocks[b], blocks[to]] = [blocks[to]!, blocks[b]!];
    onChange(blocks.flat());
  };
  // Número da etapa: os membros de um grupo com quórum dividem o mesmo número.
  const stepOf: number[] = [];
  value.forEach((p, i) => {
    const prev = value[i - 1];
    const same = Boolean(p.rule && prev?.rule?.key === p.rule.key);
    stepOf.push(i === 0 ? 1 : same ? stepOf[i - 1]! : stepOf[i - 1]! + 1);
  });
  return (
    <div className="grid gap-4">
      <label className="flex items-start gap-3 rounded-xl border bg-white p-4">
        <Switch checked={sequential} onCheckedChange={onSequentialChange} className="mt-0.5" />
        <span>
          <span className="block font-medium">{t.participants.sequential}</span>
          <span className="text-sm text-muted-foreground">
            {sequential ? t.participants.sequentialHint : t.participants.parallelHint}
          </span>
        </span>
      </label>
      <ol className="grid gap-3">
        {value.map((p, i) => {
          const bad = problems[i];
          return (
            <li
              key={p.key}
              className={cn(
                "grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-[auto_1fr_auto_auto] sm:items-end",
                bad && "border-destructive/50",
              )}
            >
              <div className="flex items-center gap-1">
                <span className="flex size-7 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                  {sequential ? stepOf[i] : "•"}
                </span>
                {sequential && !fixedOrder && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={stepOf[i] === 1}
                      onClick={() => move(i, -1)}
                      aria-label={t.participants.moveUp}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={stepOf[i] === stepOf[value.length - 1]}
                      onClick={() => move(i, 1)}
                      aria-label={t.participants.moveDown}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                  </>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{p.name}</p>
                <p className="truncate text-sm text-muted-foreground">{p.email}</p>
                {p.rule && (
                  <span className="mt-1 inline-block rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                    {ruleLabel(p.rule, value)}
                  </span>
                )}
              </div>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">{t.participants.role}</span>
                <select
                  value={p.role}
                  disabled={fixedOrder}
                  onChange={(e) => update(i, { role: e.target.value as ParticipantDraft["role"] })}
                  className={selectClass}
                >
                  <option value="signer">{t.participants.roles.signer}</option>
                  <option value="approver">{t.participants.roles.approver}</option>
                  <option value="witness">{t.participants.roles.witness}</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">{t.participants.authLevel}</span>
                <select
                  value={p.authLevel}
                  disabled={p.role === "approver"}
                  onChange={(e) => update(i, { authLevel: e.target.value as AuthLevel })}
                  className={selectClass}
                  aria-invalid={bad?.includes("authLevel") || bad?.includes("phone")}
                >
                  {config.authLevels.map((level) => (
                    <option key={level} value={level}>
                      {t.participants.levels[level]}
                    </option>
                  ))}
                </select>
              </label>
              {bad && (
                <p className="text-xs text-destructive sm:col-span-4">
                  {bad.map((f) => t.participants.fieldErrors[f]).join(" ")}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
