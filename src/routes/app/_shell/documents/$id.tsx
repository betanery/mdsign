import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell,
  CircleX,
  ClipboardCheck,
  Download,
  History,
  FileUp,
  Loader2,
  Folder as FolderIcon,
  MessageCircle,
  Paperclip,
  PenLine,
  Printer,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { documentAction } from "@/app/api";
import { useAppConfig } from "@/app/app-config";
import { errorText } from "@/app/errors";
import { useAuth } from "@/app/auth";
import { PageHeader } from "@/app/components/app-shell";
import { useCedroAvailability } from "@/app/availability";
import { markGuideStep } from "@/app/onboarding";
import { FormMessage } from "@/app/components/auth-layout";
import { UpgradeButton } from "@/app/components/free-plan-card";
import {
  EditFlowDialog,
  ReplaceDocumentDialog,
  type ObserverRow,
} from "@/app/components/document-edit";
import { useConfirm } from "@/app/components/confirm-dialog";
import { DecisionDialog, type Decision } from "@/app/components/decision-dialog";
import { ShareDialog } from "@/app/components/share-dialog";
import { SigningFrame } from "@/app/components/signing-frame";
import {
  documentSelect,
  formatDate,
  formatDay,
  humanStatus,
  isReturned,
  statusTone,
  type DocumentRow,
} from "@/app/documents";
import { DocumentStatusSummary, type ReminderInfo } from "@/app/components/document-status";
import { useAppI18n } from "@/app/i18n";
import { moveDocuments, useFolders } from "@/app/folders";
import { selectClass } from "@/app/ui";
import { useOrg } from "@/app/org";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/app/_shell/documents/$id")({ component: DocumentDetail });

type EventRow = {
  id: number;
  type: string;
  actor_name: string | null;
  occurred_at: string;
  data?: { reason?: unknown; version?: unknown; channel?: unknown; to?: unknown } | null;
};
/** Texto do evento; avisos de envio têm um texto por canal (e-mail, WhatsApp). */
const eventKey = (e: EventRow) =>
  e.type === "notification.sent" && typeof e.data?.channel === "string"
    ? `${e.type}.${e.data.channel}`
    : e.type;
type VersionRow = {
  number: number;
  file_name: string | null;
  sha256: string | null;
  created_by_name: string | null;
  created_at: string;
};

function DocumentDetail() {
  const { id } = Route.useParams();
  const { t, f, locale } = useAppI18n();
  const { user } = useAuth();
  const { can, current } = useOrg();
  const orgId = current?.id;
  // Onboarding: "Acompanhar a situação de um documento" se marca ao abrir esta página.
  useEffect(() => {
    markGuideStep(orgId, "viewed_document");
  }, [orgId]);
  const [doc, setDoc] = useState<
    | (DocumentRow & { deleted_at?: string | null; verification_key?: string | null })
    | null
    | undefined
  >(undefined);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [observers, setObservers] = useState<ObserverRow[]>([]);
  const [attachments, setAttachments] = useState<{ id: string; name: string }[]>([]);
  const { folders } = useFolders(orgId);
  const [reminders, setReminders] = useState<ReminderInfo[]>([]);
  const [notes, setNotes] = useState<
    {
      participant_id: string | null;
      channel: "whatsapp" | "email";
      status: string;
      error: string | null;
      sent_at: string | null;
      delivered_at?: string | null;
      opened_at?: string | null;
      created_at: string;
    }[]
  >([]);
  const config = useAppConfig();
  const availability = useCedroAvailability();
  const [editing, setEditing] = useState<"flow" | "replace" | null>(null);
  const [deciding, setDeciding] = useState<Decision | null>(null);
  const [sharing, setSharing] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const [versions, setVersions] = useState<VersionRow[]>([]);

  const load = useCallback(async () => {
    const [d, e] = await Promise.all([
      supabase
        .from("documents")
        .select(`${documentSelect}, deleted_at, verification_key`)
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("document_events")
        .select("id, type, actor_name, occurred_at, data")
        .eq("document_id", id)
        .order("occurred_at", { ascending: true }),
    ]);
    const ver = await supabase
      .from("document_versions")
      .select("number, file_name, sha256, created_by_name, created_at")
      .eq("document_id", id)
      .order("number", { ascending: false });
    setVersions((ver.data as VersionRow[] | null) ?? []);
    const obs = await supabase
      .from("document_observers")
      .select("id, name, email")
      .eq("document_id", id)
      .order("created_at");
    setObservers((obs.data as ObserverRow[] | null) ?? []);
    const att = await supabase
      .from("document_attachments")
      .select("id, name")
      .eq("document_id", id)
      .order("created_at");
    setAttachments((att.data as { id: string; name: string }[] | null) ?? []);
    const rem = await supabase
      .from("document_participants")
      .select("id, reminder_count, last_reminded_at")
      .eq("document_id", id);
    setReminders((rem.data as ReminderInfo[] | null) ?? []);
    const nt = await supabase
      .from("notifications")
      .select(
        "participant_id, channel, status, error, sent_at, delivered_at, opened_at, created_at",
      )
      .eq("document_id", id)
      .order("created_at", { ascending: false });
    setNotes((nt.data as typeof notes | null) ?? []);
    setDoc((d.data as (DocumentRow & { deleted_at?: string | null }) | null) ?? null);
    setEvents((e.data as EventRow[] | null) ?? []);
  }, [id]);

  // Ao abrir, confirma o status no motor e recarrega.
  useEffect(() => {
    void load().then(() =>
      documentAction(id, "sync")
        .then(load)
        .catch(() => undefined),
    );
  }, [id, load]);

  async function run(key: string, fn: () => Promise<unknown>, success?: string) {
    setBusy(key);
    try {
      await fn();
      if (success) toast.success(success);
      await load();
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setBusy(null);
    }
  }

  async function download(version?: "original" | "printable") {
    await run(version ?? "download", async () => {
      const { url } = await documentAction<{ url: string }>(
        id,
        "download",
        version ? { version } : {},
      );
      window.open(url, "_blank", "noopener");
      markGuideStep(orgId, "downloaded");
    });
  }

  async function openAttachment(attachmentId: string) {
    await run(`att-${attachmentId}`, async () => {
      const { url } = await documentAction<{ url: string }>(id, "attachment", { attachmentId });
      window.open(url, "_blank", "noopener");
    });
  }

  if (doc === undefined)
    return (
      <p className="flex items-center gap-2 text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t.common.loading}
      </p>
    );
  if (doc === null)
    return (
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <p>{t.documents.notFound}</p>
        <Link to="/app/documents" className="mt-3 inline-block font-semibold text-brand">
          {t.common.back}
        </Link>
      </div>
    );

  const parts = [...doc.document_participants].sort((a, b) => a.step - b.step);
  // Documento excluído (link direto): só leitura, com aviso.
  const deletedAt = doc.deleted_at ?? null;
  const avail = availability(doc.created_at);
  const myTurn =
    !deletedAt &&
    doc.status === "pending" &&
    parts.some((p) => p.user_id === user?.id && p.status === "pending");
  const manage = !deletedAt && (doc.created_by === user?.id || can("documents.manage"));
  const myRole = parts.find((p) => p.user_id === user?.id && p.status === "pending")?.role;
  const returned = isReturned(doc);
  const refusal = [...events]
    .reverse()
    .find((e) =>
      ["participant.returned", "participant.rejected", "participant.refused"].includes(e.type),
    );
  // Quem recusou: pelo histórico (a ação no motor nem sempre fica marcada como recusada).
  const refuser = refusal?.actor_name ?? parts.find((p) => p.status === "refused")?.name ?? "";
  const refusalReason = typeof refusal?.data?.reason === "string" ? refusal.data.reason.trim() : "";

  return (
    <>
      {confirmDialog}
      <PageHeader
        title={doc.name}
        subtitle={`${t.documents.kind[doc.kind]} · ${t.documents.createdAt} ${formatDate(doc.created_at, locale)}`}
        actions={
          <span
            className={cn("rounded-full px-3 py-1.5 text-sm font-medium", statusTone[doc.status])}
          >
            {humanStatus(doc, user?.id, t, f)}
          </span>
        }
      />

      {deletedAt && (
        <div className="mb-4">
          <FormMessage kind="error">
            {f(t.documents.deletedBanner, { date: formatDate(deletedAt, locale) })}
          </FormMessage>
        </div>
      )}

      {avail &&
        (avail.expired ? (
          <div className="mb-4 grid gap-3 rounded-2xl border border-orange-300 bg-orange-50 p-4 text-sm">
            <p>
              {f(t.documents.cedroExpired, { date: formatDay(avail.until.toISOString(), locale) })}
            </p>
            <UpgradeButton where="document_expired" className="w-fit" />
          </div>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">
            {f(t.documents.cedroAvailable, { date: formatDay(avail.until.toISOString(), locale) })}
          </p>
        ))}

      <div className="mb-6 flex flex-wrap gap-2">
        {myTurn && (
          <Button
            className="bg-brand hover:bg-brand-strong"
            disabled={busy !== null}
            onClick={() =>
              void run("sign", async () => {
                const { embedUrl: url } = await documentAction<{ embedUrl: string }>(
                  id,
                  "sign-url",
                );
                setEmbedUrl(url);
              })
            }
          >
            {busy === "sign" ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : myRole === "approver" ? (
              <ClipboardCheck aria-hidden />
            ) : (
              <PenLine aria-hidden />
            )}
            {myRole === "approver" ? t.documents.decision.approve : t.documents.decision.sign}
          </Button>
        )}
        {myTurn && (
          <>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => setDeciding("return")}
            >
              <RotateCcw aria-hidden />
              {t.documents.decision.returnFix}
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={busy !== null}
              onClick={() => setDeciding("reject")}
            >
              <CircleX aria-hidden />
              {t.documents.decision.reject}
            </Button>
          </>
        )}
        {!avail?.expired && (
          <Button variant="outline" disabled={busy !== null} onClick={() => void download()}>
            <Download aria-hidden />
            {t.documents.actions.download}
          </Button>
        )}
        {doc.status === "concluded" && !avail?.expired && (
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => void download("printable")}
          >
            <Printer aria-hidden />
            {t.documents.actions.downloadPrintable}
          </Button>
        )}
        {doc.status === "concluded" && manage && (
          <Button variant="outline" disabled={busy !== null} onClick={() => setSharing(true)}>
            <Send aria-hidden />
            {t.share.button}
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={busy !== null}
          onClick={() => void run("sync", () => documentAction(id, "sync"))}
        >
          <RefreshCw className={busy === "sync" ? "animate-spin" : ""} aria-hidden />
          {t.documents.actions.refresh}
        </Button>
        {manage && doc.status === "pending" && (
          <>
            <Button variant="outline" disabled={busy !== null} onClick={() => setEditing("flow")}>
              <Users aria-hidden />
              {t.docEdit.edit}
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => setEditing("replace")}
            >
              <FileUp aria-hidden />
              {t.docEdit.replace}
            </Button>
          </>
        )}
        {manage && doc.status === "pending" && (
          <Button
            variant="ghost"
            className="text-destructive"
            disabled={busy !== null}
            onClick={() =>
              void confirm({
                title: t.documents.actions.cancel,
                text: t.documents.actions.cancelConfirm,
                action: t.documents.actions.cancel,
              }).then((ok) => ok && void run("cancel", () => documentAction(id, "cancel")))
            }
          >
            <XCircle aria-hidden />
            {t.documents.actions.cancel}
          </Button>
        )}
      </div>

      {doc.status === "refused" && (
        <div
          className={cn(
            "mb-4 grid gap-2 rounded-2xl border p-4 text-sm",
            returned
              ? "border-amber-300 bg-amber-50 text-amber-950"
              : "border-destructive/30 bg-destructive/5",
          )}
        >
          <p className="flex items-start gap-2 font-semibold">
            {returned ? (
              <RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            )}
            {f(returned ? t.documents.returnedBanner : t.documents.rejectedBanner, {
              name: refuser,
            })}
          </p>
          {refusalReason && (
            <p className="break-words">
              {t.documents.reasonLabel}: “{refusalReason}”
            </p>
          )}
          {returned && manage && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                className="bg-brand hover:bg-brand-strong"
                disabled={busy !== null}
                onClick={() => setEditing("replace")}
              >
                <FileUp aria-hidden />
                {t.documents.returnedAction}
              </Button>
              <span className="text-xs">{t.documents.returnedHint}</span>
            </div>
          )}
        </div>
      )}

      {manage && folders.length > 0 && (
        <label className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <FolderIcon className="size-4 text-muted-foreground" aria-hidden />
          <span className="font-medium">{t.folders.field}</span>
          <select
            value={doc.folder_id ?? ""}
            disabled={busy !== null}
            onChange={(e) => {
              const target = e.target.value || null;
              void run("folder", async () => {
                if (orgId) await moveDocuments(orgId, [id], target);
                await load();
              });
            }}
            className={cn(selectClass, "h-9 w-auto")}
          >
            <option value="">{t.folders.none}</option>
            {folders.map((fo) => (
              <option key={fo.id} value={fo.id}>
                {fo.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Concluído: o código impresso no PDF e o atalho para a validação pública. */}
      {doc.status === "concluded" && doc.verification_key && (
        <p className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-white px-4 py-3 text-sm">
          <ShieldCheck className="size-4 text-brand" aria-hidden />
          <span>
            {t.documents.validation.code}:{" "}
            <span className="font-mono font-semibold">{doc.verification_key}</span>
          </span>
          <a
            href={`/${locale}/validar?codigo=${encodeURIComponent(doc.verification_key)}`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brand hover:underline"
          >
            {t.documents.validation.how}
          </a>
        </p>
      )}

      {attachments.length > 0 && (
        <section
          className="mb-6 grid gap-2 rounded-xl border bg-white px-4 py-3 text-sm"
          aria-labelledby="doc-attachments"
        >
          <h2 id="doc-attachments" className="flex items-center gap-2 font-semibold">
            <Paperclip className="size-4 text-brand" aria-hidden />
            {t.attachments.list} ({attachments.length})
          </h2>
          <ul className="grid gap-1">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{a.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => void openAttachment(a.id)}
                >
                  {busy === `att-${a.id}` ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <Download aria-hidden />
                  )}
                  {t.attachments.download}
                  <span className="sr-only">: {a.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {embedUrl && (
        <div className="mb-6">
          <SigningFrame
            embedUrl={embedUrl}
            onSigned={() => {
              setEmbedUrl(null);
              void run("sync", () => documentAction(id, "sync"));
            }}
            onError={() => toast.error(t.errors["widget"] ?? t.common.genericError)}
          />
        </div>
      )}

      <Tabs defaultValue="participants">
        <TabsList className="mb-4">
          <TabsTrigger value="participants">{t.documents.tabParticipants}</TabsTrigger>
          <TabsTrigger value="timeline">{t.documents.tabTimeline}</TabsTrigger>
        </TabsList>
        <TabsContent value="participants">
          {doc.kind === "send" && (
            <DocumentStatusSummary
              doc={doc}
              participants={parts}
              events={events}
              reminders={reminders}
            />
          )}
          <ul className="divide-y rounded-2xl border bg-white shadow-sm">
            {parts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="flex size-7 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
                  {p.step}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {p.name}
                    {p.role !== "signer" && (
                      <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-sky-800 uppercase">
                        {t.participants.roles[p.role]}
                      </span>
                    )}
                    {p.rule_name && p.rule_required && (
                      <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 align-middle text-[11px] font-semibold text-brand">
                        {p.rule_name} ·{" "}
                        {f(t.documents.quorumOf, {
                          n: String(p.rule_required),
                          total: String(
                            parts.filter((x) => x.rule_name === p.rule_name && x.step === p.step)
                              .length,
                          ),
                        })}
                      </span>
                    )}
                  </p>
                  {p.delegated_from_name && (
                    <p className="text-xs text-brand">
                      {f(t.documents.delegatedFrom, { name: p.delegated_from_name })}
                    </p>
                  )}
                  <p className="truncate text-sm text-muted-foreground">{p.email}</p>
                  {(["email", "whatsapp"] as const).map((channel) => {
                    // Última notificação do canal para esta pessoa (status honesto: enviado ≠ entregue).
                    const n = notes.find((x) => x.participant_id === p.id && x.channel === channel);
                    if (!n) return null;
                    const labels = channel === "email" ? t.notify.emailStatus : t.notify.status;
                    return (
                      <p
                        key={channel}
                        className={cn(
                          "text-xs",
                          n.status === "failed" ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {f(labels[n.status] ?? n.status, {
                          date: formatDate(
                            (n.status === "delivered" ? n.delivered_at : null) ??
                              n.sent_at ??
                              n.created_at,
                            locale,
                          ),
                          reason: t.notify.reasons[n.error ?? ""] ?? n.error ?? "",
                        })}
                        {n.opened_at &&
                          ` · ${f(t.notify.emailOpened, { date: formatDate(n.opened_at, locale) })}`}
                      </p>
                    );
                  })}
                </div>
                <span className="text-sm text-muted-foreground">
                  {t.documents.participantStatus[p.status]}
                </span>
                {manage && p.status === "pending" && p.user_id !== user?.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        "remind",
                        () => documentAction(id, "remind", { participantId: p.id }),
                        t.documents.actions.reminded,
                      )
                    }
                  >
                    <Bell aria-hidden />
                    {t.documents.actions.remind}
                  </Button>
                )}
                {manage && p.status === "pending" && p.phone && config.whatsappConfigured && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        "whatsapp",
                        () => documentAction(id, "whatsapp", { participantId: p.id }),
                        t.notify.queued,
                      )
                    }
                  >
                    <MessageCircle aria-hidden />
                    {t.notify.sendWhatsapp}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {observers.length > 0 && (
            <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="font-display font-semibold">{t.documents.observers}</h2>
              <ul className="mt-2 grid gap-1 text-sm">
                {observers.map((o) => (
                  <li key={o.id} className="truncate">
                    {o.name} <span className="text-muted-foreground">· {o.email}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>
        <TabsContent value="timeline">
          {doc.kind === "send" && (
            <DocumentStatusSummary
              doc={doc}
              participants={parts}
              events={events}
              reminders={reminders}
            />
          )}
          <ol className="rounded-2xl border bg-white p-4 shadow-sm">
            {events.map((e) => (
              <li key={e.id} className="relative border-l-2 border-brand/30 pb-4 pl-4 last:pb-0">
                <span
                  className="absolute top-1 -left-[5px] size-2 rounded-full bg-brand"
                  aria-hidden
                />
                <p className="text-sm font-medium">
                  {f(t.documents.events[eventKey(e)] ?? t.documents.events[e.type] ?? e.type, {
                    name: e.actor_name ?? "",
                  })}
                </p>
                {typeof e.data?.version === "number" && (
                  <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {f(t.documents.versionN, { n: String(e.data.version) })}
                  </span>
                )}
                {Array.isArray(e.data?.to) && e.data.to.length > 0 && (
                  <p className="mt-0.5 text-sm break-words text-muted-foreground">
                    {t.share.to}: {e.data.to.join(", ")}
                  </p>
                )}
                {typeof e.data?.reason === "string" && e.data.reason.trim() && (
                  <p className="mt-0.5 text-sm break-words text-muted-foreground">
                    {t.documents.reasonLabel}: “{e.data.reason.trim()}”
                  </p>
                )}
                <time className="text-xs text-muted-foreground" dateTime={e.occurred_at}>
                  {formatDate(e.occurred_at, locale)}
                </time>
              </li>
            ))}
          </ol>
          {versions.length > 0 && (
            <section
              className="mt-4 rounded-2xl border bg-white p-4 shadow-sm"
              aria-labelledby="doc-versions"
            >
              <h2 id="doc-versions" className="flex items-center gap-2 font-display font-semibold">
                <History className="size-4 text-brand" aria-hidden />
                {t.documents.versions}
              </h2>
              <ol className="mt-3 grid gap-2">
                {versions.map((v, i) => (
                  <li
                    key={v.number}
                    className="grid gap-0.5 rounded-lg bg-muted/40 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">
                      {f(t.documents.versionN, { n: String(v.number) })}
                      {i === 0 && (
                        <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                          {t.documents.versionCurrent}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      {[
                        v.file_name,
                        v.created_by_name
                          ? f(t.documents.versionBy, { name: v.created_by_name })
                          : null,
                        formatDate(v.created_at, locale),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {v.sha256 && (
                      <span
                        className="truncate font-mono text-[11px] text-muted-foreground"
                        title={v.sha256}
                      >
                        {t.documents.versionHash}: {v.sha256}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </TabsContent>
      </Tabs>
      {sharing && (
        <ShareDialog
          documentId={id}
          onClose={() => setSharing(false)}
          onSent={() => {
            setSharing(false);
            void load();
          }}
        />
      )}
      {deciding && (
        <DecisionDialog
          documentId={id}
          kind={deciding}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            void load();
          }}
        />
      )}
      {editing === "flow" && (
        <EditFlowDialog
          documentId={id}
          participants={parts}
          observers={observers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {editing === "replace" && (
        <ReplaceDocumentDialog
          documentId={id}
          participants={parts}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </>
  );
}
