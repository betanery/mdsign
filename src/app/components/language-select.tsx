import { localeLabels, localeNames, locales, messages, type Locale } from "@/i18n";
import { cn } from "@/lib/utils";
import { useAppI18n } from "../i18n";

/** Seletor PT | EN | ES do app. A escolha manual prevalece e fica salva (PRD §34). */
export function LanguageSelect({
  className,
  onChange,
}: {
  className?: string;
  onChange?: (locale: Locale) => void;
}) {
  const { locale, setLocale } = useAppI18n();
  return (
    <div
      role="group"
      aria-label="Idioma / Language"
      className={cn("flex rounded-lg border p-0.5", className)}
    >
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          aria-label={`${localeLabels[l]} — ${localeNames[l]}`}
          onClick={() => {
            setLocale(l);
            onChange?.(l);
          }}
          className={cn(
            "min-h-8 min-w-9 rounded-md px-2 text-xs font-semibold transition-colors",
            l === locale ? "bg-brand text-white" : "text-foreground/70 hover:text-brand",
          )}
        >
          {localeLabels[l]}
        </button>
      ))}
    </div>
  );
}

/** Link "Pular para o conteúdo" no idioma do app. */
export function SkipLink() {
  const { locale } = useAppI18n();
  return (
    <a
      href="#conteudo"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow"
    >
      {messages[locale].a11y.skipToContent}
    </a>
  );
}
