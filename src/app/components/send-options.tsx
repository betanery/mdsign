import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { locales, localeNames, type Locale } from "@/i18n";
import { useAppI18n } from "../i18n";
import { ObserversEditor, observersPayload, type ObserverDraft } from "./marks-editor";
import { selectClass } from "../ui";

export type SendOptionsValue = {
  message: string;
  expiresAt: string;
  locale: Locale;
  reminders: { enabled: boolean; firstDays: number; everyDays: number; max: number };
  observers: ObserverDraft[];
};

export const defaultSendOptions = (locale: Locale): SendOptionsValue => ({
  message: "",
  expiresAt: "",
  locale,
  reminders: { enabled: true, firstDays: 2, everyDays: 3, max: 3 },
  observers: [],
});

export const sendOptionsPayload = (o: SendOptionsValue) => ({
  message: o.message.trim() || undefined,
  expiresAt: o.expiresAt || null,
  locale: o.locale,
  reminders: o.reminders,
  observers: observersPayload(o.observers),
});

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Mensagem, prazo, idioma dos e-mails e lembretes automáticos (PRD §9 e §28). */
export function SendOptions({
  value,
  onChange,
}: {
  value: SendOptionsValue;
  onChange: (v: SendOptionsValue) => void;
}) {
  const { t } = useAppI18n();
  const r = value.reminders;
  const setR = (patch: Partial<SendOptionsValue["reminders"]>) =>
    onChange({ ...value, reminders: { ...r, ...patch } });
  const num = (v: string, min: number, max: number) =>
    Math.min(Math.max(Number(v) || min, min), max);

  return (
    <div className="grid gap-5">
      <div className="grid gap-1.5">
        <Label htmlFor="send-message">
          {t.sendOptions.message}{" "}
          <span className="font-normal text-muted-foreground">({t.common.optional})</span>
        </Label>
        <Textarea
          id="send-message"
          value={value.message}
          maxLength={2000}
          rows={3}
          onChange={(e) => onChange({ ...value, message: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">{t.sendOptions.messageHint}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="send-expires">{t.sendOptions.expiresAt}</Label>
          <Input
            id="send-expires"
            type="date"
            min={tomorrow()}
            value={value.expiresAt}
            onChange={(e) => onChange({ ...value, expiresAt: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            {value.expiresAt ? "" : t.sendOptions.noExpiration}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="send-locale">{t.sendOptions.language}</Label>
          <select
            id="send-locale"
            value={value.locale}
            onChange={(e) => onChange({ ...value, locale: e.target.value as Locale })}
            className={selectClass}
          >
            {locales.map((l) => (
              <option key={l} value={l}>
                {localeNames[l]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 rounded-xl border bg-white p-4">
        <label className="flex items-start gap-3">
          <Switch
            checked={r.enabled}
            onCheckedChange={(enabled) => setR({ enabled })}
            className="mt-0.5"
          />
          <span>
            <span className="block font-medium">{t.sendOptions.reminders}</span>
            <span className="text-sm text-muted-foreground">{t.sendOptions.remindersHint}</span>
          </span>
        </label>
        {r.enabled && (
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["firstDays", t.sendOptions.firstDays, 1, 30],
                ["everyDays", t.sendOptions.everyDays, 1, 30],
                ["max", t.sendOptions.max, 1, 10],
              ] as const
            ).map(([key, label, min, max]) => (
              <div key={key} className="grid gap-1.5">
                <Label htmlFor={`rem-${key}`}>{label}</Label>
                <Input
                  id={`rem-${key}`}
                  type="number"
                  min={min}
                  max={max}
                  value={r[key]}
                  onChange={(e) => setR({ [key]: num(e.target.value, min, max) })}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      <ObserversEditor
        value={value.observers}
        onChange={(observers) => onChange({ ...value, observers })}
      />
    </div>
  );
}
