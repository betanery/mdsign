// Fluxos salvos: guardar participantes, papéis, ordem e autenticação com um nome e reaplicar
// num envio novo (contratos recorrentes). Ficam na organização (RLS saved_flows).

import { useCallback, useEffect, useState } from "react";
import { Bookmark, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAuth } from "../auth";
import { useAppI18n } from "../i18n";
import { useOrg } from "../org";
import { selectClass } from "../ui";
import { useConfirm } from "./confirm-dialog";
import { newParticipant, type ParticipantDraft } from "./participants-editor";

type Saved = {
  id: string;
  name: string;
  sequential: boolean;
  participants: Partial<ParticipantDraft>[];
  created_by: string | null;
};

/** Só o que define o fluxo (sem a chave da tela nem o grupo de origem). */
export function flowToSave(list: ParticipantDraft[]) {
  return list
    .filter((p) => p.name.trim() || p.email.trim())
    .map(({ name, email, cpf, noCpf, phone, role, authLevel, rule }) => ({
      name,
      email,
      cpf,
      noCpf,
      phone,
      role,
      authLevel,
      rule: rule ?? null,
    }));
}

/** Reaplica um fluxo salvo: chaves novas para a tela; campos ausentes ficam no padrão. */
export function flowFromSaved(list: Partial<ParticipantDraft>[]): ParticipantDraft[] {
  return list.map((p) => ({
    ...newParticipant(p.role ?? "signer"),
    name: p.name ?? "",
    email: p.email ?? "",
    cpf: p.cpf ?? "",
    noCpf: Boolean(p.noCpf),
    phone: p.phone ?? "",
    ...(p.authLevel ? { authLevel: p.authLevel } : {}),
    rule: p.rule ?? null,
  }));
}

export function SavedFlows({
  participants,
  sequential,
  onApply,
}: {
  participants: ParticipantDraft[];
  sequential: boolean;
  onApply: (participants: ParticipantDraft[], sequential: boolean) => void;
}) {
  const { t, f } = useAppI18n();
  const { user } = useAuth();
  const { current, can } = useOrg();
  const orgId = current?.id;
  const [flows, setFlows] = useState<Saved[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const s = t.savedFlows;

  const load = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from("saved_flows")
      .select("id, name, sequential, participants, created_by")
      .eq("organization_id", orgId)
      .order("name");
    setFlows((data as Saved[] | null) ?? []);
  }, [orgId]);
  useEffect(() => {
    void load();
  }, [load]);

  const toSave = flowToSave(participants);

  async function save() {
    if (!orgId || !user || name.trim().length < 2 || !toSave.length) return;
    setBusy(true);
    const { error } = await supabase.from("saved_flows").insert({
      organization_id: orgId,
      name: name.trim().slice(0, 80),
      sequential,
      participants: toSave,
      created_by: user.id,
    });
    setBusy(false);
    if (error)
      return void toast.error(error.code === "23505" ? s.duplicate : t.common.genericError);
    toast.success(f(s.saved, { name: name.trim() }));
    setName("");
    setOpen(false);
    void load();
  }

  async function remove(flow: Saved) {
    const ok = await confirm({
      title: s.remove,
      text: f(s.removeConfirm, { name: flow.name }),
      action: s.remove,
    });
    if (!ok) return;
    const { error } = await supabase.from("saved_flows").delete().eq("id", flow.id);
    if (error) return void toast.error(t.common.genericError);
    void load();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {confirmDialog}
      {flows.length > 0 && (
        <select
          aria-label={s.use}
          value=""
          onChange={(e) => {
            const flow = flows.find((x) => x.id === e.target.value);
            if (!flow) return;
            onApply(flowFromSaved(flow.participants), flow.sequential);
            toast.success(f(s.applied, { name: flow.name }));
          }}
          className={cn(selectClass, "h-10 w-auto max-w-full")}
        >
          <option value="">{s.use}</option>
          {flows.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} · {f(s.people, { n: String(x.participants.length) })}
            </option>
          ))}
        </select>
      )}
      <Button type="button" variant="ghost" disabled={!toSave.length} onClick={() => setOpen(true)}>
        <Bookmark aria-hidden />
        {s.save}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{s.saveTitle}</DialogTitle>
            <DialogDescription>{s.saveHint}</DialogDescription>
          </DialogHeader>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Input
              aria-label={s.name}
              placeholder={s.name}
              value={name}
              maxLength={80}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              type="submit"
              className="shrink-0 bg-brand hover:bg-brand-strong"
              disabled={busy || name.trim().length < 2}
            >
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {s.confirm}
            </Button>
          </form>
          {flows.length > 0 && (
            <ul className="grid gap-1">
              {flows.map((x) => (
                <li
                  key={x.id}
                  className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{x.name}</span>
                  {(x.created_by === user?.id || can("documents.manage")) && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      aria-label={`${s.remove}: ${x.name}`}
                      onClick={() => void remove(x)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
