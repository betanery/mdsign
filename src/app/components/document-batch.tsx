import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { documentAction } from "../api";
import type { DocumentRow } from "../documents";
import { errorText } from "../errors";
import { useAppI18n } from "../i18n";
import { SigningFrame } from "./signing-frame";

/**
 * Assinar/aprovar em lote, com segurança: o motor não permite assinar no lugar de ninguém
 * nem em lote pela API. Então abrimos a cerimônia de cada documento, uma após a outra — cada
 * assinatura continua individual, com a autenticação exigida, e é registrada por documento.
 */
export function SigningQueue({ docs, onClose }: { docs: DocumentRow[]; onClose: () => void }) {
  const { t, f } = useAppI18n();
  const [index, setIndex] = useState(0);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const doc = docs[index];

  useEffect(() => {
    if (!doc) return;
    setEmbedUrl(null);
    documentAction<{ embedUrl: string }>(doc.id, "sign-url")
      .then((r) => setEmbedUrl(r.embedUrl))
      .catch((e) => {
        toast.error(`${doc.name}: ${errorText(t, e)}`);
        setIndex((i) => i + 1);
      });
  }, [doc, t]);

  const finished = !doc;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[94svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {finished
              ? t.documents.batch.queueDone
              : f(t.documents.batch.queueTitle, {
                  n: String(index + 1),
                  total: String(docs.length),
                })}
          </DialogTitle>
          <DialogDescription>
            {finished
              ? f(t.documents.batch.queueSummary, { n: String(done), total: String(docs.length) })
              : doc.name}
          </DialogDescription>
        </DialogHeader>
        {docs.length > 1 && (
          <div className="grid gap-1.5">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label={t.documents.batch.queueProgress}
              aria-valuemin={0}
              aria-valuemax={docs.length}
              aria-valuenow={Math.min(index, docs.length)}
            >
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{ width: `${(Math.min(index, docs.length) / docs.length) * 100}%` }}
              />
            </div>
            {!finished && (
              <p className="text-xs text-muted-foreground">{t.documents.batch.queueAuto}</p>
            )}
          </div>
        )}
        {!finished &&
          (embedUrl ? (
            <SigningFrame
              key={doc.id}
              embedUrl={embedUrl}
              onSigned={() => {
                void documentAction(doc.id, "sync").catch(() => undefined);
                setDone((n) => n + 1);
                setIndex((i) => i + 1);
              }}
              onError={() => toast.error(t.errors["widget"] ?? t.common.genericError)}
            />
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t.common.loading}
            </p>
          ))}
        <div className="flex justify-end gap-2">
          {!finished && (
            <Button variant="outline" onClick={() => setIndex((i) => i + 1)}>
              {t.documents.batch.skip}
            </Button>
          )}
          <Button
            className={finished ? "bg-brand hover:bg-brand-strong" : ""}
            variant={finished ? "default" : "ghost"}
            onClick={onClose}
          >
            {finished ? t.common.close : t.documents.batch.stop}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Rejeitar (quem está com a vez) ou cancelar (quem enviou) em lote: um motivo para todos; cada
 * recusa/cancelamento é feito e registrado por documento, um de cada vez, mostrando o progresso.
 */
export function ReasonDialog({
  mode,
  docs,
  onClose,
  onDone,
}: {
  mode: "refuse" | "cancel";
  docs: DocumentRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, f } = useAppI18n();
  const b = t.documents.batch;
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  // Cancelar aceita sem motivo (o MDSign registra um padrão); rejeitar exige motivo.
  const minReason = mode === "refuse" ? 3 : 0;

  async function run() {
    setBusy(true);
    let ok = 0;
    for (const [i, d] of docs.entries()) {
      setProgress(i + 1);
      try {
        await documentAction(d.id, mode, { reason: reason.trim() });
        ok++;
      } catch (e) {
        toast.error(`${d.name}: ${errorText(t, e)}`);
      }
    }
    setBusy(false);
    if (ok) toast.success(f(mode === "refuse" ? b.refused : b.canceled, { n: String(ok) }));
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {f(mode === "refuse" ? b.refuseTitle : b.cancelTitle, { n: String(docs.length) })}
          </DialogTitle>
          <DialogDescription>{mode === "refuse" ? b.refuseHint : b.cancelHint}</DialogDescription>
        </DialogHeader>
        {mode === "cancel" && (
          <ul className="grid max-h-36 gap-1 overflow-y-auto rounded-lg bg-muted/40 p-2 text-sm">
            {docs.map((d) => (
              <li key={d.id} className="truncate">
                {d.name}
              </li>
            ))}
          </ul>
        )}
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{mode === "refuse" ? b.reason : b.cancelReason}</span>
          <Textarea
            value={reason}
            maxLength={400}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            disabled={busy}
          />
        </label>
        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {f(b.progress, { n: String(progress), total: String(docs.length) })}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {mode === "cancel" ? b.keep : t.common.cancel}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void run()}
            disabled={busy || reason.trim().length < minReason}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {mode === "refuse" ? b.refuseConfirm : f(b.cancelConfirm, { n: String(docs.length) })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
