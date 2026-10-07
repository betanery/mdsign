import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { siteConfig } from "@/config/site";
import { formatPhone } from "@/app/validation";
import { plans, type PlanId } from "@/content/landing";
import { format, useI18n } from "@/i18n";
import { getUtm, track } from "@/lib/analytics";

type OpenOptions = { plan?: PlanId | undefined; source: string };

const LeadDialogContext = createContext<((options: OpenOptions) => void) | null>(null);

export function useLeadDialog() {
  const open = useContext(LeadDialogContext);
  if (!open) throw new Error("useLeadDialog precisa estar dentro de <LeadDialogProvider>");
  return open;
}

type LeadFields = {
  website?: string;
  nome: string;
  email: string;
  telefone: string;
  empresa: string;
  plano: string;
  mensagem: string;
};

type Status = "idle" | "sending" | "sent" | "error";

export function LeadDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [options, setOptions] = useState<OpenOptions>({ source: "unknown" });
  const [status, setStatus] = useState<Status>("idle");
  const { locale, t } = useI18n();
  const email = siteConfig.contact.email;

  const open = useCallback((next: OpenOptions) => {
    setOptions(next);
    setStatus("idle");
    setOpen(true);
  }, []);

  const plan = plans.find((p) => p.id === options.plan);
  const title =
    plan && plan.cta !== "specialist"
      ? format(t.lead.planTitle, { plan: plan.name })
      : t.lead.specialistTitle;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget)) as LeadFields;
    const lead = {
      ...data,
      idioma: locale,
      source: options.source,
      utm: getUtm(),
      page: window.location.href,
    };
    setStatus("sending");
    track("form_submit", { form: "lead", plan: data.plano, source: options.source, lang: locale });

    try {
      const response = await fetch(siteConfig.leadEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setStatus("sent");
    } catch (error) {
      console.error(error);
      setStatus("error");
    }
  }

  const value = useMemo(() => open, [open]);

  return (
    <LeadDialogContext.Provider value={value}>
      {children}
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          {status === "sent" ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="size-12 text-success" aria-hidden />
              <DialogTitle>{t.lead.successTitle}</DialogTitle>
              <DialogDescription>{format(t.lead.successText, { email })}</DialogDescription>
              <Button className="mt-2" onClick={() => setOpen(false)}>
                {t.lead.close}
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{t.lead.description}</DialogDescription>
              </DialogHeader>
              <form className="grid gap-4" onSubmit={handleSubmit}>
                <div className="grid gap-1.5">
                  <Label htmlFor="lead-nome">{t.lead.name} *</Label>
                  <Input id="lead-nome" name="nome" required autoComplete="name" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="lead-email">{t.lead.email} *</Label>
                    <Input
                      id="lead-email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="lead-telefone">{t.lead.phone}</Label>
                    <Input
                      id="lead-telefone"
                      name="telefone"
                      type="tel"
                      autoComplete="tel"
                      onInput={(e) => {
                        e.currentTarget.value = formatPhone(e.currentTarget.value);
                      }}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="lead-empresa">{t.lead.company}</Label>
                    <Input id="lead-empresa" name="empresa" autoComplete="organization" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="lead-plano">{t.lead.plan}</Label>
                    <select
                      id="lead-plano"
                      name="plano"
                      defaultValue={options.plan ?? ""}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">{t.lead.planUnknown}</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="lead-mensagem">{t.lead.message}</Label>
                  <Textarea id="lead-mensagem" name="mensagem" rows={3} />
                </div>
                {/* Campo-armadilha contra robôs: invisível para pessoas. */}
                <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label htmlFor="lead-website">Website</label>
                  <input id="lead-website" name="website" tabIndex={-1} autoComplete="off" />
                </div>
                <p className="text-xs text-muted-foreground">{t.lead.privacy}</p>
                {status === "error" && (
                  <p role="alert" className="text-sm text-destructive">
                    {format(t.lead.error, { email })}
                  </p>
                )}
                <Button type="submit" size="lg" disabled={status === "sending"}>
                  {status === "sending" && <Loader2 className="animate-spin" aria-hidden />}
                  {t.lead.send}
                </Button>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </LeadDialogContext.Provider>
  );
}
