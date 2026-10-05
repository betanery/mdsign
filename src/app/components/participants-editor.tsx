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
import { formatCpf, isValidCpf, normalizePhone, onlyDigits } from "../validation";

export type ParticipantDraft = {
  key: string;
  name: string;
  email: string;
  cpf: string;
  noCpf: boolean;
  phone: string;
  role: "signer" | "approver" | "witness";
  authLevel: AuthLevel;
};

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
              </span>
              {!fixed && value.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(value.filter((_, idx) => idx !== i))}
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
                aria-invalid={bad?.includes("email") || bad?.includes("duplicate")}
              />
              <FieldError fields={bad} field="email" />
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
              {!config.foreignSigners && (
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
                onChange={(e) => update(i, { phone: e.target.value })}
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
  const update = (i: number, patch: Partial<ParticipantDraft>) =>
    onChange(value.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...value];
    const [item] = next.splice(i, 1);
    next.splice(i + dir, 0, item!);
    onChange(next);
  };

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
                  {sequential ? i + 1 : "•"}
                </span>
                {sequential && !fixedOrder && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      aria-label={t.participants.moveUp}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={i === value.length - 1}
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
