import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { navItems } from "@/content/landing";
import { cn } from "@/lib/utils";
import { Cta } from "./cta";
import { Logo } from "./logo";

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 bg-white/90 backdrop-blur transition-shadow",
        scrolled && "shadow-sm",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-[72px] lg:px-8">
        <a href="/" aria-label="MDSign — página inicial" className="shrink-0">
          <Logo />
        </a>

        <nav aria-label="Principal" className="hidden lg:block">
          <ul className="flex items-center gap-7 text-sm font-medium text-foreground/80">
            {navItems.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="transition-colors hover:text-brand">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Cta kind="login" source="header" variant="outline" size="sm" />
          <Cta kind="free" source="header" size="sm" />
        </div>

        <button
          type="button"
          className="inline-flex size-11 items-center justify-center rounded-lg text-foreground lg:hidden"
          aria-expanded={open}
          aria-controls="menu-mobile"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {open && (
        <div id="menu-mobile" className="border-t bg-white lg:hidden">
          <nav aria-label="Principal (celular)" className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
            <ul className="flex flex-col">
              {navItems.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="block rounded-md px-2 py-3 text-base font-medium hover:bg-brand-soft"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-3 pb-2">
              <Cta kind="login" source="header_mobile" variant="outline" />
              <Cta kind="free" source="header_mobile" />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
