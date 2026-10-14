import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCheck, FileText, Loader2, PenLine, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/app/auth";
import { documentAction } from "@/app/api";
import { useCedroAvailability } from "@/app/availability";
import { PageHeader } from "@/app/components/app-shell";
import { useConfirm } from "@/app/components/confirm-dialog";
import { RefuseDialog, SigningQueue } from "@/app/components/document-batch";
import {
  documentSelect,
  formatDate,
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
  validateSearch: (search: Record<string, unknown>): { tab?: Tab | undefined } => ({
    tab: tabs.includes(search["tab"] as Tab) ? (search["tab"] as Tab) : undefined,
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
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<DocumentRow[] | null>(null);
  const [refusing, setRefusing] = useState<DocumentRow[] | null>(null);
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

  const visible = (docs ?? []).filter((d) => {
    if (tab === "waiting") return d.status === "pending";
    if (tab === "concluded") return d.status === "concluded";
    if (tab === "forMe") return Boolean(myAction(d));
    return true;
  });

  // Seleção: só as ações válidas para os selecionados aparecem, com quantos se aplicam.
  const chosen = visible.filter((d) => selected.has(d.id));
  const toSign = chosen.filter((d) => myAction(d) && myAction(d)!.role !== "approver");
  const toApprove = chosen.filter((d) => myAction(d)?.role === "approver");
  const toRefuse = chosen.filter((d) => myAction(d));
  const toDelete = chosen.filter(deletable);
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
      {refusing && (
        <RefuseDialog
          docs={refusing}
          onClose={() => setRefusing(null)}
          onDone={() => {
            setRefusing(null);
            after();
          }}
        />
      )}
      <PageHeader
        title={t.documents.title}
        subtitle={t.documents.subtitle}
        actions={
          <Button asChild className="bg-brand hover:bg-brand-strong">
            <Link to="/app/sign">{t.actions.selfSign}</Link>
          </Button>
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

      {docs === null ? (
        <p className="flex items-center gap-2 text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t.common.loading}
        </p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
          <p className="text-muted-foreground">{t.documents.empty}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild variant="outline">
              <Link to="/app/sign">{t.documents.emptyAction}</Link>
            </Button>
            <Button asChild className="bg-brand hover:bg-brand-strong">
              <Link to="/app/send">{t.documents.emptySend}</Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
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
                <Button size="sm" variant="outline" onClick={() => setRefusing(toRefuse)}>
                  <XCircle aria-hidden />
                  {t.documents.batch.refuse} ({toRefuse.length})
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
              {!toSign.length && !toApprove.length && !toRefuse.length && !toDelete.length && (
                <span className="text-muted-foreground">{t.documents.batch.noneValid}</span>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                {t.documents.batch.clear}
              </Button>
            </div>
          )}
          <ul className="divide-y rounded-2xl border bg-white shadow-sm">
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
                          const date = formatDate(a.until.toISOString(), locale);
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
