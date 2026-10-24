import { CheckCircle2, Clock, Info, XCircle } from "lucide-react";

import { formatDate, type DocumentRow, type ParticipantRow } from "../documents";
import { useAppI18n } from "../i18n";

type Event = {
  type: string;
  actor_name: string | null;
  occurred_at: string;
  data?: { reason?: unknown } | null;
};
export type ReminderInfo = { id: string; reminder_count: number; last_reminded_at: string | null };

const DONE = new Set(["participant.signed", "participant.approved"]);

/** "há 2 dias", "há 3 horas" — no idioma da pessoa. */
function ago(iso: string, locale: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale === "pt" ? "pt-BR" : locale, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

/**
 * Situação agora: quem está com a ação pendente, desde quando e quantos lembretes recebeu.
 * Só usa dados reais (eventos do motor e do MDSign) — o motor não informa leitura de e-mail
 * nem abertura do documento, então isso não é exibido.
 */
export function DocumentStatusSummary({
  doc,
  participants,
  events,
  reminders,
}: {
  doc: DocumentRow;
  participants: ParticipantRow[];
  events: Event[];
  reminders: ReminderInfo[];
}) {
  const { t, f, locale } = useAppI18n();
  const sent = events.find((e) => e.type === "document.sent")?.occurred_at ?? doc.created_at;
  const refused = participants.filter((p) => p.status === "refused");
  const pending = participants.filter((p) => p.status === "pending");
  const refusal = events.filter((e) => e.type === "participant.refused").at(-1);

  // A vez de quem está pendente começou quando a última pessoa das etapas anteriores concluiu
  // (ou no envio, se for a primeira etapa ou o fluxo for paralelo).
  const since = (p: ParticipantRow) => {
    const before = new Set(participants.filter((x) => x.step < p.step).map((x) => x.name));
    const last = events
      .filter((e) => DONE.has(e.type) && e.actor_name && before.has(e.actor_name))
      .at(-1)?.occurred_at;
    return last && last > sent ? last : sent;
  };

  return (
    <section
      className="mb-4 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm"
      aria-labelledby="doc-now"
    >
      <h2 id="doc-now" className="font-display font-semibold">
        {t.documents.now.title}
      </h2>
      {doc.status === "concluded" ? (
        <p className="flex items-start gap-2 text-sm text-success">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          {f(t.documents.now.concluded, {
            date: formatDate(doc.concluded_at ?? doc.updated_at, locale),
          })}
        </p>
      ) : refused.length > 0 ? (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {f(t.documents.now.refused, { name: refused.map((p) => p.name).join(", ") })}
            {typeof refusal?.data?.reason === "string" && refusal.data.reason.trim() && (
              <span className="block text-foreground">
                {t.documents.reasonLabel}: “{refusal.data.reason.trim()}”
              </span>
            )}
          </span>
        </p>
      ) : doc.status !== "pending" ? (
        <p className="text-sm text-muted-foreground">{t.documents.status[doc.status]}</p>
      ) : (
        <ul className="grid gap-2">
          {pending.map((p) => {
            const r = reminders.find((x) => x.id === p.id);
            const start = since(p);
            return (
              <li key={p.id} className="flex items-start gap-2 text-sm">
                <Clock className="mt-0.5 size-4 shrink-0 text-orange-600" aria-hidden />
                <span>
                  <span className="font-medium">
                    {f(t.documents.now.waiting, {
                      name: p.name,
                      action: t.documents.now.actions[p.role] ?? "",
                    })}
                    {p.delegated_from_name &&
                      ` · ${f(t.documents.delegatedFrom, { name: p.delegated_from_name })}`}
                  </span>
                  <span className="block text-muted-foreground">
                    {f(t.documents.now.since, {
                      date: formatDate(start, locale),
                      ago: ago(start, locale),
                    })}
                    {" · "}
                    {(() => {
                      const opened = events.find(
                        (e) => e.type === "participant.link_opened" && e.actor_name === p.name,
                      );
                      return opened
                        ? `${f(t.documents.now.opened, { date: formatDate(opened.occurred_at, locale) })} · `
                        : "";
                    })()}
                    {r && r.reminder_count > 0 && r.last_reminded_at
                      ? f(
                          r.reminder_count === 1
                            ? t.documents.now.reminderOne
                            : t.documents.now.reminders,
                          {
                            n: String(r.reminder_count),
                            date: formatDate(r.last_reminded_at, locale),
                          },
                        )
                      : t.documents.now.noReminders}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t.documents.now.noViewInfo}
      </p>
    </section>
  );
}
