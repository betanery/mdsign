// Peças comuns do módulo Planos & Funcionalidades.

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppI18n } from "../i18n";
import { selectClass } from "../ui";
import { fmtDay } from "../growth/ui";
import type { Catalog } from "./api";
import { fill, usePlansAdminTexts } from "./texts";

export function Loading() {
  const P = usePlansAdminTexts();
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {P.loading}
    </p>
  );
}

/** Seletor de versão (rascunho primeiro; senão a vigente). */
export function VersionSelect({
  catalog,
  value,
  onChange,
}: {
  catalog: Catalog;
  value: string;
  onChange: (id: string) => void;
}) {
  const P = usePlansAdminTexts();
  const { locale } = useAppI18n();
  return (
    <label className="flex w-full min-w-0 flex-wrap items-center gap-2 text-sm sm:w-auto">
      <span className="font-medium">{P.version}</span>
      <select
        className={cn(selectClass, "w-full min-w-0 sm:w-auto sm:max-w-md")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {[...catalog.versions].reverse().map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} · {P.status[v.status] ?? v.status} ·{" "}
            {fmtDay(v.published_at ?? v.created_at, locale)} ·{" "}
            {fill(P.subs, { n: v.subscriptions })}
          </option>
        ))}
      </select>
    </label>
  );
}
