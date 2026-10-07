import { useEffect, useState } from "react";
import { MessageCircleQuestion, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAuth } from "../auth";
import { useAppI18n } from "../i18n";
import { useOrg } from "../org";

// Qualificação progressiva (sempre opcional): aparece depois do 1º documento concluído e some
// quando a pessoa responde ou dispensa. Não bloqueia nada no Cedro.

const USE_CASES = ["self_sign", "send_others", "company", "high_volume"] as const;
type UseCase = (typeof USE_CASES)[number];

export function QualificationCard({ concluded }: { concluded: number }) {
  const { t } = useAppI18n();
  const { user } = useAuth();
  const { current } = useOrg();
  const orgId = current?.id;
  const [state, setState] = useState<"loading" | "ask" | "hidden">("loading");
  const [useCase, setUseCase] = useState<UseCase | null>(null);
  const [company, setCompany] = useState("");
  const [volume, setVolume] = useState("");
  const [users, setUsers] = useState("");
  const [bulk, setBulk] = useState(false);
  const [integration, setIntegration] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!orgId || concluded < 1) return;
    void supabase
      .from("org_qualification")
      .select("organization_id")
      .eq("organization_id", orgId)
      .maybeSingle()
      .then(({ data }) => setState(data ? "hidden" : "ask"));
  }, [orgId, concluded]);

  if (!orgId || !user || concluded < 1 || state !== "ask") return null;
  const business = useCase === "company" || useCase === "high_volume";
  const num = (v: string) => (v.trim() ? Math.max(0, Math.min(1000000, Number(v) || 0)) : null);

  async function save(dismiss: boolean) {
    if (!orgId || !user) return;
    setBusy(true);
    const { error } = await supabase.from("org_qualification").upsert({
      organization_id: orgId,
      answered_by: user.id,
      updated_at: new Date().toISOString(),
      ...(dismiss
        ? { dismissed_at: new Date().toISOString() }
        : {
            use_case: useCase,
            ...(business
              ? {
                  company: company.trim() || null,
                  monthly_volume: num(volume),
                  users_count: num(users),
                  bulk_interest: bulk,
                  integration_interest: integration,
                }
              : {}),
          }),
    });
    setBusy(false);
    if (error) {
      toast.error(t.common.genericError);
      return;
    }
    if (!dismiss) toast.success(t.qualify.thanks);
    setState("hidden");
  }

  return (
    <section aria-labelledby="qualify-title" className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <MessageCircleQuestion className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="qualify-title" className="font-display text-lg font-semibold">
            {t.qualify.title}
          </h2>
          <p className="text-sm text-muted-foreground">{t.qualify.optional}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void save(true)}
          aria-label={t.qualify.dismiss}
        >
          <X aria-hidden />
        </Button>
      </div>
      <div className="mt-4 grid gap-2" role="radiogroup" aria-labelledby="qualify-title">
        {USE_CASES.map((u) => (
          <label
            key={u}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm",
              useCase === u && "border-brand bg-brand-soft/50",
            )}
          >
            <input
              type="radio"
              name="use-case"
              checked={useCase === u}
              onChange={() => setUseCase(u)}
              className="size-4 accent-[var(--color-brand)]"
            />
            {t.qualify.useCases[u]}
          </label>
        ))}
      </div>
      {business && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="q-company">{t.qualify.company}</Label>
            <Input
              id="q-company"
              value={company}
              maxLength={160}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="q-volume">{t.qualify.volume}</Label>
            <Input
              id="q-volume"
              type="number"
              min={0}
              inputMode="numeric"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="q-users">{t.qualify.users}</Label>
            <Input
              id="q-users"
              type="number"
              min={0}
              inputMode="numeric"
              value={users}
              onChange={(e) => setUsers(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={bulk}
              onChange={(e) => setBulk(e.target.checked)}
              className="size-4 accent-[var(--color-brand)]"
            />
            {t.qualify.bulk}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={integration}
              onChange={(e) => setIntegration(e.target.checked)}
              className="size-4 accent-[var(--color-brand)]"
            />
            {t.qualify.integration}
          </label>
        </div>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={() => void save(true)}>
          {t.qualify.dismiss}
        </Button>
        <Button
          disabled={busy || !useCase}
          onClick={() => void save(false)}
          className="bg-brand hover:bg-brand-strong"
        >
          {t.common.save}
        </Button>
      </div>
    </section>
  );
}
