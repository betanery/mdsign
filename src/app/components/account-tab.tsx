import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Download, Loader2, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callFunction, callFunctionBlob } from "../api";
import { formatDate } from "../documents";
import { errorText } from "../errors";
import { useAppI18n } from "../i18n";
import { useOrg } from "../org";
import { downloadBlob } from "../report-export";
import { FormMessage } from "./auth-layout";

// Organização → Exportar e encerrar (Termos, seção 7): exportar todos os documentos em ZIP e,
// para o proprietário, encerrar a conta (30 dias para exportar ou desfazer; no 60º dia o MDSign
// apaga os dados operacionais, e as evidências de assinatura continuam guardadas).

type Status = {
  closedAt: string | null;
  exportUntil: string | null;
  purgeAfter: string | null;
  documents: number;
  parts: number;
  /** Baixou todas as partes do ZIP nas últimas 24 horas (exigido para encerrar). */
  exportedAll: boolean;
};

function useAccountStatus(orgId: string | undefined) {
  const [status, setStatus] = useState<Status | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!orgId) return;
    void callFunction<Status>("account", { action: "status", organizationId: orgId })
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [orgId, tick]);
  return [status, () => setTick((n) => n + 1)] as const;
}

/** Baixa as partes do ZIP uma a uma (cada parte tem até 25 documentos). */
function ExportButton({
  orgId,
  parts,
  onDone,
}: {
  orgId: string;
  parts: number;
  onDone: () => void;
}) {
  const { t, f } = useAppI18n();
  const [busy, setBusy] = useState<number | null>(null);
  async function run() {
    try {
      for (let part = 1; part <= parts; part++) {
        setBusy(part);
        const blob = await callFunctionBlob("account", {
          action: "export",
          organizationId: orgId,
          part,
        });
        downloadBlob(`mdsign-documentos-parte-${part}-de-${parts}.zip`, blob);
      }
      toast.success(t.account.exported);
      onDone();
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Button
      onClick={() => void run()}
      disabled={busy !== null}
      className="w-fit bg-brand hover:bg-brand-strong"
    >
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
      {busy
        ? f(t.account.exporting, { part: String(busy), parts: String(parts) })
        : t.account.export}
    </Button>
  );
}

export function AccountTab() {
  const { t, f, locale } = useAppI18n();
  const { current, can, refresh } = useOrg();
  const [status, reload] = useAccountStatus(current?.id);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!current) return null;
  const owner = current.role === "owner";
  const closed = Boolean(status?.closedAt);

  async function close() {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await callFunction("account", {
        action: "close",
        organizationId: current.id,
        confirmName: confirm,
      });
      toast.success(t.account.closed);
      setConfirm("");
      reload();
      await refresh();
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (!current) return;
    setBusy(true);
    try {
      await callFunction("account", { action: "reopen", organizationId: current.id });
      toast.success(t.account.reopened);
      reload();
      await refresh();
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-2xl gap-6">
      <section className="grid gap-3 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="font-display text-lg font-semibold">{t.account.exportTitle}</h2>
        <p className="text-sm text-muted-foreground">
          {status
            ? f(t.account.exportText, { n: String(status.documents), parts: String(status.parts) })
            : t.common.loading}
        </p>
        {status && can("members.manage") && status.documents > 0 && (
          <ExportButton orgId={current.id} parts={status.parts} onDone={reload} />
        )}
        {!can("members.manage") && (
          <p className="text-sm text-muted-foreground">{t.account.exportAdminOnly}</p>
        )}
      </section>

      {owner && (
        <section className="grid gap-3 rounded-2xl border border-destructive/30 bg-white p-5 shadow-sm">
          <h2 className="font-display text-lg font-semibold">{t.account.closeTitle}</h2>
          {closed && status ? (
            <>
              <p className="text-sm">
                {f(t.account.closedText, {
                  closed: formatDate(status.closedAt!, locale),
                  until: formatDate(status.exportUntil!, locale),
                  purge: formatDate(status.purgeAfter!, locale),
                })}
              </p>
              <Button
                variant="outline"
                onClick={() => void reopen()}
                disabled={busy}
                className="w-fit"
              >
                <RotateCcw aria-hidden />
                {t.account.reopen}
              </Button>
              <p className="text-xs text-muted-foreground">{t.account.reopenHint}</p>
            </>
          ) : (
            <>
              {status && !status.exportedAll && (
                <p className="flex items-start gap-2 rounded-xl border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {t.account.exportFirst}
                </p>
              )}
              <ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground">
                {t.account.closeRules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <div className="grid gap-1.5">
                <Label htmlFor="close-confirm">
                  {f(t.account.confirmLabel, { name: current.name })}
                </Label>
                <Input
                  id="close-confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="off"
                />
              </div>
              {error && <FormMessage kind="error">{error}</FormMessage>}
              <Button
                variant="destructive"
                className="w-fit"
                disabled={
                  busy ||
                  !status?.exportedAll ||
                  confirm.trim().toLowerCase() !== current.name.trim().toLowerCase()
                }
                onClick={() => void close()}
              >
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <XCircle aria-hidden />}
                {t.account.close}
              </Button>
            </>
          )}
        </section>
      )}
    </div>
  );
}

/** Faixa em todas as telas enquanto a conta está encerrada (janela de 30 dias). */
export function ClosedBanner() {
  const { t, f, locale } = useAppI18n();
  const { current } = useOrg();
  if (!current?.closed_at || !current.export_until) return null;
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
    >
      <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden />
      <p className="min-w-0 flex-1">
        {f(t.account.banner, { until: formatDate(current.export_until, locale) })}
      </p>
      <Button asChild size="sm" variant="outline" className="h-8">
        <Link to="/app/organization" search={{ tab: "account" }}>
          {t.account.bannerAction}
        </Link>
      </Button>
    </div>
  );
}
