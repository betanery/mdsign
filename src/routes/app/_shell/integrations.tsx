import { useCallback, useEffect, useState } from "react";
import { FeatureGate } from "@/app/components/feature-preview";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, KeyRound, Loader2, Plus, RotateCcw, Send, Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";

import { callFunction } from "@/app/api";
import { PageHeader } from "@/app/components/app-shell";
import { FormMessage } from "@/app/components/auth-layout";
import { useConfirm } from "@/app/components/confirm-dialog";
import { formatDate } from "@/app/documents";
import { errorText } from "@/app/errors";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase, supabaseUrl } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// Integrações (PRD §31): chaves de API, webhooks de saída, registro de chamadas e guia.
export const Route = createFileRoute("/app/_shell/integrations")({
  // Recurso do plano: fora dele, a prévia de upgrade no lugar da tela (o backend recusa).
  component: () => (
    <FeatureGate code="api_webhooks">
      <IntegrationsPage />
    </FeatureGate>
  ),
});

const EVENTS = [
  "document.sent",
  "participant.signed",
  "participant.approved",
  "participant.refused",
  "document.concluded",
  "document.refused",
  "document.canceled",
  "document.expired",
  "participant.added",
  "participant.removed",
  "document.version_added",
  "document.created",
] as const;

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};
type Endpoint = {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  active: boolean;
  created_at: string;
};
type Delivery = {
  id: string;
  endpoint_id: string;
  event_type: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  response_status: number | null;
  last_error: string | null;
  created_at: string;
};
type ApiRequest = {
  id: number;
  method: string;
  path: string;
  status: number;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
};

const apiBase = `${supabaseUrl}/functions/v1/api/v1`;

async function copy(text: string, ok: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(ok);
  } catch {
    toast.error(text);
  }
}

function IntegrationsPage() {
  const { t } = useAppI18n();
  const { current, can } = useOrg();
  // Integrações (API, webhooks, RH/HCM, ERP) são exclusivas do plano Mogno.
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    if (!current) return;
    void supabase
      .rpc("entitlement_bool", { org: current.id, ent: "integrations_access" })
      .then(({ data }) => setAllowed(Boolean(data)));
  }, [current]);
  if (!current) return <p>{t.notFoundOrg}</p>;
  if (!can("integrations.manage")) return <p>{t.common.forbidden}</p>;
  if (allowed === null) return <p className="text-muted-foreground">{t.common.loading}</p>;
  if (!allowed)
    return (
      <>
        <PageHeader title={t.integrations.title} subtitle={t.integrations.subtitle} />
        <section className="grid max-w-2xl gap-3 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold">{t.integrations.mognoTitle}</h2>
          <p className="text-sm text-muted-foreground">{t.integrations.mognoText}</p>
          <ul className="list-disc pl-5 text-sm">
            {t.integrations.mognoItems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="bg-brand hover:bg-brand-strong">
              <a href="/pt#planos" target="_blank" rel="noreferrer">
                {t.billing.talkSales}
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link to="/app/plan" hash="mudar-plano">
                {t.billing.changePlanTitle}
              </Link>
            </Button>
          </div>
        </section>
      </>
    );
  return (
    <>
      <PageHeader title={t.integrations.title} subtitle={t.integrations.subtitle} />
      <Tabs defaultValue="keys">
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
          <TabsTrigger value="keys">{t.integrations.tabKeys}</TabsTrigger>
          <TabsTrigger value="webhooks">{t.integrations.tabWebhooks}</TabsTrigger>
          <TabsTrigger value="log">{t.integrations.tabLog}</TabsTrigger>
          <TabsTrigger value="docs">{t.integrations.tabDocs}</TabsTrigger>
        </TabsList>
        <TabsContent value="keys">
          <KeysTab orgId={current.id} />
        </TabsContent>
        <TabsContent value="webhooks">
          <WebhooksTab orgId={current.id} />
        </TabsContent>
        <TabsContent value="log">
          <LogTab orgId={current.id} />
        </TabsContent>
        <TabsContent value="docs">
          <DocsTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

/** Mostra um segredo uma única vez, com botão de copiar. */
function SecretOnce({
  title,
  hint,
  value,
  onClose,
}: {
  title: string;
  hint: string;
  value: string;
  onClose: () => void;
}) {
  const { t } = useAppI18n();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{hint}</DialogDescription>
        </DialogHeader>
        <code className="block rounded-md bg-muted p-3 font-mono text-xs break-all">{value}</code>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => void copy(value, t.common.copied)}>
            <Copy aria-hidden />
            {t.common.copy}
          </Button>
          <Button className="bg-brand hover:bg-brand-strong" onClick={onClose}>
            {t.integrations.savedIt}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KeysTab({ orgId }: { orgId: string }) {
  const { t, f, locale } = useAppI18n();
  const [confirm, confirmDialog] = useConfirm();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("api_keys")
      .select("id, name, prefix, created_at, last_used_at, revoked_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    setKeys((data as ApiKey[] | null) ?? []);
  }, [orgId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await callFunction<{ key: string }>("integrations", {
        action: "create-key",
        organizationId: orgId,
        name: name.trim(),
      });
      setCreated(r.key);
      setName("");
      void load();
    } catch (err) {
      toast.error(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(k: ApiKey) {
    const ok = await confirm({
      title: t.integrations.revoke,
      text: f(t.integrations.revokeConfirm, { name: k.name }),
      action: t.integrations.revoke,
    });
    if (!ok) return;
    try {
      await callFunction("integrations", { action: "revoke-key", organizationId: orgId, id: k.id });
      void load();
    } catch (err) {
      toast.error(errorText(t, err));
    }
  }

  return (
    <section className="grid gap-4">
      <form
        onSubmit={(e) => void create(e)}
        className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4 shadow-sm"
      >
        <div className="grid min-w-60 flex-1 gap-1.5">
          <Label htmlFor="key-name">{t.integrations.keyName}</Label>
          <Input
            id="key-name"
            value={name}
            placeholder={t.integrations.keyNamePlaceholder}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          className="bg-brand hover:bg-brand-strong"
          disabled={busy || name.trim().length < 2}
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
          {t.integrations.createKey}
        </Button>
      </form>
      <ul className="divide-y rounded-2xl border bg-white shadow-sm">
        {keys?.length === 0 && (
          <li className="p-4 text-muted-foreground">{t.integrations.noKeys}</li>
        )}
        {keys?.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-3 p-4">
            <KeyRound className="size-5 text-brand" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{k.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{k.prefix}_••••</p>
              <p className="text-xs text-muted-foreground">
                {t.integrations.created} {formatDate(k.created_at, locale)} ·{" "}
                {k.last_used_at
                  ? `${t.integrations.lastUsed} ${formatDate(k.last_used_at, locale)}`
                  : t.integrations.neverUsed}
              </p>
            </div>
            {k.revoked_at ? (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                {t.integrations.revoked}
              </span>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => void revoke(k)}>
                <Trash2 aria-hidden />
                {t.integrations.revoke}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {created && (
        <SecretOnce
          title={t.integrations.keyCreated}
          hint={t.integrations.keyOnce}
          value={created}
          onClose={() => setCreated(null)}
        />
      )}
      {confirmDialog}
    </section>
  );
}

function WebhooksTab({ orgId }: { orgId: string }) {
  const { t, locale } = useAppI18n();
  const [confirm, confirmDialog] = useConfirm();
  const [endpoints, setEndpoints] = useState<Endpoint[] | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [e, d] = await Promise.all([
      supabase
        .from("webhook_endpoints")
        .select("id, url, description, events, active, created_at")
        .eq("organization_id", orgId)
        .order("created_at"),
      supabase
        .from("webhook_deliveries")
        .select(
          "id, endpoint_id, event_type, status, attempts, response_status, last_error, created_at",
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setEndpoints((e.data as Endpoint[] | null) ?? []);
    setDeliveries((d.data as Delivery[] | null) ?? []);
  }, [orgId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(key: string, body: Record<string, unknown>, ok?: string) {
    setBusy(key);
    try {
      const r = await callFunction<Record<string, unknown>>("integrations", {
        organizationId: orgId,
        ...body,
      });
      if (typeof r["secret"] === "string") setSecret(r["secret"]);
      if (body["action"] === "test-endpoint") {
        if (r["ok"]) toast.success(t.integrations.testOk);
        else
          toast.error(
            `${t.integrations.testFail} (${String(r["last_error"] ?? r["response_status"])})`,
          );
      } else if (ok) toast.success(ok);
      await load();
    } catch (err) {
      toast.error(errorText(t, err));
    } finally {
      setBusy(null);
    }
  }

  const tone = {
    delivered: "bg-success/15 text-green-800",
    pending: "bg-orange-100 text-orange-700",
    failed: "bg-destructive/10 text-destructive",
  };

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">{t.integrations.webhooksHint}</p>
        <Button className="bg-brand hover:bg-brand-strong" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          {t.integrations.addEndpoint}
        </Button>
      </div>
      <ul className="grid gap-3">
        {endpoints?.length === 0 && (
          <li className="rounded-2xl border bg-white p-4 text-muted-foreground">
            {t.integrations.noEndpoints}
          </li>
        )}
        {endpoints?.map((e) => (
          <li key={e.id} className="grid gap-2 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <Webhook className="size-5 text-brand" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm">{e.url}</p>
                <p className="text-xs text-muted-foreground">
                  {e.description ? `${e.description} · ` : ""}
                  {e.events.includes("*") ? t.integrations.allEvents : e.events.join(", ")}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  e.active ? "bg-success/15 text-green-800" : "bg-muted text-muted-foreground",
                )}
              >
                {e.active ? t.forms.active : t.forms.inactive}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  void act(`test-${e.id}`, { action: "test-endpoint", endpointId: e.id })
                }
              >
                {busy === `test-${e.id}` ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Send aria-hidden />
                )}
                {t.integrations.test}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() =>
                  void act(`toggle-${e.id}`, {
                    action: "update-endpoint",
                    endpointId: e.id,
                    active: !e.active,
                  })
                }
              >
                {e.active ? t.forms.deactivate : t.forms.activate}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() =>
                  void confirm({
                    title: t.integrations.rotate,
                    text: t.integrations.rotateConfirm,
                    action: t.integrations.rotate,
                  }).then((ok) => {
                    if (ok)
                      void act(`rotate-${e.id}`, { action: "rotate-secret", endpointId: e.id });
                  })
                }
              >
                <RotateCcw aria-hidden />
                {t.integrations.rotate}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() =>
                  void confirm({
                    title: t.common.remove,
                    text: t.integrations.deleteConfirm,
                    action: t.common.remove,
                  }).then((ok) => {
                    if (ok)
                      void act(`del-${e.id}`, { action: "delete-endpoint", endpointId: e.id });
                  })
                }
              >
                <Trash2 aria-hidden />
                {t.common.remove}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <section className="rounded-2xl border bg-white shadow-sm">
        <h2 className="border-b p-4 font-display text-lg font-semibold">
          {t.integrations.deliveries}
        </h2>
        {deliveries.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t.integrations.noDeliveries}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="p-2 font-medium">{t.integrations.event}</th>
                  <th className="p-2 font-medium">{t.admin.status}</th>
                  <th className="p-2 font-medium">{t.integrations.attempts}</th>
                  <th className="p-2 font-medium">{t.integrations.response}</th>
                  <th className="p-2 font-medium">{t.integrations.when}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td className="p-2 font-mono text-xs">{d.event_type}</td>
                    <td className="p-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          tone[d.status],
                        )}
                      >
                        {t.integrations.deliveryStatus[d.status]}
                      </span>
                    </td>
                    <td className="p-2">{d.attempts}</td>
                    <td className="p-2 text-xs">{d.response_status ?? d.last_error ?? "—"}</td>
                    <td className="p-2 text-xs whitespace-nowrap">
                      {formatDate(d.created_at, locale)}
                    </td>
                    <td className="p-2 text-right">
                      {d.status === "failed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() =>
                            void act(
                              `re-${d.id}`,
                              { action: "redeliver", deliveryId: d.id },
                              t.integrations.redelivered,
                            )
                          }
                        >
                          {t.integrations.redeliver}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {adding && (
        <AddEndpointDialog
          orgId={orgId}
          onClose={() => setAdding(false)}
          onCreated={(s) => {
            setAdding(false);
            setSecret(s);
            void load();
          }}
        />
      )}
      {secret && (
        <SecretOnce
          title={t.integrations.secretTitle}
          hint={t.integrations.secretOnce}
          value={secret}
          onClose={() => setSecret(null)}
        />
      )}
      {confirmDialog}
    </section>
  );
}

function AddEndpointDialog({
  orgId,
  onClose,
  onCreated,
}: {
  orgId: string;
  onClose: () => void;
  onCreated: (secret: string) => void;
}) {
  const { t } = useAppI18n();
  const [url, setUrl] = useState("https://");
  const [description, setDescription] = useState("");
  const [all, setAll] = useState(true);
  const [events, setEvents] = useState<string[]>(["document.concluded"]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await callFunction<{ secret: string }>("integrations", {
        action: "create-endpoint",
        organizationId: orgId,
        url: url.trim(),
        description,
        events: all ? ["*"] : events,
      });
      onCreated(r.secret);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.integrations.addEndpoint}</DialogTitle>
          <DialogDescription>{t.integrations.endpointHint}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void save(e)} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ep-url">{t.integrations.url}</Label>
            <Input id="ep-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ep-desc">
              {t.integrations.description}{" "}
              <span className="font-normal text-muted-foreground">({t.common.optional})</span>
            </Label>
            <Input
              id="ep-desc"
              value={description}
              maxLength={160}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <fieldset className="grid gap-2 rounded-xl border p-3 text-sm">
            <legend className="px-1 font-medium">{t.integrations.events}</legend>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={all}
                onChange={(e) => setAll(e.target.checked)}
                className="size-4 accent-[var(--color-brand)]"
              />
              {t.integrations.allEvents}
            </label>
            {!all && (
              <div className="grid gap-1 sm:grid-cols-2">
                {EVENTS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 font-mono text-xs">
                    <input
                      type="checkbox"
                      checked={events.includes(ev)}
                      onChange={(e) =>
                        setEvents(
                          e.target.checked ? [...events, ev] : events.filter((x) => x !== ev),
                        )
                      }
                      className="size-4 accent-[var(--color-brand)]"
                    />
                    {ev}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              className="bg-brand hover:bg-brand-strong"
              disabled={busy || (!all && !events.length)}
            >
              {t.common.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LogTab({ orgId }: { orgId: string }) {
  const { t, locale } = useAppI18n();
  const [rows, setRows] = useState<ApiRequest[] | null>(null);
  useEffect(() => {
    void supabase
      .from("api_requests")
      .select("id, method, path, status, duration_ms, error, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setRows((data as ApiRequest[] | null) ?? []));
  }, [orgId]);
  return (
    <section className="rounded-2xl border bg-white shadow-sm">
      {rows?.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{t.integrations.noRequests}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">{t.integrations.when}</th>
                <th className="p-2 font-medium">{t.integrations.call}</th>
                <th className="p-2 font-medium">{t.integrations.response}</th>
                <th className="p-2 font-medium">ms</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows?.map((r) => (
                <tr key={r.id}>
                  <td className="p-2 text-xs whitespace-nowrap">
                    {formatDate(r.created_at, locale)}
                  </td>
                  <td className="p-2 font-mono text-xs">
                    {r.method} {r.path}
                  </td>
                  <td
                    className={cn(
                      "p-2 font-mono text-xs",
                      r.status >= 400 ? "text-destructive" : "text-success",
                    )}
                  >
                    {r.status}
                    {r.error ? ` · ${r.error}` : ""}
                  </td>
                  <td className="p-2 text-xs">{r.duration_ms ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DocsTab() {
  const { t } = useAppI18n();
  const examples = [
    {
      title: t.integrations.docsCreate,
      code: `curl -X POST ${apiBase}/documents \\
  -H "Authorization: Bearer mds_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Contrato 123",
    "file": { "filename": "contrato.pdf", "base64": "JVBERi0x..." },
    "sequential": true,
    "participants": [
      { "name": "Nome", "email": "pessoa@empresa.com", "cpf": "00000000000", "role": "signer" },
      { "name": "Testemunha", "email": "t@empresa.com", "cpf": "00000000000", "role": "witness" }
    ]
  }'`,
    },
    {
      title: t.integrations.docsTemplate,
      code: `curl -X POST ${apiBase}/documents \\
  -H "Authorization: Bearer mds_..." -H "Content-Type: application/json" \\
  -d '{ "templateId": "…", "values": { "empresa": "…" },
        "roles": { "1": { "name": "…", "email": "…", "cpf": "…" } } }'`,
    },
    {
      title: t.integrations.docsStatus,
      code: `curl ${apiBase}/documents/{id} -H "Authorization: Bearer mds_..."`,
    },
    {
      title: t.integrations.docsDownload,
      code: `curl "${apiBase}/documents/{id}/download?version=signed" -H "Authorization: Bearer mds_..."`,
    },
    {
      title: t.integrations.docsVerify,
      code: `// Cabeçalho X-MDSign-Signature: t=<timestamp>,v1=<hmac>
// hmac = HMAC-SHA256(segredo, \`\${timestamp}.\${corpo bruto}\`) em hexadecimal
const [t, v1] = header.split(",").map((p) => p.split("=")[1]);
const esperado = crypto.createHmac("sha256", segredo).update(\`\${t}.\${corpo}\`).digest("hex");
if (esperado !== v1 || Date.now() / 1000 - Number(t) > 300) rejeitar();`,
    },
  ];
  return (
    <section className="grid gap-4">
      <p className="max-w-3xl text-sm text-muted-foreground">{t.integrations.docsIntro}</p>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3 text-sm">
        <span className="font-medium">{t.integrations.baseUrl}</span>
        <code className="font-mono text-xs break-all">{apiBase}</code>
        <Button size="sm" variant="ghost" onClick={() => void copy(apiBase, t.common.copied)}>
          <Copy aria-hidden />
        </Button>
      </div>
      {examples.map((ex) => (
        <div key={ex.title} className="grid gap-2">
          <h3 className="font-medium">{ex.title}</h3>
          <pre className="overflow-x-auto rounded-xl bg-[#1f1b2e] p-4 text-xs text-white">
            <code>{ex.code}</code>
          </pre>
        </div>
      ))}
      <p className="text-sm text-muted-foreground">{t.integrations.docsLimits}</p>
    </section>
  );
}
