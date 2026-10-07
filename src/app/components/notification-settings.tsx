import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import { useAppConfig } from "../app-config";
import { useAuth } from "../auth";
import { useAppI18n } from "../i18n";
import { useOrg } from "../org";
import { friendlyError } from "../validation";

type Settings = {
  whatsapp_enabled: boolean;
  whatsapp_on_invite: boolean;
  whatsapp_on_reminder: boolean;
};

/** Canais de notificação da organização: o e-mail vem do motor; o WhatsApp, do MDSign. */
export function NotificationsTab({ orgId }: { orgId: string }) {
  const { t } = useAppI18n();
  const { user } = useAuth();
  const { can } = useOrg();
  const config = useAppConfig();
  const manage = can("members.manage");
  const [s, setS] = useState<Settings>({
    whatsapp_enabled: false,
    whatsapp_on_invite: true,
    whatsapp_on_reminder: true,
  });

  useEffect(() => {
    void supabase
      .from("notification_settings")
      .select("whatsapp_enabled, whatsapp_on_invite, whatsapp_on_reminder")
      .eq("organization_id", orgId)
      .maybeSingle()
      .then(({ data }) => data && setS(data as Settings));
  }, [orgId]);

  async function save(next: Settings) {
    setS(next);
    const { error } = await supabase.from("notification_settings").upsert({
      organization_id: orgId,
      ...next,
      updated_by: user?.id,
      updated_at: new Date().toISOString(),
    });
    if (error) toast.error(friendlyError(error, t));
    else toast.success(t.common.saved);
  }

  const row = (key: keyof Settings, label: string, hint: string, disabled = false) => (
    <label className="flex items-start justify-between gap-4 py-3">
      <span>
        <span className="block font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">{hint}</span>
      </span>
      <Switch
        checked={s[key]}
        disabled={!manage || disabled}
        onCheckedChange={(v) => void save({ ...s, [key]: v })}
        aria-label={label}
      />
    </label>
  );

  return (
    <div className="grid max-w-2xl gap-4">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="mb-1 font-display font-semibold">{t.notify.emailTitle}</h3>
        <p className="text-sm text-muted-foreground">{t.notify.emailHint}</p>
      </section>
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="mb-1 flex items-center gap-2 font-display font-semibold">
          <MessageCircle className="size-4 text-brand" aria-hidden />
          {t.notify.whatsappTitle}
        </h3>
        <p className="text-sm text-muted-foreground">{t.notify.whatsappHint}</p>
        {!config.whatsappConfigured && (
          <p className="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900">
            {t.notify.notConfigured}
          </p>
        )}
        <div className="mt-2 divide-y">
          {row("whatsapp_enabled", t.notify.enabled, t.notify.enabledHint)}
          {row("whatsapp_on_invite", t.notify.onInvite, t.notify.onInviteHint, !s.whatsapp_enabled)}
          {row(
            "whatsapp_on_reminder",
            t.notify.onReminder,
            t.notify.onReminderHint,
            !s.whatsapp_enabled,
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t.notify.lgpd}</p>
      </section>
    </div>
  );
}
