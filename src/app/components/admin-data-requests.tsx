import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAppI18n } from "../i18n";
import { selectClass } from "../ui";

// Super Admin → Titulares: pedidos do canal LGPD (protocolo, prazo, situação, resposta e histórico).

type DataRequest = {
  id: string;
  protocol: string;
  name: string;
  email: string;
  relation: string;
  kind: string;
  organization_name: string | null;
  description: string;
  status: string;
  identity_verified: boolean;
  due_at: string;
  answered_at: string | null;
  response: string | null;
  created_at: string;
};
type Event = {
  created_at: string;
  action: string;
  actor_email: string | null;
  data: Record<string, unknown>;
};

const STATUSES = ["received", "in_review", "waiting_info", "forwarded", "answered", "rejected"];
const open = (s: string) => s !== "answered" && s !== "rejected";

export function AdminDataRequests({
  fmtDate,
}: {
  fmtDate: (v: string | null, withTime?: boolean) => string;
}) {
  const { t, f } = useAppI18n();
  const d = t.admin.dsr;
  const [rows, setRows] = useState<DataRequest[] | null>(null);
  const [current, setCurrent] = useState<DataRequest | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("admin_data_requests");
    setRows((data as DataRequest[] | null) ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const now = Date.now();
  return (
    <section className="rounded-2xl border bg-white shadow-sm">
      <div className="border-b p-4">
        <h2 className="font-display text-lg font-semibold">{d.title}</h2>
        <p className="text-sm text-muted-foreground">{d.hint}</p>
      </div>
      {rows === null ? (
        <p className="p-5 text-muted-foreground">{t.common.loading}</p>
      ) : rows.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">{d.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">{d.protocol}</th>
                <th className="p-3 font-medium">{d.requester}</th>
                <th className="p-3 font-medium">{d.kind}</th>
                <th className="p-3 font-medium">{d.status}</th>
                <th className="p-3 font-medium">{d.due}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const late = open(r.status) && new Date(r.due_at).getTime() < now;
                return (
                  <tr
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setCurrent(r)}
                  >
                    <td className="p-3 font-mono text-xs">
                      <button
                        type="button"
                        className="text-brand underline-offset-2 hover:underline"
                        onClick={() => setCurrent(r)}
                      >
                        {r.protocol}
                      </button>
                      <span className="block text-muted-foreground">{fmtDate(r.created_at)}</span>
                    </td>
                    <td className="p-3">
                      {r.name}
                      <span className="block text-xs text-muted-foreground">
                        {r.email} · {r.identity_verified ? d.verified : d.notVerified}
                      </span>
                    </td>
                    <td className="p-3">{d.kinds[r.kind] ?? r.kind}</td>
                    <td className="p-3">{d.statuses[r.status] ?? r.status}</td>
                    <td
                      className={cn(
                        "whitespace-nowrap p-3",
                        late && "font-semibold text-destructive",
                      )}
                    >
                      {open(r.status)
                        ? fmtDate(r.due_at)
                        : f(d.answeredOn, { date: fmtDate(r.answered_at) })}
                      {late && <span className="block text-xs">{d.late}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {current && (
        <RequestDialog
          request={current}
          fmtDate={fmtDate}
          onClose={() => setCurrent(null)}
          onSaved={() => {
            setCurrent(null);
            void load();
          }}
        />
      )}
    </section>
  );
}

function RequestDialog({
  request: r,
  fmtDate,
  onClose,
  onSaved,
}: {
  request: DataRequest;
  fmtDate: (v: string | null, withTime?: boolean) => string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useAppI18n();
  const d = t.admin.dsr;
  const [events, setEvents] = useState<Event[]>([]);
  const [status, setStatus] = useState(r.status);
  const [verified, setVerified] = useState(r.identity_verified);
  const [note, setNote] = useState("");
  const [answer, setAnswer] = useState(r.response ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase
      .rpc("admin_data_request_events", { req: r.id })
      .then(({ data }) => setEvents((data as Event[] | null) ?? []));
  }, [r.id]);

  async function save() {
    setBusy(true);
    const { error } = await supabase.rpc("admin_update_data_request", {
      req: r.id,
      new_status: status !== r.status ? status : null,
      verified: verified !== r.identity_verified ? verified : null,
      note: note.trim() || null,
      answer: answer.trim() && answer.trim() !== (r.response ?? "") ? answer.trim() : null,
    });
    setBusy(false);
    if (error) {
      toast.error(t.common.genericError);
      return;
    }
    toast.success(d.saved);
    onSaved();
  }

  const mail = `mailto:${r.email}?subject=${encodeURIComponent(`${d.mailSubject} ${r.protocol}`)}&body=${encodeURIComponent(answer)}`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono">{r.protocol}</DialogTitle>
          <DialogDescription>
            {d.kinds[r.kind] ?? r.kind} · {d.relations[r.relation] ?? r.relation}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[140px_1fr]">
          <dt className="text-muted-foreground">{d.requester}</dt>
          <dd>
            {r.name} · <span className="select-all">{r.email}</span>
          </dd>
          {r.organization_name && (
            <>
              <dt className="text-muted-foreground">{d.organization}</dt>
              <dd>{r.organization_name}</dd>
            </>
          )}
          <dt className="text-muted-foreground">{d.received}</dt>
          <dd>{fmtDate(r.created_at, true)}</dd>
          <dt className="text-muted-foreground">{d.due}</dt>
          <dd>{fmtDate(r.due_at)}</dd>
        </dl>
        <p className="rounded-xl bg-muted/50 p-3 text-sm whitespace-pre-wrap">{r.description}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{d.status}</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={selectClass}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {d.statuses[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
              className="size-4 accent-[var(--color-brand)]"
            />
            {d.identity}
          </label>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dsr-note">{d.note}</Label>
          <Textarea id="dsr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dsr-answer">{d.answer}</Label>
          <Textarea
            id="dsr-answer"
            rows={5}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{d.answerHint}</p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {answer.trim() && (
            <Button asChild variant="outline">
              <a href={mail}>{d.openEmail}</a>
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            disabled={busy}
            onClick={() => void save()}
            className="bg-brand hover:bg-brand-strong"
          >
            {t.common.save}
          </Button>
        </div>

        {events.length > 0 && (
          <div className="grid gap-1 border-t pt-3">
            <p className="text-sm font-semibold">{d.history}</p>
            <ul className="grid gap-1 text-xs text-muted-foreground">
              {events.map((e, i) => (
                <li key={i}>
                  {fmtDate(e.created_at, true)} · {d.actions[e.action] ?? e.action}
                  {e.action === "status" && ` → ${d.statuses[String(e.data["to"])] ?? ""}`}
                  {(e.action === "note" || e.action === "response") &&
                    `: ${String(e.data["text"] ?? "")}`}
                  {e.actor_email && ` · ${e.actor_email}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
