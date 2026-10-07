import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Download, FileUp, Loader2, PenLine, RefreshCw, Users, XCircle } from "lucide-react";
import { toast } from "sonner";

import { documentAction } from "@/app/api";
import { errorText } from "@/app/errors";
import { useAuth } from "@/app/auth";
import { PageHeader } from "@/app/components/app-shell";
import {
  EditFlowDialog,
  ReplaceDocumentDialog,
  type ObserverRow,
} from "@/app/components/document-edit";
import { SigningFrame } from "@/app/components/signing-frame";
import {
  documentSelect,
  formatDate,
  humanStatus,
  statusTone,
  type DocumentRow,
} from "@/app/documents";
import { DocumentStatusSummary, type ReminderInfo } from "@/app/components/document-status";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/app/_shell/documents/$id")({ component: DocumentDetail });

type EventRow = { id: number; type: string; actor_name: string | null; occurred_at: string };

function DocumentDetail() {
  const { id } = Route.useParams();
  const { t, f, locale } = useAppI18n();
  const { user } = useAuth();
  const { can } = useOrg();
  const [doc, setDoc] = useState<DocumentRow | null | undefined>(undefined);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [observers, setObservers] = useState<ObserverRow[]>([]);
  const [reminders, setReminders] = useState<ReminderInfo[]>([]);
  const [editing, setEditing] = useState<"flow" | "replace" | null>(null);

  const load = useCallback(async () => {
    const [d, e] = await Promise.all([
      supabase.from("documents").select(documentSelect).eq("id", id).maybeSingle(),
      supabase
        .from("document_events")
        .select("id, type, actor_name, occurred_at")
        .eq("document_id", id)
        .order("occurred_at", { ascending: true }),
    ]);
    const obs = await supabase
      .from("document_observers")
      .select("id, name, email")
      .eq("document_id", id)
      .order("created_at");
    setObservers((obs.data as ObserverRow[] | null) ?? []);
    const rem = await supabase
      .from("document_participants")
      .select("id, reminder_count, last_reminded_at")
      .eq("document_id", id);
    setReminders((rem.data as ReminderInfo[] | null) ?? []);
    setDoc((d.data as DocumentRow | null) ?? null);
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
  const myTurn =
    doc.status === "pending" && parts.some((p) => p.user_id === user?.id && p.status === "pending");
  const manage = doc.created_by === user?.id || can("documents.manage");

  return (
    <>
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
            ) : (
              <PenLine aria-hidden />
            )}
            {t.documents.actions.sign}
          </Button>
        )}
        <Button variant="outline" disabled={busy !== null} onClick={() => void download()}>
          <Download aria-hidden />
          {t.documents.actions.download}
        </Button>
        {doc.status === "concluded" && (
          <Button
            variant="ghost"
            disabled={busy !== null}
            onClick={() => void download("printable")}
          >
            {t.documents.actions.downloadPrintable}
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
            onClick={() => {
              if (window.confirm(t.documents.actions.cancelConfirm))
                void run("cancel", () => documentAction(id, "cancel"));
            }}
          >
            <XCircle aria-hidden />
            {t.documents.actions.cancel}
          </Button>
        )}
      </div>

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
                  </p>
                  {p.delegated_from_name && (
                    <p className="text-xs text-brand">
                      {f(t.documents.delegatedFrom, { name: p.delegated_from_name })}
                    </p>
                  )}
                  <p className="truncate text-sm text-muted-foreground">{p.email}</p>
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
                  {f(t.documents.events[e.type] ?? e.type, { name: e.actor_name ?? "" })}
                </p>
                <time className="text-xs text-muted-foreground" dateTime={e.occurred_at}>
                  {formatDate(e.occurred_at, locale)}
                </time>
              </li>
            ))}
          </ol>
        </TabsContent>
      </Tabs>
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
