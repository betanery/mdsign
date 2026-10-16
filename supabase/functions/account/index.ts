// Encerramento de conta e exportação de documentos (Termos, seção 7).
//
// Ações (com login):
//   status  → situação do encerramento e quantas partes tem a exportação
//   export  → ZIP de uma parte (até 25 documentos + lista.csv); proprietário ou administrador
//   close   → encerra a organização (só o proprietário, confirmando o nome); cancela o plano pago
//   reopen  → desfaz o encerramento dentro dos 30 dias (volta ao Cedro)
//
// O ZIP traz o PDF assinado (ou o original, se o documento não foi concluído) direto do motor.

import { asaas } from "../_shared/asaas.ts";
import { admin, requirePermission, requireUser } from "../_shared/auth.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import { fetchWithTimeout } from "../_shared/net.ts";
import { signdoc } from "../_shared/signdoc.ts";
import { zip } from "../_shared/zip.ts";

const PART = 25;

const safeName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80) || "documento";

const csvCell = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    const caller = await requireUser(req);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new AppError("invalid_request");
    }
    const organizationId = String(body["organizationId"] ?? "");
    if (!organizationId) throw new AppError("organization_required");
    const action = String(body["action"] ?? "");

    const { data: org } = await admin
      .from("organizations")
      .select("id, name, closed_at, export_until, purge_after")
      .eq("id", organizationId)
      .maybeSingle();
    if (!org) throw new AppError("forbidden", 403);

    const countDocs = async () => {
      const { count } = await admin
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("deleted_at", null);
      return count ?? 0;
    };

    // Encerrar só depois de baixar o ZIP completo (todas as partes nas últimas 24 horas).
    const exportedAll = async (userId: string) => {
      const total = await countDocs();
      if (total === 0) return true;
      const parts = Math.ceil(total / PART);
      const { data: rows } = await admin
        .from("audit_log")
        .select("data")
        .eq("organization_id", organizationId)
        .eq("actor_id", userId)
        .eq("action", "documents.exported")
        .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
      const done = new Set(
        (rows ?? [])
          .map((r) => r.data as { part?: number; parts?: number })
          .filter((d) => d.parts === parts)
          .map((d) => d.part),
      );
      for (let i = 1; i <= parts; i++) if (!done.has(i)) return false;
      return true;
    };

    if (action === "status") {
      await requirePermission(caller, organizationId, "documents.view");
      const total = await countDocs();
      return json(
        {
          closedAt: org.closed_at,
          exportUntil: org.export_until,
          purgeAfter: org.purge_after,
          documents: total,
          parts: Math.max(1, Math.ceil(total / PART)),
          exportedAll: await exportedAll(caller.user.id),
        },
        200,
        origin,
      );
    }

    if (action === "export") {
      await requirePermission(caller, organizationId, "members.manage");
      const part = Math.max(1, Math.floor(Number(body["part"]) || 1));
      const { data: docs } = await admin
        .from("documents")
        .select(
          "id, name, status, created_at, concluded_at, engine_document_id, document_participants (name, email, role, status)",
        )
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("created_at")
        .order("id")
        .range((part - 1) * PART, part * PART - 1);
      const files: { name: string; data: Uint8Array }[] = [];
      const rows: string[][] = [];
      const used = new Set<string>();
      for (const d of docs ?? []) {
        let file = "";
        let note = "";
        try {
          const ticket = await signdoc.ticket(
            d.engine_document_id,
            d.status === "concluded" ? "Signatures" : "Original",
          );
          const url = ticket.location.startsWith("http")
            ? ticket.location
            : `${signdoc.baseUrl}${ticket.location}`;
          const res = await fetchWithTimeout(url);
          if (!res.ok) throw new Error(String(res.status));
          let base = `${d.created_at.slice(0, 10)}_${safeName(d.name)}`;
          for (let i = 2; used.has(base); i++)
            base = `${d.created_at.slice(0, 10)}_${safeName(d.name)}_${i}`;
          used.add(base);
          file = `${base}.pdf`;
          files.push({ name: `documentos/${file}`, data: new Uint8Array(await res.arrayBuffer()) });
        } catch (e) {
          console.error("export", d.id, e);
          note = "não foi possível baixar agora; tente de novo";
        }
        const people = (
          (d.document_participants ?? []) as { name: string; email: string; status: string }[]
        )
          .map((p) => `${p.name} <${p.email}> (${p.status})`)
          .join(" | ");
        rows.push([d.name, d.status, d.created_at, d.concluded_at ?? "", people, file, note]);
      }
      const csv = `﻿${[
        [
          "documento",
          "situacao",
          "criado_em",
          "concluido_em",
          "participantes",
          "arquivo",
          "observacao",
        ],
        ...rows,
      ]
        .map((r) => r.map(csvCell).join(";"))
        .join("\r\n")}`;
      files.unshift({ name: "lista.csv", data: new TextEncoder().encode(csv) });
      await admin.rpc("write_audit_as", {
        org: organizationId,
        actor: caller.user.id,
        act: "documents.exported",
        ent: "organization",
        ent_id: organizationId,
        payload: {
          part,
          parts: Math.max(1, Math.ceil((await countDocs()) / PART)),
          documents: rows.length,
        },
      });
      return new Response(zip(files) as BodyInit, {
        status: 200,
        headers: {
          ...corsHeaders(origin),
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="mdsign-documentos-parte-${part}.zip"`,
        },
      });
    }

    if (action === "close") {
      // Confere o proprietário e o nome no banco (com a identidade do usuário) antes de cancelar
      // a cobrança: se a confirmação falhar, nada muda.
      const { data: role } = await caller.asUser.rpc("org_role_of", { org: organizationId });
      if (role !== "owner") throw new AppError("forbidden", 403);
      const confirm = String(body["confirmName"] ?? "");
      if (confirm.trim().toLowerCase() !== String(org.name).trim().toLowerCase())
        throw new AppError("confirm_name_mismatch", 422);
      if (!(await exportedAll(caller.user.id))) throw new AppError("export_required", 409);
      const { data: sub } = await admin
        .from("subscriptions")
        .select("asaas_subscription_id, cancel_at")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (sub?.asaas_subscription_id && !sub.cancel_at) {
        await asaas.deleteSubscription(sub.asaas_subscription_id);
        await admin
          .from("subscriptions")
          .update({ cancel_at: new Date().toISOString(), last_sync_at: new Date().toISOString() })
          .eq("organization_id", organizationId);
      }
      const { data: until, error } = await caller.asUser.rpc("close_organization", {
        org: organizationId,
        confirm_name: confirm,
      });
      if (error)
        throw new AppError(
          error.message.includes("closed") ? "organization_closed" : "forbidden",
          409,
        );
      return json({ exportUntil: until }, 200, origin);
    }

    if (action === "reopen") {
      const { error } = await caller.asUser.rpc("reopen_organization", { org: organizationId });
      if (error) throw new AppError("forbidden", 403);
      return json({ ok: true }, 200, origin);
    }

    throw new AppError("invalid_request");
  } catch (error) {
    return handleError(error, origin);
  }
});
