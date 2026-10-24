// Decisão de quem está com a vez: devolver para correção (reversível, pede nova versão) ou
// rejeitar definitivamente (encerra o processo). Justificativa obrigatória nos dois casos;
// a rejeição pede uma confirmação a mais.

import { useState } from "react";
import { CircleX, Loader2, RotateCcw } from "lucide-react";
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
import { documentAction } from "../api";
import { errorText } from "../errors";
import { useAppI18n } from "../i18n";

export type Decision = "return" | "reject";

export function DecisionDialog({
  documentId,
  kind,
  onClose,
  onDone,
}: {
  documentId: string;
  kind: Decision;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useAppI18n();
  const d = t.documents.decision;
  const [reason, setReason] = useState("");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const reject = kind === "reject";
  const ready = reason.trim().length >= 3 && (!reject || sure);

  async function run() {
    setBusy(true);
    try {
      await documentAction(documentId, "refuse", { reason: reason.trim(), kind });
      toast.success(reject ? d.doneReject : d.doneReturn);
      onDone();
    } catch (e) {
      toast.error(errorText(t, e));
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {reject ? (
              <CircleX className="size-5 text-destructive" aria-hidden />
            ) : (
              <RotateCcw className="size-5 text-amber-700" aria-hidden />
            )}
            {reject ? d.rejectTitle : d.returnTitle}
          </DialogTitle>
          <DialogDescription>{reject ? d.rejectHint : d.returnHint}</DialogDescription>
        </DialogHeader>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{d.reason}</span>
          <Textarea
            value={reason}
            maxLength={400}
            rows={3}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {reject && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={sure}
              disabled={busy}
              onChange={(e) => setSure(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--color-destructive)]"
            />
            {d.rejectConfirm}
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </Button>
          <Button
            variant={reject ? "destructive" : "default"}
            className={reject ? "" : "bg-brand hover:bg-brand-strong"}
            onClick={() => void run()}
            disabled={busy || !ready}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {reject ? d.confirmReject : d.confirmReturn}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
