import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { BadgeCheck, Menu, X } from "lucide-react";

import { navAnchors } from "@/content/landing";
import {
  localeLabels,
  localeNames,
  locales,
  rememberLocale,
  switchLocalePath,
  useI18n,
} from "@/i18n";
import { cn } from "@/lib/utils";
import { Cta } from "./cta";
import { Logo } from "./logo";

/** Seletor PT | EN | ES. A escolha fica salva e prevalece nas próximas visitas. */
function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav aria-label={t.a11y.language} className={className}>
      <ul className="flex items-center rounded-lg border p-0.5 text-xs font-semibold">
        {locales.map((l) => (
          <li key={l}>
            <a
              href={switchLocalePath(pathname, l)}
              hrefLang={l}
              lang={l}
              aria-current={l === locale ? "true" : undefined}
              aria-label={`${localeLabels[l]} — ${localeNames[l]}`}
              onClick={() => rememberLocale(l)}
              className={cn(
                "flex min-h-9 min-w-9 items-center justify-center rounded-md px-2 transition-colors",
                l === locale ? "bg-brand text-white" : "text-foreground/70 hover:text-brand",
              )}
            >
              {localeLabels[l]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { t, path } = useI18n();
  const navItems = t.nav.map((label, i) => ({ label, href: navAnchors[i] ?? "#" }));

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
        <a href={path()} aria-label={t.a11y.home} className="shrink-0">
          <Logo />
        </a>

        <nav aria-label={t.a11y.mainNav} className="hidden xl:block">
          <ul className="flex items-center gap-6 text-sm font-medium text-foreground/80">
            {navItems.map((item) => (
              <li key={item.href}>
                <a href={path(`/${item.href}`)} className="transition-colors hover:text-brand">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Celular: o idioma vai para o menu, para "Entrar" caber sempre visível no topo. */}
          <LanguageSwitcher className="hidden sm:block" />
          <div className="hidden items-center gap-3 xl:flex">
            <a
              href={path("/validar")}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-foreground/80 transition-colors hover:text-brand"
            >
              <BadgeCheck className="size-4" aria-hidden />
              {t.footer.validate}
            </a>
            <Cta kind="login" source="header" variant="outline" size="sm" />
            <Cta kind="free" source="header" size="sm" />
          </div>
          {/* "Entrar" fixo no topo em qualquer tela (no computador fica junto de "Comece grátis"). */}
          <Cta
            kind="login"
            source="header_fixed"
            variant="outline"
            size="sm"
            className="xl:hidden"
          />
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-lg text-foreground xl:hidden"
            aria-expanded={open}
            aria-controls="menu-mobile"
            aria-label={open ? t.a11y.closeMenu : t.a11y.openMenu}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="menu-mobile" className="border-t bg-white xl:hidden">
          <nav aria-label={t.a11y.mobileNav} className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
            <ul className="flex flex-col">
              {navItems.map((item) => (
                <li key={item.href}>
                  <a
                    href={path(`/${item.href}`)}
                    className="block rounded-md px-2 py-3 text-base font-medium hover:bg-brand-soft"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={path("/validar")}
                  className="flex items-center gap-2 rounded-md px-2 py-3 text-base font-medium hover:bg-brand-soft"
                  onClick={() => setOpen(false)}
                >
                  <BadgeCheck className="size-5 text-brand" aria-hidden />
                  {t.footer.validate}
                </a>
              </li>
            </ul>
            <div className="mt-3 grid gap-3 pb-2">
              <Cta kind="free" source="header_mobile" />
              <LanguageSwitcher className="sm:hidden" />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
