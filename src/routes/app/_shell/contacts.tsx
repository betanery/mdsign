import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ContactRound, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { EmptyState } from "@/app/components/empty-state";
import { toast } from "sonner";

import { useAuth } from "@/app/auth";
import { PageHeader } from "@/app/components/app-shell";
import { FormMessage } from "@/app/components/auth-layout";
import { useConfirm } from "@/app/components/confirm-dialog";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { formatCpf, formatPhone, friendlyError, isValidCpf, onlyDigits } from "@/app/validation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

// Contatos da organização (PRD §21): base para autocompletar participantes.
export const Route = createFileRoute("/app/_shell/contacts")({ component: ContactsPage });

type Contact = {
  id: string;
  name: string;
  email: string;
  cpf: string | null;
  no_cpf: boolean;
  phone: string | null;
  company: string | null;
  source: string;
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function ContactsPage() {
  const { t, f } = useAppI18n();
  const [confirm, confirmDialog] = useConfirm();
  const { current, can } = useOrg();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);
  const canManage = can("contacts.manage");

  const load = useCallback(async () => {
    if (!current) return;
    const { data } = await supabase
      .from("contacts")
      .select("id, name, email, cpf, no_cpf, phone, company, source")
      .eq("organization_id", current.id)
      .order("name")
      .limit(2000);
    setContacts((data as Contact[] | null) ?? []);
  }, [current]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts ?? [];
    return (contacts ?? []).filter(
      (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
  }, [contacts, query]);

  async function remove(c: Contact) {
    const ok = await confirm({
      title: t.common.remove,
      text: f(t.contacts.removeConfirm, { name: c.name }),
      action: t.common.remove,
    });
    if (!ok) return;
    const { error } = await supabase.from("contacts").delete().eq("id", c.id);
    if (error) {
      toast.error(friendlyError(error, t));
      return;
    }
    toast.success(t.contacts.removed);
    void load();
  }

  if (!current) return <p>{t.notFoundOrg}</p>;
  return (
    <>
      <PageHeader
        title={t.contacts.title}
        subtitle={t.contacts.subtitle}
        actions={
          canManage && (
            <Button className="bg-brand hover:bg-brand-strong" onClick={() => setEditing({})}>
              <Plus aria-hidden />
              {t.contacts.add}
            </Button>
          )
        }
      />
      <div className="relative mb-4 max-w-sm">
        <Search
          className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.contacts.search}
          aria-label={t.contacts.search}
          className="pl-9"
        />
      </div>
      <div className="rounded-2xl border bg-white shadow-sm">
        {contacts === null ? (
          <p className="p-5 text-muted-foreground">{t.common.loading}</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ContactRound}
            className="border-0 shadow-none"
            title={contacts.length ? t.empty.contactsSearch : t.empty.contacts}
            text={contacts.length ? undefined : t.empty.contactsText}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">{t.participants.name}</th>
                  <th className="p-3 font-medium">{t.participants.email}</th>
                  <th className="hidden p-3 font-medium md:table-cell">{t.participants.cpf}</th>
                  <th className="hidden p-3 font-medium lg:table-cell">{t.contacts.company}</th>
                  <th className="hidden p-3 font-medium lg:table-cell">{t.admin.status}</th>
                  {canManage && <th className="p-3" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3">{c.email}</td>
                    <td className="hidden p-3 md:table-cell">
                      {c.cpf ? formatCpf(c.cpf) : c.no_cpf ? t.participants.noCpf : "—"}
                    </td>
                    <td className="hidden p-3 lg:table-cell">{c.company ?? "—"}</td>
                    <td className="hidden p-3 text-muted-foreground lg:table-cell">
                      {t.contacts.sources[c.source] ?? c.source}
                    </td>
                    {canManage && (
                      <td className="p-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(c)}
                          aria-label={`${t.common.edit} ${c.name}`}
                        >
                          <Pencil aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void remove(c)}
                          aria-label={`${t.common.remove} ${c.name}`}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && (
        <ContactDialog
          contact={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {confirmDialog}
    </>
  );
}

function ContactDialog({
  contact,
  onClose,
  onSaved,
}: {
  contact: Partial<Contact>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useAppI18n();
  const { user } = useAuth();
  const { current } = useOrg();
  const [name, setName] = useState(contact.name ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [cpf, setCpf] = useState(contact.cpf ? formatCpf(contact.cpf) : "");
  const [noCpf, setNoCpf] = useState(contact.no_cpf ?? false);
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [company, setCompany] = useState(contact.company ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    if (name.trim().length < 1) return setError(t.participants.fieldErrors["name"]!);
    if (!EMAIL.test(email.trim())) return setError(t.participants.fieldErrors["email"]!);
    if (!noCpf && cpf && !isValidCpf(cpf)) return setError(t.participants.fieldErrors["cpf"]!);
    setBusy(true);
    setError(null);
    const row = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      cpf: noCpf || !cpf ? null : onlyDigits(cpf),
      no_cpf: noCpf,
      phone: phone.trim() || null,
      company: company.trim() || null,
    };
    const { error: err } = contact.id
      ? await supabase.from("contacts").update(row).eq("id", contact.id)
      : await supabase
          .from("contacts")
          .insert({ ...row, organization_id: current.id, created_by: user?.id ?? null });
    setBusy(false);
    if (err) return setError(err.code === "23505" ? t.contacts.duplicate : friendlyError(err, t));
    toast.success(t.contacts.saved);
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{contact.id ? t.contacts.edit : t.contacts.add}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void save(e)} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="c-name">{t.participants.name}</Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-email">{t.participants.email}</Label>
            <Input
              id="c-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-cpf">{t.participants.cpf}</Label>
            <Input
              id="c-cpf"
              inputMode="numeric"
              value={noCpf ? "" : cpf}
              disabled={noCpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={noCpf}
                onChange={(e) => setNoCpf(e.target.checked)}
                className="size-4 accent-[var(--color-brand)]"
              />
              {t.participants.noCpf}
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="c-phone">{t.participants.phone}</Label>
              <Input
                id="c-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-company">{t.contacts.company}</Label>
              <Input id="c-company" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
          </div>
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={busy} className="bg-brand hover:bg-brand-strong">
              {t.common.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
