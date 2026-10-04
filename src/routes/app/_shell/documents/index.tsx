import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Loader2 } from "lucide-react";

import { useAuth } from "@/app/auth";
import { PageHeader } from "@/app/components/app-shell";
import {
  documentSelect,
  formatDate,
  humanStatus,
  statusTone,
  type DocumentRow,
} from "@/app/documents";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

type Tab = "all" | "waiting" | "forMe" | "concluded";

export const Route = createFileRoute("/app/_shell/documents/")({ component: DocumentsPage });

function DocumentsPage() {
  const { t, f, locale } = useAppI18n();
  const { user } = useAuth();
  const { current } = useOrg();
  const [tab, setTab] = useState<Tab>("all");
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);

  useEffect(() => {
    if (!current) return;
    setDocs(null);
    supabase
      .from("documents")
      .select(documentSelect)
      .eq("organization_id", current.id)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setDocs((data as DocumentRow[] | null) ?? []));
  }, [current]);

  const visible = (docs ?? []).filter((d) => {
    if (tab === "waiting") return d.status === "pending";
    if (tab === "concluded") return d.status === "concluded";
    if (tab === "forMe")
      return (
        d.status === "pending" &&
        d.document_participants.some((p) => p.user_id === user?.id && p.status === "pending")
      );
    return true;
  });

  const tabs: Tab[] = ["all", "waiting", "forMe", "concluded"];

  return (
    <>
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
          <Button asChild variant="outline" className="mt-4">
            <Link to="/app/sign">{t.documents.emptyAction}</Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y rounded-2xl border bg-white shadow-sm">
          {visible.map((d) => (
            <li key={d.id}>
              <Link
                to="/app/documents/$id"
                params={{ id: d.id }}
                className="flex flex-wrap items-center gap-3 p-4 hover:bg-muted/40"
              >
                <FileText className="size-5 shrink-0 text-brand" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {t.documents.kind[d.kind]} · {formatDate(d.created_at, locale)}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    statusTone[d.status],
                  )}
                >
                  {humanStatus(d, user?.id, t, f)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
