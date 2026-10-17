import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { apiExample, capabilityIcons } from "@/content/landing";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { Cta } from "./cta";
import { icons } from "./icons";
import { Container, Eyebrow } from "./section";

function CodeBlock({ code }: { code: string }) {
  const lines = code.split("\n");
  return (
    <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed sm:text-sm">
      <code>
        {lines.map((line, i) => (
          <span key={i} className="flex">
            <span className="mr-4 w-5 shrink-0 text-right text-white/30 select-none">{i + 1}</span>
            <span
              className="text-white/90"
              // destaque simples das chaves JSON
              dangerouslySetInnerHTML={{
                __html: line
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/("[^"]+")(\s*:)/g, '<span class="text-pink-300">$1</span>$2')
                  .replace(/:\s*("[^"]*")/g, ': <span class="text-amber-200">$1</span>'),
              }}
            />
          </span>
        ))}
      </code>
    </pre>
  );
}

export function Integrations() {
  const [tab, setTab] = useState<"request" | "response">("request");
  const { t } = useI18n();
  const it = t.integrations;

  return (
    <section
      id="integracoes"
      aria-labelledby="integracoes-title"
      className="relative overflow-hidden bg-navy py-16 text-white sm:py-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-40 size-[480px] rounded-full bg-brand/30 blur-3xl"
      />
      <Container className="relative grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
        <div>
          <Eyebrow className="text-pink-300">{it.eyebrow}</Eyebrow>
          <h2 id="integracoes-title" className="mt-2 text-3xl leading-tight font-bold sm:text-4xl">
            <span className="text-pink-300">MDSign</span> {it.titleRest}
          </h2>
          <p className="mt-4 max-w-xl text-base text-white/80 sm:text-lg">{it.text}</p>
          <Cta kind="api" source="integrations" variant="ghostLight" className="mt-7" arrow />
          <ul className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {it.capabilities.map((label, i) => {
              const Icon = icons[capabilityIcons[i] ?? "api"];
              return (
                <li key={label} className="flex flex-col items-center gap-2 text-center">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-white/10">
                    <Icon className="size-6 text-pink-300" aria-hidden />
                  </span>
                  <span className="text-sm font-medium">{label}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="grid min-w-0 gap-5">
          <div className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[oklch(0.17_0.05_280)] shadow-2xl">
            <div
              role="tablist"
              aria-label={it.exampleLabel}
              className="flex border-b border-white/10 text-sm"
            >
              {(
                [
                  ["request", it.request],
                  ["response", it.response],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  id={`api-tab-${key}`}
                  role="tab"
                  type="button"
                  aria-selected={tab === key}
                  aria-controls="api-tabpanel"
                  onClick={() => setTab(key)}
                  className={cn(
                    "min-h-11 px-4 font-medium transition-colors",
                    tab === key ? "bg-white text-navy" : "text-white/70 hover:text-white",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="border-b border-white/10 px-4 py-2.5 font-mono text-xs">
              <p className="flex items-center gap-2">
                <span className="rounded bg-success px-1.5 py-0.5 font-bold text-white">
                  {apiExample.method}
                </span>
                <span className="truncate text-white/80">{apiExample.url}</span>
              </p>
              {tab === "request" && <p className="mt-2 text-white/50">{apiExample.headers}</p>}
            </div>
            <div
              id="api-tabpanel"
              role="tabpanel"
              aria-labelledby={`api-tab-${tab}`}
              // Rolável: precisa receber foco para quem navega pelo teclado (WCAG 2.1.1).
              tabIndex={0}
              className="max-h-80 overflow-y-auto focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
            >
              <CodeBlock code={tab === "request" ? apiExample.body : apiExample.response} />
            </div>
          </div>

          <div className="rounded-xl bg-white p-5 text-foreground shadow-2xl">
            <p className="font-display font-semibold">{it.webhooksTitle}</p>
            <ul className="mt-4 grid gap-x-4 gap-y-2.5 text-sm sm:grid-cols-2">
              {it.events.map((e) => (
                <li key={e} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0 text-brand" aria-hidden />
                  {e}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}
