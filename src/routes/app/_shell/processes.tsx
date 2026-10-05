import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Play, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/app/components/app-shell";
import { formatDate } from "@/app/documents";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { friendlyError } from "@/app/validation";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

// Processos MDSign: configurações de envio em massa salvas para repetir ("Fazer de novo").
export const Route = createFileRoute("/app/_shell/processes")({ component: ProcessesPage });

type ProcessRow = {
  id: string;
  name: string;
  kind: "bulk_pdf" | "bulk_template";
  updated_at: string;
  last_run_at: string | null;
};

function ProcessesPage() {
  const { t, f, locale } = useAppI18n();
  const { current, can } = useOrg();
  const [rows, setRows] = useState<ProcessRow[] | null>(null);

  const load = useCallback(async () => {
    if (!current) return;
    const { data } = await supabase
      .from("processes")
      .select("id, name, kind, updated_at, last_run_at")
      .eq("organization_id", current.id)
      .order("name");
    setRows((data as ProcessRow[] | null) ?? []);
  }, [current]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(p: ProcessRow) {
    if (!window.confirm(f(t.processes.removeConfirm, { name: p.name }))) return;
    const { error } = await supabase.from("processes").delete().eq("id", p.id);
    if (error) {
      toast.error(friendlyError(error, t));
      return;
    }
    void load();
  }

  if (!current) return <p>{t.notFoundOrg}</p>;
  if (!can("bulk.send")) return <p>{t.common.forbidden}</p>;
  return (
    <>
      <PageHeader title={t.processes.title} subtitle={t.processes.subtitle} />
      {rows === null ? (
        <p className="text-muted-foreground">{t.common.loading}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border bg-white p-5 text-muted-foreground">{t.processes.empty}</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm"
            >
              <Workflow className="size-5 shrink-0 text-brand" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{p.name}</p>
                <p className="text-sm text-muted-foreground">
                  {t.processes.kinds[p.kind]} · {t.processes.lastUpdate}{" "}
                  {formatDate(p.last_run_at ?? p.updated_at, locale)}
                </p>
              </div>
              <Button asChild className="bg-brand hover:bg-brand-strong">
                <Link to="/app/bulk/new" search={{ process: p.id }}>
                  <Play aria-hidden />
                  {t.processes.runAgain}
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void remove(p)}
                aria-label={`${t.common.remove} ${p.name}`}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
