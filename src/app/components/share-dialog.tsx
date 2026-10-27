// Enviar cópia do documento concluído para e-mails de fora do fluxo (link próprio, 7 dias).

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { callFunction } from "../api";
import { errorText } from "../errors";
import { useAppI18n } from "../i18n";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** "a@x.com, b@y.com" ou um por linha → lista sem repetição. */
export function parseEmails(raw: string) {
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function ShareDialog({
  documentId,
  onClose,
  onSent,
}: {
  documentId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t, f } = useAppI18n();
  const s = t.share;
  const [raw, setRaw] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emails = parseEmails(raw);
  const valid = emails.length > 0 && emails.length <= 10 && emails.every((e) => EMAIL.test(e));

  async function send() {
    if (!valid) return setError(s.invalid);
    setBusy(true);
    setError(null);
    try {
      const r = await callFunction<{ sent: number; failed: string[]; testMode?: boolean }>(
        "document-share",
        { action: "send", documentId, emails, message },
      );
      if (r.sent) toast.success(f(s.sent, { n: String(r.sent) }));
      if (r.failed.length) {
        setError(
          [f(s.someFailed, { list: r.failed.join(", ") }), r.testMode ? s.testSender : ""]
            .filter(Boolean)
            .join(" "),
        );
        setBusy(false);
        if (r.sent) onSent();
        return;
      }
      onSent();
    } catch (e) {
      setError(errorText(t, e));
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{s.title}</DialogTitle>
          <DialogDescription>{s.hint}</DialogDescription>
        </DialogHeader>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{s.emails}</span>
          <Textarea value={raw} rows={3} onChange={(e) => setRaw(e.target.value)} disabled={busy} />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{s.message}</span>
          <Textarea
            value={message}
            rows={2}
            maxLength={500}
            onChange={(e) => setMessage(e.target.value)}
            disabled={busy}
          />
        </label>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </Button>
          <Button
            className="bg-brand hover:bg-brand-strong"
            onClick={() => void send()}
            disabled={busy || !emails.length}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            {s.send}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
