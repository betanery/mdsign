import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Command as CommandPrimitive } from "cmdk";
import {
  FileText,
  Files,
  LayoutTemplate,
  Loader2,
  Search,
  User,
  UserRound,
  Workflow,
} from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { useAppI18n } from "../i18n";
import { useOrg } from "../org";

type Hit = {
  kind: "document" | "process" | "template" | "contact" | "bulk" | "user";
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
};

const order: Hit["kind"][] = ["document", "process", "template", "contact", "user", "bulk"];
const icons = {
  document: FileText,
  process: Workflow,
  template: LayoutTemplate,
  contact: UserRound,
  user: User,
  bulk: Files,
} as const;

/**
 * Busca global ("Buscar no MDSign…", Ctrl/⌘+K). Quem filtra é o banco (global_search, com o
 * RLS de cada tabela e a identidade de quem busca): nada de outra organização aparece.
 */
export function GlobalSearch() {
  const { t } = useAppI18n();
  const { current } = useOrg();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const orgId = current?.id;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!orgId || q.trim().length < 2) {
      setHits([]);
      return;
    }
    const n = ++seq.current;
    setBusy(true);
    const timer = window.setTimeout(() => {
      void supabase.rpc("global_search", { org: orgId, q: q.trim() }).then(({ data }) => {
        if (n !== seq.current) return; // resposta antiga
        setHits((data as Hit[] | null) ?? []);
        setBusy(false);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q, orgId]);

  function go(h: Hit) {
    setOpen(false);
    setQ("");
    if (h.kind === "document") void navigate({ to: "/app/documents/$id", params: { id: h.id } });
    else if (h.kind === "template")
      void navigate({ to: "/app/templates/$id", params: { id: h.id } });
    else if (h.kind === "bulk") void navigate({ to: "/app/bulk/$id", params: { id: h.id } });
    else if (h.kind === "process") void navigate({ to: "/app/processes" });
    else if (h.kind === "contact") void navigate({ to: "/app/contacts" });
    else void navigate({ to: "/app/organization" });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-5 flex h-10 w-full max-w-xl items-center gap-2 rounded-xl border bg-white px-3 text-left text-sm text-muted-foreground shadow-sm hover:border-brand/50"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">{t.search.placeholder}</span>
        <kbd className="hidden rounded border bg-muted px-1.5 text-[10px] font-medium sm:inline">
          Ctrl K
        </kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
          <DialogTitle className="sr-only">{t.search.placeholder}</DialogTitle>
          <Command
            shouldFilter={false}
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-item]]:py-2.5"
          >
            <div className="flex items-center border-b px-3">
              {busy ? (
                <Loader2 className="mr-2 size-4 shrink-0 animate-spin opacity-60" aria-hidden />
              ) : (
                <Search className="mr-2 size-4 shrink-0 opacity-50" aria-hidden />
              )}
              <CommandPrimitive.Input
                value={q}
                onValueChange={setQ}
                placeholder={t.search.placeholder}
                className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <CommandList className="max-h-[60svh]">
              {q.trim().length < 2 ? (
                <p className="p-4 text-sm text-muted-foreground">{t.search.hint}</p>
              ) : (
                !busy && <CommandEmpty>{t.search.empty}</CommandEmpty>
              )}
              {order.map((kind) => {
                const group = hits.filter((h) => h.kind === kind);
                if (!group.length) return null;
                const Icon = icons[kind];
                return (
                  <CommandGroup key={kind} heading={t.search.groups[kind]}>
                    {group.map((h) => (
                      <CommandItem
                        key={`${kind}:${h.id}`}
                        value={`${kind}:${h.id}`}
                        onSelect={() => go(h)}
                      >
                        <Icon className="size-4 text-brand" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{h.title}</span>
                          {h.subtitle && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {kind === "template"
                                ? (t.templates.categories[h.subtitle] ?? h.subtitle)
                                : h.subtitle}
                            </span>
                          )}
                        </span>
                        {kind === "document" && h.status && (
                          <span className="text-xs text-muted-foreground">
                            {t.documents.status[h.status as keyof typeof t.documents.status] ??
                              h.status}
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
