// Estado vazio padrão: ilustração leve (SVG nas cores da marca), frase curta e a ação certa.
// A ilustração é decorativa; o texto e o botão dizem o que fazer.

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Folhas empilhadas com um ícone em destaque: a mesma ilustração para todas as listas. */
function Illustration({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="relative mx-auto h-24 w-28" aria-hidden>
      <svg viewBox="0 0 112 96" className="absolute inset-0 size-full" fill="none">
        <ellipse cx="56" cy="88" rx="40" ry="5" className="fill-brand/10" />
        <rect
          x="22"
          y="14"
          width="56"
          height="68"
          rx="8"
          className="fill-brand-soft"
          transform="rotate(-8 50 48)"
        />
        <rect
          x="32"
          y="10"
          width="56"
          height="70"
          rx="8"
          className="fill-white stroke-brand/30"
          strokeWidth="2"
        />
        <rect x="42" y="24" width="30" height="4" rx="2" className="fill-brand/25" />
        <rect x="42" y="34" width="36" height="4" rx="2" className="fill-brand/15" />
        <rect x="42" y="44" width="24" height="4" rx="2" className="fill-brand/15" />
      </svg>
      <span className="absolute -right-1 bottom-2 flex size-11 items-center justify-center rounded-full bg-brand text-white shadow-md">
        <Icon className="size-5" />
      </span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  actions,
  className,
}: {
  icon: LucideIcon;
  title: string;
  text?: string | undefined;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border bg-white px-6 py-10 text-center shadow-sm", className)}>
      <Illustration icon={icon} />
      <p className="mt-4 font-display text-lg font-semibold">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{text}</p>}
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
