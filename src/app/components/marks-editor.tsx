import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAppI18n } from "../i18n";
import { formatCpf, isValidCpf, onlyDigits } from "../validation";
import { PdfPlacer, type PlacedBox, type PlacerTool } from "./pdf-placer";
import { oneSignature, type MarkType, type RelBox } from "./template-fields";

export type Mark = RelBox & { type: MarkType };
/** Posições por participante (chave = id do participante no formulário). */
export type MarksByPerson = Record<string, Mark[]>;

const markTypes: MarkType[] = ["signature", "initials", "stamp"];

/**
 * Posicionar assinatura, rubrica e carimbo de cada participante sobre o PDF (todos os fluxos).
 * Sem posição, o SignDoc posiciona automaticamente.
 */
export function MarksEditor({
  source,
  people,
  value,
  onChange,
}: {
  source: string | ArrayBuffer | null;
  people: { key: string; label: string }[];
  value: MarksByPerson;
  onChange: (v: MarksByPerson) => void;
}) {
  const { t } = useAppI18n();
  const [tool, setTool] = useState<PlacerTool | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  const tone = (key: string) => people.findIndex((p) => p.key === key) + 1;

  const boxes: PlacedBox[] = useMemo(
    () =>
      people.flatMap((p) =>
        (value[p.key] ?? []).map((m, i) => ({
          ...m,
          id: `${p.key}|${i}`,
          kind: "mark" as const,
          label: `${t.pdf.markTypes[m.type]} · ${p.label}`,
          tone: tone(p.key),
        })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, value, t],
  );

  function apply(next: PlacedBox[]) {
    const out: MarksByPerson = {};
    for (const p of people)
      out[p.key] = (value[p.key] ?? []).flatMap((m, i) => {
        const b = next.find((x) => x.id === `${p.key}|${i}`);
        return b ? [{ ...m, page: b.page, x: b.x, y: b.y, w: b.w, h: b.h }] : [];
      });
    onChange(out);
  }

  const [selKey, selIndex] = selected ? selected.split("|") : [];
  const selMark = selKey ? value[selKey]?.[Number(selIndex)] : undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="grid content-start gap-3 text-sm">
        <p className="text-xs text-muted-foreground">{t.marks.hint}</p>
        {people.map((p) => (
          <div key={p.key} className="grid gap-1.5">
            <p className="truncate text-xs font-semibold text-muted-foreground uppercase">
              {p.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {markTypes.map((type) => {
                const key = `${type}:${p.key}`;
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={tool?.key === key}
                    onClick={() =>
                      setTool(
                        tool?.key === key
                          ? null
                          : {
                              key,
                              kind: "mark",
                              label: `${t.pdf.markTypes[type]} · ${p.label}`,
                              tone: tone(p.key),
                            },
                      )
                    }
                    className={cn(
                      "rounded-md border border-dashed bg-white px-2 py-1 text-xs hover:border-brand",
                      tool?.key === key && "border-brand bg-brand-soft font-semibold",
                    )}
                  >
                    {t.pdf.markTypes[type]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {selMark && selKey && (
          <div className="grid gap-2 rounded-xl border bg-white p-3">
            <p className="font-medium">
              {t.pdf.markTypes[selMark.type]} · {people.find((p) => p.key === selKey)?.label}
            </p>
            {pages > 1 && selMark.type !== "signature" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const list = value[selKey] ?? [];
                  const extra = Array.from({ length: pages }, (_, i) => i + 1)
                    .filter((pg) => !list.some((m) => m.type === selMark.type && m.page === pg))
                    .map((page) => ({ ...selMark, page }));
                  onChange({ ...value, [selKey]: [...list, ...extra] });
                }}
              >
                {t.pdf.allPages}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange({
                  ...value,
                  [selKey]: (value[selKey] ?? []).filter((_, i) => i !== Number(selIndex)),
                });
                setSelected(null);
              }}
            >
              <Trash2 aria-hidden />
              {t.pdf.removeItem}
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t.marks.oneSignature}</p>
        <p className="text-xs text-muted-foreground">{t.marks.auto}</p>
      </aside>
      <div className="max-h-[75svh] overflow-y-auto rounded-2xl border bg-muted/30 p-3">
        {tool && (
          <p className="sticky top-0 z-10 mb-2 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white">
            {t.pdf.drawHint.replace("{item}", tool.label)}
          </p>
        )}
        <PdfPlacer
          source={source}
          boxes={boxes}
          onChange={apply}
          tool={tool}
          onCreate={(box, used) => {
            const [type, key] = used.key.split(":") as [MarkType, string];
            const mark: Mark = { ...box, type };
            const list = oneSignature([...(value[key] ?? []), mark], mark);
            onChange({ ...value, [key]: list });
            setSelected(`${key}|${list.length - 1}`);
          }}
          selected={selected}
          onSelect={setSelected}
          onPages={(p) => setPages(p.length)}
        />
      </div>
    </div>
  );
}

/** Converte para o formato das funções: uma lista de marcas por participante, na ordem dada. */
export const marksPayload = (keys: string[], value: MarksByPerson) =>
  keys.map((k) =>
    (value[k] ?? []).map(({ type, page, x, y, w, h }) => ({ type, page, x, y, w, h })),
  );

export type ObserverDraft = { key: string; name: string; email: string; cpf: string };

/** Observadores: acompanham o documento e recebem as notificações, sem assinar. */
export function ObserversEditor({
  value,
  onChange,
}: {
  value: ObserverDraft[];
  onChange: (v: ObserverDraft[]) => void;
}) {
  const { t } = useAppI18n();
  const set = (i: number, patch: Partial<ObserverDraft>) =>
    onChange(value.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  return (
    <div className="grid gap-2 rounded-xl border bg-white p-4">
      <div>
        <p className="font-medium">{t.observers.title}</p>
        <p className="text-sm text-muted-foreground">{t.observers.hint}</p>
      </div>
      {value.map((o, i) => (
        <div key={o.key} className="grid gap-2 sm:grid-cols-[1fr_1fr_10rem_auto]">
          <Input
            aria-label={t.participants.name}
            placeholder={t.participants.name}
            value={o.name}
            onChange={(e) => set(i, { name: e.target.value })}
          />
          <Input
            aria-label={t.participants.email}
            type="email"
            placeholder={t.participants.email}
            value={o.email}
            onChange={(e) => set(i, { email: e.target.value })}
          />
          <Input
            aria-label={t.participants.cpf}
            inputMode="numeric"
            placeholder={t.participants.cpf}
            value={o.cpf}
            onChange={(e) => set(i, { cpf: formatCpf(e.target.value) })}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`${t.common.remove} ${o.name || o.email}`}
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={value.length >= 20}
        onClick={() =>
          onChange([...value, { key: crypto.randomUUID(), name: "", email: "", cpf: "" }])
        }
      >
        <Plus aria-hidden />
        {t.observers.add}
      </Button>
    </div>
  );
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const observersPayload = (list: ObserverDraft[]) =>
  list
    .filter((o) => o.email.trim())
    .map((o) => ({
      name: o.name.trim() || o.email.trim(),
      email: o.email.trim().toLowerCase(),
      cpf: onlyDigits(o.cpf) || null,
    }));
/** O SignDoc exige o CPF de cada observador. */
export const observersValid = (list: ObserverDraft[]) =>
  list.every((o) => !o.email.trim() || (EMAIL.test(o.email.trim()) && isValidCpf(o.cpf)));
