// API pública do MDSign (PRD §31): o sistema do cliente (ERP, HCM, CRM) cria documentos,
// acompanha e baixa, usando a chave de API da organização. Toda chamada fica registrada.
//
//   Authorization: Bearer mds_xxxxxxxx_...        (ou X-Api-Key: mds_...)
//
//   GET  /v1/documents?status=pending&limit=50     lista
//   GET  /v1/documents/{id}                        detalhe (participantes e timeline)
//   POST /v1/documents                             cria e envia (PDF em base64 ou modelo)
//   POST /v1/documents/{id}/cancel                 cancela
//   POST /v1/documents/{id}/remind                 lembra um participante
//   GET  /v1/documents/{id}/download?version=      link temporário (signed|original|printable)
//   GET  /v1/templates                             modelos disponíveis
//   GET  /v1/usage                                 plano e consumo

import { admin } from "../_shared/auth.ts";
import { createDocument, optionalKey, requestKey } from "../_shared/create.ts";
import { syncDocument } from "../_shared/documents.ts";
import { AppError } from "../_shared/http.ts";
import { cleanExpiration, cleanLocale, cleanMessage, cleanReminders } from "../_shared/options.ts";
import {
  cleanObservers,
  cleanParticipants,
  type ParticipantInput,
} from "../_shared/participants.ts";
import { cleanParticipantMarks, loadPdf, sha256Hex } from "../_shared/pdf.ts";
import { signdoc } from "../_shared/signdoc.ts";
import {
  cleanValues,
  loadTemplate,
  marksFor,
  pdfFilename,
  renderTemplate,
  roleParticipants,
  slotValues,
} from "../_shared/templates.ts";

const RATE_PER_MINUTE = 120;
const MAX_PDF_BYTES = 20 * 1024 * 1024;

type Key = { id: string; organization_id: string; name: string };

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function authenticate(req: Request): Promise<Key> {
  const raw =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.headers.get("x-api-key") ??
    "";
  if (!/^mds_[0-9a-f]{8}_[0-9a-f]{48}$/.test(raw)) throw new AppError("invalid_api_key", 401);
  const { data } = await admin
    .from("api_keys")
    .select("id, organization_id, name")
    .eq("key_hash", await sha256Hex(new TextEncoder().encode(raw)))
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) throw new AppError("invalid_api_key", 401);
  // API MDSign faz parte de Integrações: exclusiva do Mogno.
  const { data: allowed } = await admin.rpc("entitlement_bool", {
    org: data.organization_id,
    ent: "integrations_access",
  });
  if (!allowed) throw new AppError("plan_feature_unavailable", 403);
  // Limite por chave: 120 chamadas por minuto.
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("api_requests")
    .select("id", { count: "exact", head: true })
    .eq("api_key_id", data.id)
    .gte("created_at", since);
  if ((count ?? 0) >= RATE_PER_MINUTE) throw new AppError("rate_limited", 429);
  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data as Key;
}

const base64ToBytes = (b64: string) => {
  const bin = atob(b64.replace(/^data:application\/pdf;base64,/, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function loadDoc(key: Key, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new AppError("not_found", 404);
  const { data } = await admin
    .from("documents")
    .select(
      "id, organization_id, name, kind, status, engine_document_id, created_at, concluded_at, expires_at",
    )
    .eq("id", id)
    .eq("organization_id", key.organization_id)
    .maybeSingle();
  if (!data) throw new AppError("not_found", 404);
  return data;
}

async function documentView(id: string) {
  const [{ data: doc }, { data: parts }, { data: events }, { data: observers }] = await Promise.all(
    [
      admin
        .from("documents")
        .select("id, name, kind, status, created_at, concluded_at, expires_at")
        .eq("id", id)
        .single(),
      admin
        .from("document_participants")
        .select("id, name, email, role, step, status, completed_at")
        .eq("document_id", id)
        .order("step"),
      admin
        .from("document_events")
        .select("type, actor_name, occurred_at")
        .eq("document_id", id)
        .order("occurred_at"),
      admin.from("document_observers").select("name, email").eq("document_id", id),
    ],
  );
  return {
    id: doc!.id,
    name: doc!.name,
    status: doc!.status,
    createdAt: doc!.created_at,
    concludedAt: doc!.concluded_at,
    expiresAt: doc!.expires_at,
    participants: (parts ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      role: p.role,
      step: p.step,
      status: p.status,
      completedAt: p.completed_at,
    })),
    observers: observers ?? [],
    timeline: (events ?? []).map((e) => ({ type: e.type, name: e.actor_name, at: e.occurred_at })),
  };
}

async function createFromApi(key: Key, body: Record<string, unknown>, idem: string | null) {
  const sequential = body["sequential"] !== false;
  const locale = cleanLocale(body["locale"], "pt");
  const common = {
    organizationId: key.organization_id,
    createdBy: null,
    actorName: `API · ${key.name}`,
    kind: "send" as const,
    locale,
    message: cleanMessage(body["message"]),
    expiresAt: cleanExpiration(body["expiresAt"]),
    notify: body["notify"] !== false,
    reminders: cleanReminders(body["reminders"] as never),
    observers: cleanObservers(body["observers"]),
    origin: "api",
    saveContacts: true,
    ...optionalKey(requestKey("api", key.id, idem)),
  };

  // A partir de modelo: { templateId, values, roles | participants }
  if (body["templateId"]) {
    const template = await loadTemplate(admin, String(body["templateId"]), key.organization_id);
    const values = cleanValues(body["values"]);
    const name =
      String(body["name"] ?? "")
        .trim()
        .slice(0, 200) || template.name;
    if (template.participants.length) {
      const r = roleParticipants(
        template,
        (body["roles"] ?? {}) as Record<string, ParticipantInput>,
        template.flow.sequential ?? sequential,
      );
      return createDocument({
        ...common,
        name,
        filename: pdfFilename(name),
        pdf: await renderTemplate(template, slotValues(template, values, r.bySlot)),
        participants: r.list,
        marks: template.marks.length ? marksFor(template, r.slots) : undefined,
        templateId: template.id,
      });
    }
    const participants = cleanParticipants(
      (body["participants"] ?? []) as ParticipantInput[],
      sequential,
    );
    return createDocument({
      ...common,
      name,
      filename: pdfFilename(name),
      pdf: await renderTemplate(template, values),
      participants,
      marks: cleanParticipantMarks(body["marks"], participants.length),
      templateId: template.id,
    });
  }

  // PDF próprio: { file: { base64, filename }, name, participants }
  const file = (body["file"] ?? {}) as { base64?: string; filename?: string };
  if (!file.base64) throw new AppError("file_required");
  let pdf: Uint8Array;
  try {
    pdf = base64ToBytes(file.base64);
  } catch {
    throw new AppError("file_not_pdf");
  }
  if (pdf.length > MAX_PDF_BYTES) throw new AppError("file_too_large");
  if (new TextDecoder().decode(pdf.subarray(0, 5)) !== "%PDF-") throw new AppError("file_not_pdf");
  await loadPdf(pdf);
  const filename = String(file.filename ?? "documento.pdf").slice(0, 200);
  const name =
    String(body["name"] ?? "")
      .trim()
      .slice(0, 200) || filename.replace(/\.pdf$/i, "");
  const participants = cleanParticipants(
    (body["participants"] ?? []) as ParticipantInput[],
    sequential,
  );
  return createDocument({
    ...common,
    name,
    filename,
    pdf,
    participants,
    marks: cleanParticipantMarks(body["marks"], participants.length),
  });
}

async function route(req: Request, key: Key, parts: string[], url: URL) {
  const [resource, id, sub] = parts;
  const method = req.method;
  const body =
    method === "POST" ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};

  if (resource === "usage" && method === "GET") {
    const { data } = await admin.rpc("org_usage", { org: key.organization_id });
    return reply((data as unknown[] | null)?.[0] ?? {});
  }

  if (resource === "templates" && method === "GET" && !id) {
    const { data } = await admin
      .from("templates")
      .select("id, name, kind, locale, fields, participants, scope")
      .or(`scope.eq.mdsign,and(scope.eq.organization,organization_id.eq.${key.organization_id})`)
      .order("name");
    return reply({
      data: (data ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        kind: t.kind,
        locale: t.locale,
        roles: t.participants,
        fields: (
          t.fields as {
            key: string;
            label: string;
            type: string;
            required?: boolean;
            slot?: number;
          }[]
        )
          .filter((f) => !f.slot)
          .map(({ key: k, label, type, required }) => ({
            key: k,
            label,
            type,
            required: Boolean(required),
          })),
      })),
    });
  }

  if (resource !== "documents") throw new AppError("not_found", 404);

  if (!id && method === "GET") {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
    let q = admin
      .from("documents")
      .select("id, name, status, created_at, concluded_at")
      .eq("organization_id", key.organization_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    const status = url.searchParams.get("status");
    if (status) q = q.eq("status", status);
    const before = url.searchParams.get("before");
    if (before) q = q.lt("created_at", before);
    const { data } = await q;
    return reply({
      data: (data ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        status: d.status,
        createdAt: d.created_at,
        concludedAt: d.concluded_at,
      })),
    });
  }

  if (!id && method === "POST") {
    // Idempotency-Key (opcional): repetir a chamada não cria nem cobra outro documento.
    const created = await createFromApi(key, body, req.headers.get("idempotency-key"));
    return reply(await documentView(created.documentId), 201);
  }

  const doc = await loadDoc(key, id!);

  if (!sub && method === "GET") {
    await syncDocument(doc).catch(() => undefined);
    return reply(await documentView(doc.id));
  }

  if (sub === "download" && method === "GET") {
    const v = url.searchParams.get("version");
    const type =
      v === "original"
        ? "Original"
        : v === "printable"
          ? "PrinterFriendlyVersion"
          : doc.status === "concluded"
            ? "Signatures"
            : "Original";
    const ticket = await signdoc.ticket(doc.engine_document_id, type);
    const link = ticket.location.startsWith("http")
      ? ticket.location
      : `${signdoc.baseUrl}${ticket.location}`;
    return reply({ url: link, version: type });
  }

  if (sub === "cancel" && method === "POST") {
    if (doc.status !== "pending") throw new AppError("document_not_pending", 409);
    const reason =
      String(body["reason"] ?? "")
        .trim()
        .slice(0, 500) || `Cancelado via API (${key.name}).`;
    await signdoc.cancel(doc.engine_document_id, reason);
    await syncDocument(doc);
    await admin.rpc("write_audit_as", {
      org: key.organization_id,
      actor: null,
      act: "document.canceled",
      ent: "document",
      ent_id: doc.id,
      payload: { reason, via: "api", key: key.name },
    });
    return reply(await documentView(doc.id));
  }

  if (sub === "remind" && method === "POST") {
    const { data: p } = await admin
      .from("document_participants")
      .select("id, name, status, engine_flow_action_id")
      .eq("document_id", doc.id)
      .eq("id", String(body["participantId"] ?? ""))
      .maybeSingle();
    if (!p?.engine_flow_action_id || p.status !== "pending")
      throw new AppError("nothing_to_remind", 409);
    await signdoc.remind(doc.engine_document_id, p.engine_flow_action_id);
    await admin.from("document_events").insert({
      document_id: doc.id,
      organization_id: key.organization_id,
      type: "participant.reminded",
      actor_name: p.name,
      source: "mdsign",
      data: { via: "api" },
    });
    return reply({ ok: true });
  }

  throw new AppError("not_found", 404);
}

Deno.serve(async (req) => {
  const started = Date.now();
  const url = new URL(req.url);
  // /functions/v1/api/v1/documents → ["documents", ...]
  const path = url.pathname.replace(/^.*?\/api(?=\/|$)/, "");
  const parts = path.split("/").filter(Boolean);
  let key: Key | null = null;
  let status = 200;
  let errorCode: string | null = null;
  let res: Response;
  try {
    if (parts[0] !== "v1") throw new AppError("not_found", 404);
    key = await authenticate(req);
    res = await route(req, key, parts.slice(1), url);
    status = res.status;
  } catch (e) {
    const err = e instanceof AppError ? e : new AppError("internal_error", 500);
    if (!(e instanceof AppError)) console.error("api", e);
    status = err.status;
    errorCode = err.code;
    res = reply({ error: err.code, ...(err.details ? { details: err.details } : {}) }, err.status);
  }
  if (key)
    await admin.from("api_requests").insert({
      organization_id: key.organization_id,
      api_key_id: key.id,
      method: req.method,
      path: path.slice(0, 200),
      status,
      duration_ms: Date.now() - started,
      error: errorCode,
    });
  return res;
});
