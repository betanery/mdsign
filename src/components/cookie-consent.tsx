import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { siteConfig } from "@/config/site";
import { OPEN_PREFS_EVENT, readConsent, saveConsent } from "@/lib/consent";

// Banner e painel de preferências de cookies. O banner só aparece quando há ferramentas
// opcionais configuradas (GTM); sem elas o MDSign usa apenas o necessário e o painel diz isso.

const copy = {
  pt: {
    text: "Usamos cookies necessários para o MDSign funcionar e, com a sua permissão, cookies de análise e de marketing para entender o uso do site e medir campanhas.",
    accept: "Aceitar todos",
    reject: "Somente necessários",
    customize: "Personalizar",
    title: "Preferências de cookies",
    intro:
      'Escolha o que podemos usar. Você pode mudar a qualquer momento em "Preferências de cookies", no rodapé.',
    onlyNeeded:
      "No momento, o MDSign usa apenas cookies e armazenamento necessários ao funcionamento.",
    necessary: "Necessários",
    necessaryText: "Idioma, sessão de acesso e segurança. Sempre ativos.",
    analytics: "Análise",
    analyticsText: "Medição de visitas e uso do site (Google Tag Manager/Analytics).",
    marketing: "Marketing",
    marketingText: "Medição de campanhas e anúncios.",
    save: "Salvar preferências",
    always: "Sempre ativo",
    privacy: "Política de Privacidade",
  },
  en: {
    text: "We use cookies needed for MDSign to work and, with your permission, analytics and marketing cookies to understand site usage and measure campaigns.",
    accept: "Accept all",
    reject: "Necessary only",
    customize: "Customize",
    title: "Cookie preferences",
    intro:
      'Choose what we may use. You can change it at any time in "Cookie preferences" in the footer.',
    onlyNeeded: "At the moment, MDSign uses only cookies and storage needed for it to work.",
    necessary: "Necessary",
    necessaryText: "Language, sign-in session and security. Always on.",
    analytics: "Analytics",
    analyticsText: "Measurement of visits and site usage (Google Tag Manager/Analytics).",
    marketing: "Marketing",
    marketingText: "Campaign and ad measurement.",
    save: "Save preferences",
    always: "Always on",
    privacy: "Privacy Policy",
  },
  es: {
    text: "Usamos cookies necesarias para que MDSign funcione y, con su permiso, cookies de análisis y de marketing para entender el uso del sitio y medir campañas.",
    accept: "Aceptar todas",
    reject: "Solo necesarias",
    customize: "Personalizar",
    title: "Preferencias de cookies",
    intro:
      'Elija qué podemos usar. Puede cambiarlo en cualquier momento en "Preferencias de cookies", en el pie de página.',
    onlyNeeded: "Por ahora, MDSign usa solo cookies y almacenamiento necesarios para funcionar.",
    necessary: "Necesarias",
    necessaryText: "Idioma, sesión de acceso y seguridad. Siempre activas.",
    analytics: "Análisis",
    analyticsText: "Medición de visitas y uso del sitio (Google Tag Manager/Analytics).",
    marketing: "Marketing",
    marketingText: "Medición de campañas y anuncios.",
    save: "Guardar preferencias",
    always: "Siempre activo",
    privacy: "Política de Privacidad",
  },
} as const;

type Lang = keyof typeof copy;

function currentLang(): Lang {
  const l = (typeof document !== "undefined" ? document.documentElement.lang : "pt").slice(0, 2);
  return l === "en" || l === "es" ? l : "pt";
}

export function CookieConsent() {
  const optional = Boolean(siteConfig.gtmId);
  const [banner, setBanner] = useState(false);
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [lang, setLang] = useState<Lang>("pt");

  useEffect(() => {
    setLang(currentLang());
    const saved = readConsent();
    if (saved) {
      setAnalytics(saved.analytics);
      setMarketing(saved.marketing);
    } else if (optional) setBanner(true);
    const show = () => {
      setLang(currentLang());
      setOpen(true);
    };
    window.addEventListener(OPEN_PREFS_EVENT, show);
    return () => window.removeEventListener(OPEN_PREFS_EVENT, show);
  }, [optional]);

  const t = copy[lang];
  const choose = (a: boolean, m: boolean) => {
    saveConsent({ analytics: a, marketing: m });
    setAnalytics(a);
    setMarketing(m);
    setBanner(false);
    setOpen(false);
  };

  const Row = ({
    title,
    text,
    checked,
    onChange,
  }: {
    title: string;
    text: string;
    checked?: boolean;
    onChange?: (v: boolean) => void;
  }) => (
    <label className="flex items-start justify-between gap-4 rounded-xl border p-3 text-sm">
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="text-muted-foreground">{text}</span>
      </span>
      {onChange ? (
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 size-4 shrink-0 accent-[var(--color-brand)]"
        />
      ) : (
        <span className="shrink-0 text-xs font-semibold text-success">{t.always}</span>
      )}
    </label>
  );

  return (
    <>
      {banner && (
        <div
          role="region"
          aria-label={t.title}
          className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-2xl border bg-white p-4 shadow-xl sm:inset-x-6"
        >
          <div className="flex items-start gap-3">
            <Cookie className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
            <p className="text-sm">
              {t.text}{" "}
              <a
                href={`/${lang}/privacidade`}
                className="font-semibold text-brand underline-offset-2 hover:underline"
              >
                {t.privacy}
              </a>
            </p>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
              {t.customize}
            </Button>
            <Button variant="outline" size="sm" onClick={() => choose(false, false)}>
              {t.reject}
            </Button>
            <Button
              size="sm"
              className="bg-brand hover:bg-brand-strong"
              onClick={() => choose(true, true)}
            >
              {t.accept}
            </Button>
          </div>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
            <DialogDescription>{optional ? t.intro : t.onlyNeeded}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Row title={t.necessary} text={t.necessaryText} />
            {optional && (
              <>
                <Row
                  title={t.analytics}
                  text={t.analyticsText}
                  checked={analytics}
                  onChange={setAnalytics}
                />
                <Row
                  title={t.marketing}
                  text={t.marketingText}
                  checked={marketing}
                  onChange={setMarketing}
                />
              </>
            )}
          </div>
          {optional && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => choose(false, false)}>
                {t.reject}
              </Button>
              <Button
                className="bg-brand hover:bg-brand-strong"
                onClick={() => choose(analytics, marketing)}
              >
                {t.save}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
