// Super Admin → Cobrança: matriz comercial (versões e publicação) e consumos a conferir.
// Não é o gerenciador de planos: só mostra as versões, publica uma versão em rascunho e
// resolve consumos com resultado desconhecido. Tudo exige Super Admin com MFA no servidor.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAppI18n } from "../i18n";
import { useConfirm } from "./confirm-dialog";

type Version = {
  id: string;
  name: string;
  status: "draft" | "published" | "retired";
  notes: string | null;
  published_at: string | null;
  subscriptions: number;
  plans: {
    plan_id: string;
    price_cents: number | null;
    entitlements: Record<string, number | boolean>;
  }[];
};
type Charge = {
  id: string;
  organization: string;
  origin: string | null;
  source: string;
  error: string | null;
  engine_document_id: string | null;
  created_at: string;
};

const T = {
  pt: {
    title: "Matriz comercial",
    hint: "Cada assinatura guarda a versão em que foi contratada. Publicar uma versão vale só para novas contratações e trocas de plano; quem já contratou mantém preço e direitos.",
    status: { draft: "Rascunho", published: "Publicada (vigente)", retired: "Aposentada" },
    subs: "{n} assinaturas nesta versão",
    plan: "Plano",
    price: "Preço",
    docs: "Documentos",
    users: "Usuários",
    unlimited: "Ilimitado",
    custom: "Personalizado",
    total: "{n} no total (por pessoa)",
    month: "{n} por mês",
    publish: "Publicar",
    publishTitle: "Publicar “{name}”?",
    publishText:
      "A partir de agora, novas contratações e trocas de plano recebem esta versão. Assinaturas atuais não mudam. A versão vigente passa a “Aposentada”, mas continua valendo para quem a contratou.",
    published: "Versão publicada.",
    charges: "Consumos a conferir",
    chargesHint:
      "Documentos cuja criação no motor ficou sem resposta (tempo esgotado) ou falhou depois de criar. Continuam contados até a conferência no painel do SignDoc.",
    none: "Nenhum consumo a conferir.",
    exists: "Existe no motor (manter)",
    notCreated: "Não foi criado (devolver)",
    resolveTitle: "Confirmar conferência?",
    resolveExists: "O documento existe no SignDoc: o consumo fica confirmado.",
    resolveNot: "O documento não existe no SignDoc: o consumo volta para a franquia ou para o mês.",
    resolved: "Conferência registrada.",
    error: "Não foi possível concluir. Tente de novo.",
  },
  en: {
    title: "Commercial matrix",
    hint: "Each subscription keeps the version it was contracted under. Publishing a version applies only to new contracts and plan changes; existing customers keep their price and rights.",
    status: { draft: "Draft", published: "Published (current)", retired: "Retired" },
    subs: "{n} subscriptions on this version",
    plan: "Plan",
    price: "Price",
    docs: "Documents",
    users: "Users",
    unlimited: "Unlimited",
    custom: "Custom",
    total: "{n} in total (per person)",
    month: "{n} per month",
    publish: "Publish",
    publishTitle: "Publish “{name}”?",
    publishText:
      "From now on, new contracts and plan changes get this version. Current subscriptions don't change. The current version becomes “Retired” but stays valid for those who contracted it.",
    published: "Version published.",
    charges: "Charges to review",
    chargesHint:
      "Documents whose creation in the engine got no response (timeout) or failed after being created. They stay counted until reviewed in the SignDoc panel.",
    none: "No charges to review.",
    exists: "Exists in the engine (keep)",
    notCreated: "Wasn't created (refund)",
    resolveTitle: "Confirm the review?",
    resolveExists: "The document exists in SignDoc: the charge is confirmed.",
    resolveNot:
      "The document doesn't exist in SignDoc: the charge goes back to the allowance or month.",
    resolved: "Review recorded.",
    error: "Couldn't complete. Try again.",
  },
  es: {
    title: "Matriz comercial",
    hint: "Cada suscripción guarda la versión en que fue contratada. Publicar una versión vale solo para nuevas contrataciones y cambios de plan; quien ya contrató mantiene precio y derechos.",
    status: { draft: "Borrador", published: "Publicada (vigente)", retired: "Retirada" },
    subs: "{n} suscripciones en esta versión",
    plan: "Plan",
    price: "Precio",
    docs: "Documentos",
    users: "Usuarios",
    unlimited: "Ilimitado",
    custom: "Personalizado",
    total: "{n} en total (por persona)",
    month: "{n} por mes",
    publish: "Publicar",
    publishTitle: "¿Publicar “{name}”?",
    publishText:
      "Desde ahora, las nuevas contrataciones y cambios de plan reciben esta versión. Las suscripciones actuales no cambian. La versión vigente pasa a “Retirada”, pero sigue valiendo para quien la contrató.",
    published: "Versión publicada.",
    charges: "Consumos por revisar",
    chargesHint:
      "Documentos cuya creación en el motor quedó sin respuesta (tiempo agotado) o falló después de crearse. Siguen contados hasta revisarlos en el panel de SignDoc.",
    none: "Ningún consumo por revisar.",
    exists: "Existe en el motor (mantener)",
    notCreated: "No se creó (devolver)",
    resolveTitle: "¿Confirmar la revisión?",
    resolveExists: "El documento existe en SignDoc: el consumo queda confirmado.",
    resolveNot: "El documento no existe en SignDoc: el consumo vuelve a la franquicia o al mes.",
    resolved: "Revisión registrada.",
    error: "No se pudo completar. Inténtalo de nuevo.",
  },
};
export const commercialTexts = T;

const fill = (s: string, v: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

export function CommercialAdmin() {
  const { locale } = useAppI18n();
  const c = T[locale as keyof typeof T] ?? T.pt;
  const [confirm, confirmDialog] = useConfirm();
  const [versions, setVersions] = useState<Version[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const money = (cents: number | null) =>
    cents == null
      ? c.custom
      : (cents / 100).toLocaleString(locale === "pt" ? "pt-BR" : locale, {
          style: "currency",
          currency: "BRL",
        });
  const date = (v: string) =>
    new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(v));

  const load = useCallback(async () => {
    const [v, ch] = await Promise.all([
      supabase.rpc("admin_plan_versions"),
      supabase.rpc("admin_document_charges", { st: "unknown" }),
    ]);
    setVersions((v.data as Version[] | null) ?? []);
    setCharges((ch.data as Charge[] | null) ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function publish(v: Version) {
    const ok = await confirm({
      title: fill(c.publishTitle, { name: v.name }),
      text: c.publishText,
      action: c.publish,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("admin_publish_plan_version", { vid: v.id });
    if (error) toast.error(c.error);
    else toast.success(c.published);
    void load();
  }

  async function resolve(ch: Charge, created: boolean) {
    const ok = await confirm({
      title: c.resolveTitle,
      text: created ? c.resolveExists : c.resolveNot,
      action: created ? c.exists : c.notCreated,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("admin_resolve_charge", { cid: ch.id, created });
    if (error) toast.error(c.error);
    else toast.success(c.resolved);
    void load();
  }

  const docs = (e: Record<string, number | boolean>) =>
    typeof e["documents_total"] === "number"
      ? fill(c.total, { n: e["documents_total"] })
      : typeof e["documents_month"] === "number"
        ? fill(c.month, { n: e["documents_month"] })
        : c.unlimited;

  return (
    <div className="mt-4 grid gap-4">
      {confirmDialog}
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="font-display text-lg font-semibold">{c.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{c.hint}</p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {versions.map((v) => (
            <div
              key={v.id}
              className={cn(
                "grid gap-2 rounded-xl border p-4",
                v.status === "published" && "border-brand",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{v.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{v.id}</p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    v.status === "published"
                      ? "bg-success/15 text-green-800"
                      : v.status === "draft"
                        ? "bg-orange-100 text-orange-800"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {c.status[v.status]}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {fill(c.subs, { n: v.subscriptions })}
                {v.published_at ? ` · ${date(v.published_at)}` : ""}
              </p>
              <div className="overflow-x-auto" tabIndex={0}>
                <table className="w-full min-w-[380px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground uppercase">
                      <th className="py-1.5 pr-3 font-semibold">{c.plan}</th>
                      <th className="py-1.5 pr-3 font-semibold">{c.price}</th>
                      <th className="py-1.5 pr-3 font-semibold">{c.docs}</th>
                      <th className="py-1.5 font-semibold">{c.users}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.plans.map((p) => (
                      <tr key={p.plan_id} className="border-t">
                        <td className="py-1.5 pr-3 font-medium">{p.plan_id}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{money(p.price_cents)}</td>
                        <td className="py-1.5 pr-3">
                          {p.plan_id === "mogno" ? c.custom : docs(p.entitlements)}
                        </td>
                        <td className="py-1.5 tabular-nums">
                          {p.plan_id === "mogno"
                            ? c.custom
                            : String(p.entitlements["users_max"] ?? c.unlimited)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {v.notes && <p className="text-xs text-muted-foreground">{v.notes}</p>}
              {v.status === "draft" && (
                <Button
                  className="w-fit bg-brand hover:bg-brand-strong"
                  onClick={() => void publish(v)}
                >
                  {c.publish}
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="font-display text-lg font-semibold">{c.charges}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{c.chargesHint}</p>
        {charges.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{c.none}</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {charges.map((ch) => (
              <li
                key={ch.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{ch.organization}</p>
                  <p className="text-xs text-muted-foreground">
                    {date(ch.created_at)} · {ch.origin ?? "—"} · {ch.error ?? ""}
                    {ch.engine_document_id ? ` · SignDoc ${ch.engine_document_id}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void resolve(ch, true)}>
                  {c.exists}
                </Button>
                <Button size="sm" variant="outline" onClick={() => void resolve(ch, false)}>
                  {c.notCreated}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
