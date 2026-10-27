import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Ban,
  CheckCheck,
  Download,
  ClipboardCheck,
  FilePlus2,
  FileText,
  Folder as FolderIcon,
  Loader2,
  PenLine,
  Settings2,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/app/auth";
import { callFunctionBlob, documentAction } from "@/app/api";
import { downloadBlob } from "@/app/report-export";
import { useCedroAvailability } from "@/app/availability";
import { PageHeader } from "@/app/components/app-shell";
import { useConfirm } from "@/app/components/confirm-dialog";
import { ReasonDialog, SigningQueue } from "@/app/components/document-batch";
import { EmptyState } from "@/app/components/empty-state";
import { FoldersDialog } from "@/app/components/folders-dialog";
import { folderCounts, moveDocuments, useFolders } from "@/app/folders";
import { selectClass } from "@/app/ui";
import {
  documentSelect,
  formatDate,
  pendingQueue,
  formatDay,
  humanStatus,
  statusTone,
  type DocumentRow,
} from "@/app/documents";
import { errorText } from "@/app/errors";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

type Tab = "all" | "waiting" | "forMe" | "concluded";

const tabs: Tab[] = ["all", "waiting", "forMe", "concluded"];

export const Route = createFileRoute("/app/_shell/documents/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: Tab | undefined; fila?: 1 | undefined; pasta?: string | undefined } => ({
    tab: tabs.includes(search["tab"] as Tab) ? (search["tab"] as Tab) : undefined,
    // Pasta escolhida ("none" = sem pasta).
    pasta: typeof search["pasta"] === "string" ? search["pasta"].slice(0, 40) : undefined,
    // Atalho do Início: abre direto a fila "Assinar todos".
    fila: String(search["fila"] ?? "") === "1" ? 1 : undefined,
  }),
  component: DocumentsPage,
});

function DocumentsPage() {
  const { t, f, locale } = useAppI18n();
  const availability = useCedroAvailability();
  const { user } = useAuth();
  const { current, can } = useOrg();
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab ?? "all");
  const [folder, setFolder] = useState<string>(search.pasta ?? "");
  const { folders, reload: reloadFolders } = useFolders(current?.id);
  const [managing, setManaging] = useState(false);
  const [moving, setMoving] = useState(false);
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<DocumentRow[] | null>(null);
  const [zipping, setZipping] = useState(false);
  const [reasoning, setReasoning] = useState<{
    mode: "refuse" | "cancel";
    docs: DocumentRow[];
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  // Depende só do id: o objeto da organização é recriado quando o app atualiza o contexto,
  // e isso não pode recarregar a lista (nem limpar a seleção).
  const orgId = current?.id;
  const load = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from("documents")
      .select(documentSelect)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    setDocs((data as DocumentRow[] | null) ?? []);
  }, [orgId]);

  useEffect(() => {
    setDocs(null);
    setSelected(new Set());
    void load();
  }, [load]);

  // Minha ação pendente neste documento (assinar, aprovar ou testemunhar), se for a minha vez.
  const email = user?.email?.toLowerCase();
  const myAction = (d: DocumentRow) =>
    d.status === "pending"
      ? d.document_participants.find(
          (p) =>
            p.status === "pending" &&
            (p.user_id === user?.id || (email && p.email.toLowerCase() === email)),
        )
      : undefined;
  const canManage = (d: DocumentRow) => d.created_by === user?.id || can("documents.manage");
  const deletable = (d: DocumentRow) =>
    canManage(d) && (d.status === "canceled" || d.status === "refused" || d.status === "expired");

  const counts = folderCounts(docs ?? []);
  const inFolder = (d: DocumentRow) =>
    !folder || (folder === "none" ? !d.folder_id : d.folder_id === folder);
  const visible = (docs ?? []).filter(inFolder).filter((d) => {
    if (tab === "waiting") return d.status === "pending";
    if (tab === "concluded") return d.status === "concluded";
    if (tab === "forMe") return Boolean(myAction(d));
    return true;
  });

  // Tudo o que espera por mim, na ordem da fila (assinaturas antes de aprovações).
  const mine = pendingQueue(docs ?? [], myAction);
  const autoQueue = useRef(search.fila === 1);
  useEffect(() => {
    if (!autoQueue.current || docs === null) return;
    autoQueue.current = false;
    if (mine.length) setQueue(mine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs]);

  // Seleção: só as ações válidas para os selecionados aparecem, com quantos se aplicam.
  const chosen = visible.filter((d) => selected.has(d.id));
  const toSign = chosen.filter((d) => myAction(d) && myAction(d)!.role !== "approver");
  const toApprove = chosen.filter((d) => myAction(d)?.role === "approver");
  const toRefuse = chosen.filter((d) => myAction(d));
  const toDelete = chosen.filter(deletable);
  const toCancel = chosen.filter((d) => d.status === "pending" && canManage(d));
  const allSelected = visible.length > 0 && visible.every((d) => selected.has(d.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const after = () => {
    setSelected(new Set());
    void load();
  };

  const toMove = chosen.filter(canManage);
  async function moveSelected(target: string) {
    if (!current) return;
    setMoving(true);
    try {
      const n = await moveDocuments(
        current.id,
        toMove.map((d) => d.id),
        target === "none" ? null : target,
      );
      if (n) toast.success(n === 1 ? t.folders.movedOne : f(t.folders.moved, { n: String(n) }));
      else toast.error(t.folders.notMoved);
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setMoving(false);
    }
    after();
  }

  // Baixar em lote: o servidor monta um ZIP (o navegador não baixa direto do motor).
  async function downloadSelected() {
    setZipping(true);
    try {
      const blob = await callFunctionBlob("documents-zip", {
        documentIds: chosen.map((d) => d.id),
      });
      downloadBlob("mdsign-documentos.zip", blob);
      toast.success(f(t.documents.batch.zipped, { n: String(chosen.length) }));
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setZipping(false);
    }
  }

  async function removeSelected() {
    const blocked = chosen.length - toDelete.length;
    const ok = await confirm({
      title: f(t.documents.batch.deleteTitle, { n: String(toDelete.length) }),
      text: [
        t.documents.batch.deleteText,
        blocked ? f(t.documents.batch.deleteSkipped, { n: String(blocked) }) : "",
      ]
        .filter(Boolean)
        .join(" "),
      action: t.documents.batch.deleteConfirm,
    });
    if (!ok) return;
    setDeleting(true);
    let n = 0;
    for (const d of toDelete) {
      try {
        await documentAction(d.id, "delete");
        n++;
      } catch (e) {
        toast.error(`${d.name}: ${errorText(t, e)}`);
      }
    }
    setDeleting(false);
    if (n) toast.success(f(t.documents.batch.deleted, { n: String(n) }));
    after();
  }

  return (
    <>
      {confirmDialog}
      {queue && (
        <SigningQueue
          docs={queue}
          onClose={() => {
            setQueue(null);
            after();
          }}
        />
      )}
      {reasoning && (
        <ReasonDialog
          mode={reasoning.mode}
          docs={reasoning.docs}
          onClose={() => setReasoning(null)}
          onDone={() => {
            setReasoning(null);
            after();
          }}
        />
      )}
      <PageHeader
        title={t.documents.title}
        subtitle={t.documents.subtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/app/sign">
                <PenLine aria-hidden />
                {t.quick.signDoc}
              </Link>
            </Button>
            <Button asChild className="bg-brand hover:bg-brand-strong">
              <Link to="/app/send">
                <FilePlus2 aria-hidden />
                {t.quick.newDoc}
              </Link>
            </Button>
          </div>
        }
      />
      <div
        role="tablist"
        aria-label={t.documents.title}
        className="mb-4 flex flex-wrap gap-1 border-b"
      >
        {tabs.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "min-h-10 border-b-2 px-3 text-sm font-medium transition-colors",
              tab === k
                ? "border-brand text-brand"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.documents.tabs[k]}
          </button>
        ))}
      </div>

      {(folders.length > 0 || can("documents.manage")) && (
        <div
          className="mb-4 flex flex-wrap items-center gap-2"
          role="group"
          aria-label={t.folders.title}
        >
          <FolderIcon className="size-4 text-muted-foreground" aria-hidden />
          {[
            { id: "", name: t.folders.all, n: docs?.length ?? 0 },
            ...(folders.length
              ? [{ id: "none", name: t.folders.none, n: counts["none"] ?? 0 }]
              : []),
            ...folders.map((fo) => ({ id: fo.id, name: fo.name, n: counts[fo.id] ?? 0 })),
          ].map((o) => (
            <button
              key={o.id || "all"}
              type="button"
              aria-pressed={folder === o.id}
              onClick={() => {
                setFolder(o.id);
                setSelected(new Set());
              }}
              className={cn(
                "min-h-8 rounded-full border px-3 text-sm",
                folder === o.id
                  ? "border-brand bg-brand-soft font-semibold text-brand-strong"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.name} <span className="tabular-nums">({o.n})</span>
            </button>
          ))}
          {can("documents.manage") && (
            <Button size="sm" variant="ghost" onClick={() => setManaging(true)}>
              <Settings2 aria-hidden />
              {t.folders.manage}
            </Button>
          )}
        </div>
      )}
      {managing && current && (
        <FoldersDialog
          orgId={current.id}
          folders={folders}
          onClose={() => setManaging(false)}
          onChanged={() => {
            void reloadFolders();
            void load();
          }}
        />
      )}

      {docs === null ? (
        <p className="flex items-center gap-2 text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t.common.loading}
        </p>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={tab === "forMe" ? ClipboardCheck : (docs?.length ?? 0) > 0 ? FileText : FilePlus2}
          title={
            tab === "forMe"
              ? t.empty.forMe
              : (docs?.length ?? 0) > 0
                ? t.empty.filtered
                : t.empty.documents
          }
          text={
            tab === "forMe"
              ? t.empty.forMeText
              : (docs?.length ?? 0) > 0
                ? undefined
                : t.empty.documentsText
          }
          actions={
            tab === "forMe" ? undefined : (
              <>
                <Button asChild variant="outline">
                  <Link to="/app/sign">
                    <PenLine aria-hidden />
                    {t.quick.signDoc}
                  </Link>
                </Button>
                <Button asChild className="bg-brand hover:bg-brand-strong">
                  <Link to="/app/send">
                    <FilePlus2 aria-hidden />
                    {t.quick.newDoc}
                  </Link>
                </Button>
              </>
            )
          }
        />
      ) : (
        <>
          {tab === "forMe" && mine.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand-soft/60 p-3 text-sm">
              <p>
                <span className="font-semibold text-brand-strong">
                  {f(mine.length === 1 ? t.documents.signAllOne : t.documents.signAllCount, {
                    n: String(mine.length),
                  })}
                </span>{" "}
                <span className="text-muted-foreground">{t.documents.signAllHint}</span>
              </p>
              <Button
                size="sm"
                className="bg-brand hover:bg-brand-strong"
                onClick={() => setQueue(mine)}
              >
                <PenLine aria-hidden />
                {f(t.documents.signAll, { n: String(mine.length) })}
              </Button>
            </div>
          )}
          <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) =>
                  setSelected(e.target.checked ? new Set(visible.map((d) => d.id)) : new Set())
                }
                className="size-4 accent-[var(--color-brand)]"
              />
              {t.documents.batch.selectAll}
            </label>
          </div>
          {chosen.length > 0 && (
            <div
              className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand-soft p-3 text-sm shadow-sm"
              role="region"
              aria-label={t.documents.batch.actions}
            >
              <span className="mr-auto font-semibold text-brand-strong">
                {f(
                  chosen.length === 1 ? t.documents.batch.selectedOne : t.documents.batch.selected,
                  {
                    n: String(chosen.length),
                  },
                )}
              </span>
              {toSign.length > 0 && (
                <Button
                  size="sm"
                  className="bg-brand hover:bg-brand-strong"
                  onClick={() => setQueue(toSign)}
                >
                  <PenLine aria-hidden />
                  {t.documents.batch.sign} ({toSign.length})
                </Button>
              )}
              {toApprove.length > 0 && (
                <Button
                  size="sm"
                  className="bg-brand hover:bg-brand-strong"
                  onClick={() => setQueue(toApprove)}
                >
                  <CheckCheck aria-hidden />
                  {t.documents.batch.approve} ({toApprove.length})
                </Button>
              )}
              {toRefuse.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReasoning({ mode: "refuse", docs: toRefuse })}
                >
                  <XCircle aria-hidden />
                  {t.documents.batch.refuse} ({toRefuse.length})
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={zipping || chosen.length > 30}
                title={chosen.length > 30 ? t.documents.batch.zipMax : undefined}
                onClick={() => void downloadSelected()}
              >
                {zipping ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Download aria-hidden />
                )}
                {t.documents.batch.download} ({chosen.length})
              </Button>
              {toCancel.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => setReasoning({ mode: "cancel", docs: toCancel })}
                >
                  <Ban aria-hidden />
                  {t.documents.batch.cancel} ({toCancel.length})
                </Button>
              )}
              {toDelete.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void removeSelected()}
                  disabled={deleting}
                >
                  {deleting ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <Trash2 aria-hidden />
                  )}
                  {t.documents.batch.delete} ({toDelete.length})
                </Button>
              )}
              {toMove.length > 0 && folders.length > 0 && (
                <select
                  aria-label={t.folders.moveTo}
                  value=""
                  disabled={moving}
                  onChange={(e) => e.target.value && void moveSelected(e.target.value)}
                  className={cn(selectClass, "h-8 w-auto")}
                >
                  <option value="">
                    {t.folders.moveTo} ({toMove.length})
                  </option>
                  <option value="none">{t.folders.none}</option>
                  {folders.map((fo) => (
                    <option key={fo.id} value={fo.id}>
                      {fo.name}
                    </option>
                  ))}
                </select>
              )}
              {!toSign.length &&
                !toApprove.length &&
                !toRefuse.length &&
                !toCancel.length &&
                !toDelete.length &&
                !(toMove.length && folders.length) && (
                  <span className="text-muted-foreground">{t.documents.batch.noneValid}</span>
                )}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                {t.documents.batch.clear}
              </Button>
            </div>
          )}
          <ul data-tour="documents-list" className="divide-y rounded-2xl border bg-white shadow-sm">
            {visible.map((d) => {
              const mine = myAction(d);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 p-4 hover:bg-muted/40">
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)}
                    aria-label={f(t.documents.batch.selectOne, { name: d.name })}
                    className="size-4 shrink-0 accent-[var(--color-brand)]"
                  />
                  <Link
                    to="/app/documents/$id"
                    params={{ id: d.id }}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <FileText className="size-5 shrink-0 text-brand" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{d.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {t.documents.kind[d.kind]} · {formatDate(d.created_at, locale)}
                        {(() => {
                          const a = availability(d.created_at);
                          if (!a) return null;
                          const date = formatDay(a.until.toISOString(), locale);
                          return (
                            <span className={a.expired ? "text-orange-700" : undefined}>
                              {" · "}
                              {a.expired
                                ? f(t.documents.cedroExpiredShort, { date })
                                : f(t.documents.cedroUntilShort, { date })}
                            </span>
                          );
                        })()}
                      </p>
                    </div>
                  </Link>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      statusTone[d.status],
                    )}
                  >
                    {humanStatus(d, user?.id, t, f)}
                  </span>
                  {mine && (
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/app/documents/$id" params={{ id: d.id }}>
                          {t.documents.batch.view}
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        className="bg-brand hover:bg-brand-strong"
                        onClick={() => setQueue([d])}
                      >
                        <PenLine aria-hidden />
                        {mine.role === "approver"
                          ? t.documents.batch.approve
                          : t.documents.batch.sign}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
