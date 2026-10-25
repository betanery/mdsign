import { useState } from "react";
import { Loader2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { callFunction } from "../api";
import { useAppConfig } from "../app-config";
import type { ParticipantRow } from "../documents";
import { errorText } from "../errors";
import { useAppI18n } from "../i18n";
import { useConfirm } from "./confirm-dialog";
import { formatPhone, normalizePhone } from "../validation";
import { FormMessage } from "./auth-layout";
import {
  MarksEditor,
  ObserversEditor,
  observersPayload,
  observersValid,
  type MarksByPerson,
  type ObserverDraft,
} from "./marks-editor";
import {
  newParticipant,
  ParticipantsEditor,
  toPayload,
  validateParticipants,
  type ParticipantDraft,
} from "./participants-editor";
import { PdfDrop } from "./pdf-drop";

export type ObserverRow = { id: string; name: string; email: string };

const done = (p: ParticipantRow) => p.status === "completed" || p.status === "refused";

/** Editar participantes (inclusive testemunhas) e observadores de um documento pendente. */
export function EditFlowDialog({
  documentId,
  participants,
  observers,
  onClose,
  onSaved,
}: {
  documentId: string;
  participants: ParticipantRow[];
  observers: ObserverRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useAppI18n();
  const config = useAppConfig();
  const [rows, setRows] = useState(
    participants.map((p) => ({ ...p, newEmail: p.email, newPhone: p.phone ?? "", remove: false })),
  );
  const [added, setAdded] = useState<ParticipantDraft[]>([]);
  const [addedProblems, setAddedProblems] = useState<Record<number, string[]>>({});
  const [removedObs, setRemovedObs] = useState<string[]>([]);
  const [newObs, setNewObs] = useState<ObserverDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastStep = Math.max(1, ...participants.map((p) => p.step));

  async function save() {
    setError(null);
    const problems = validateParticipants(added, config);
    setAddedProblems(problems);
    if (Object.keys(problems).length) return setError(t.errors["invalid_participants"]!);
    if (!observersValid(newObs)) return setError(t.errors["invalid_observers"]!);
    const edited = rows
      .filter((r) => !r.remove && !done(r))
      .map((r) => ({
        participantId: r.id,
        ...(r.newEmail.trim().toLowerCase() !== r.email ? { email: r.newEmail.trim() } : {}),
        ...(r.newPhone.trim() && normalizePhone(r.newPhone) !== (r.phone ?? null)
          ? { phone: r.newPhone.trim() }
          : {}),
      }))
      .filter((e) => e.email || e.phone);
    setBusy(true);
    try {
      await callFunction("documents-edit", {
        documentId,
        edited,
        removed: rows.filter((r) => r.remove).map((r) => r.id),
        added: toPayload(added).map((p, i) => ({ ...p, step: lastStep + 1 + i })),
        addedObservers: observersPayload(newObs),
        removedObservers: removedObs,
      });
      toast.success(t.docEdit.saved);
      onSaved();
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t.docEdit.title}</DialogTitle>
          <DialogDescription>{t.docEdit.hint}</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2">
          {rows.map((r, i) => {
            const locked = done(r);
            const set = (patch: Partial<(typeof rows)[number]>) =>
              setRows(rows.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
            return (
              <li
                key={r.id}
                className={cn(
                  "grid gap-2 rounded-xl border p-3 sm:grid-cols-[auto_1fr_1fr_1fr_auto] sm:items-center",
                  r.remove && "border-destructive/40 bg-destructive/5",
                )}
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
                  {r.step}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.participants.roles[r.role]}
                    {locked && ` · ${t.docEdit.locked}`}
                    {r.remove && ` · ${t.docEdit.removing}`}
                  </span>
                </span>
                <Input
                  aria-label={`${t.docEdit.newEmail} ${r.name}`}
                  type="email"
                  value={r.newEmail}
                  disabled={locked || r.remove}
                  onChange={(e) => set({ newEmail: e.target.value })}
                />
                <Input
                  aria-label={`${t.docEdit.newPhone} ${r.name}`}
                  type="tel"
                  placeholder={t.docEdit.newPhone}
                  value={r.newPhone}
                  disabled={locked || r.remove || r.role === "approver"}
                  onChange={(e) => set({ newPhone: formatPhone(e.target.value) })}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={locked}
                  onClick={() => set({ remove: !r.remove })}
                >
                  {r.remove ? t.docEdit.keep : t.docEdit.remove}
                </Button>
              </li>
            );
          })}
        </ul>

        <section className="grid gap-2">
          <h3 className="font-medium">{t.docEdit.newPeople}</h3>
          {added.length > 0 && (
            <ParticipantsEditor
              value={added}
              onChange={setAdded}
              config={config}
              problems={addedProblems}
            />
          )}
          {added.length === 0 && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setAdded([newParticipant()])}>
                {t.docEdit.add}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAdded([newParticipant("witness")])}
              >
                {t.docEdit.addWitness}
              </Button>
            </div>
          )}
        </section>

        <section className="grid gap-2">
          <ul className="grid gap-1">
            {observers.map((o) => {
              const removing = removedObs.includes(o.id);
              return (
                <li
                  key={o.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm",
                    removing && "border-destructive/40 bg-destructive/5 line-through",
                  )}
                >
                  <span className="truncate">
                    {o.name} · {o.email}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setRemovedObs(
                        removing ? removedObs.filter((x) => x !== o.id) : [...removedObs, o.id],
                      )
                    }
                  >
                    {removing ? t.docEdit.keep : t.docEdit.remove}
                  </Button>
                </li>
              );
            })}
          </ul>
          <ObserversEditor value={newObs} onChange={setNewObs} />
        </section>

        {error && <FormMessage kind="error">{error}</FormMessage>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            className="bg-brand hover:bg-brand-strong"
            onClick={() => void save()}
            disabled={busy}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {t.docEdit.save}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Substituir o documento por uma nova versão (o SignDoc reinicia o fluxo). */
export function ReplaceDocumentDialog({
  documentId,
  participants,
  onClose,
  onSaved,
}: {
  documentId: string;
  participants: ParticipantRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useAppI18n();
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [marks, setMarks] = useState<MarksByPerson>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Confirmação no diálogo do app: o confirm nativo é ignorado em navegadores embutidos.
  const [confirm, confirmDialog] = useConfirm();

  async function send() {
    if (!file) return;
    const ok = await confirm({
      title: t.docEdit.replaceTitle,
      text: t.docEdit.replaceConfirm,
      action: t.docEdit.sendVersion,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("documentId", documentId);
    form.append("file", file);
    form.append(
      "marks",
      JSON.stringify(
        Object.fromEntries(
          Object.entries(marks).map(([k, list]) => [
            k,
            list.map(({ type, page, x, y, w, h }) => ({ type, page, x, y, w, h })),
          ]),
        ),
      ),
    );
    try {
      await callFunction("documents-edit", form);
      toast.success(t.docEdit.replaced);
      onSaved();
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-5xl">
        {confirmDialog}
        <DialogHeader>
          <DialogTitle>{t.docEdit.replaceTitle}</DialogTitle>
          <DialogDescription>{t.docEdit.replaceHint}</DialogDescription>
        </DialogHeader>
        <PdfDrop
          file={file}
          onFile={(f) => {
            setFile(f);
            setMarks({});
            void f.arrayBuffer().then(setBytes);
          }}
          onError={(code) => setError(t.errors[code] ?? t.common.genericError)}
        />
        {file && (
          <details className="rounded-xl border bg-white p-4">
            <summary className="cursor-pointer font-medium">{t.docEdit.positions}</summary>
            <div className="mt-3">
              <MarksEditor
                source={bytes}
                people={participants
                  .filter((p) => p.role !== "approver")
                  .map((p) => ({ key: p.id, label: p.name }))}
                value={marks}
                onChange={setMarks}
              />
            </div>
          </details>
        )}
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            className="bg-brand hover:bg-brand-strong"
            onClick={() => void send()}
            disabled={busy || !file}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {t.docEdit.sendVersion}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
