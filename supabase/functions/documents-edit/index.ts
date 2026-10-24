// Editar um documento já enviado (enquanto pendente): incluir, trocar ou remover participantes
// (inclusive testemunhas) e observadores, ou substituir o arquivo por uma nova versão — neste
// caso o SignDoc reinicia o fluxo de assinatura. Quem pode: quem criou ou documents.manage.

import { admin, requireUser, type Caller } from "../_shared/auth.ts";
import { readPdf, saveObservers } from "../_shared/create.ts";
import { syncDocument } from "../_shared/documents.ts";
import { assertFeature } from "../_shared/features.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import {
  cleanObservers,
  cleanParticipants,
  normalizePhone,
  toFlowAction,
  toObserver,
  type ParticipantInput,
  witnessTitle,
} from "../_shared/participants.ts";
import {
  assertSafePdf,
  cleanBox,
  loadPdf,
  pageSizes,
  toEngineMarks,
  sha256Hex,
  type MarkType,
  type RelMark,
} from "../_shared/pdf.ts";
import { signdoc } from "../_shared/signdoc.ts";

type Doc = {
  id: string;
  name: string;
  organization_id: string;
  created_by: string | null;
  status: string;
  engine_document_id: string;
  refusal_kind: "return" | "reject" | null;
};

/**
 * Documento que quem chama pode editar. Participantes: só pendente. Nova versão: pendente ou
 * devolvido para correção (recusa sem rejeição definitiva).
 */
async function loadEditable(
  caller: Caller,
  documentId: string,
  forVersion = false,
): Promise<Doc> {
  const { data: doc } = await admin
    .from("documents")
    .select("id, organization_id, created_by, status, engine_document_id, name, refusal_kind")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) throw new AppError("not_found", 404);
  const { data: canManage } = await caller.asUser.rpc("has_org_permission", {
    org: doc.organization_id,
    perm: "documents.manage",
  });
  if (doc.created_by !== caller.user.id && !canManage) throw new AppError("forbidden", 403);
  const returned = doc.status === "refused" && doc.refusal_kind !== "reject";
  if (doc.status === "refused" && doc.refusal_kind === "reject")
    throw new AppError("document_rejected", 409);
  if (doc.status !== "pending" && !(forVersion && returned))
    throw new AppError("document_not_pending", 409);
  return doc as Doc;
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

async function event(doc: Doc, caller: Caller, type: string, actorName: string | null, data = {}) {
  await admin.from("document_events").insert({
    document_id: doc.id,
    organization_id: doc.organization_id,
    type,
    actor_name: actorName,
    source: "mdsign",
    data: { ...data, by: caller.profile.full_name ?? caller.user.email },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    const caller = await requireUser(req);

    // ---- Substituir o documento (nova versão) ----
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const doc = await loadEditable(caller, String(form.get("documentId") ?? ""), true);
      const { bytes, name } = await readPdf(form.get("file"));
      await assertSafePdf(bytes);
      const sizes = pageSizes(await loadPdf(bytes));
      // Posições por participante (id do MDSign) na nova versão.
      let rawMarks: Record<string, Partial<RelMark>[]> = {};
      try {
        rawMarks = JSON.parse(String(form.get("marks") ?? "{}")) ?? {};
      } catch {
        rawMarks = {};
      }
      const { data: parts } = await admin
        .from("document_participants")
        .select("id, engine_flow_action_id, role, status")
        .eq("document_id", doc.id);
      const types: MarkType[] = ["signature", "initials", "stamp"];
      const prePositionedMarks = (parts ?? [])
        .filter((p) => p.engine_flow_action_id && p.role !== "approver")
        .map((p) => {
          const marks = (rawMarks[p.id] ?? [])
            .map((m) => {
              const box = cleanBox(m, sizes.length);
              return box && types.includes(m.type as MarkType)
                ? { ...box, type: m.type as MarkType }
                : null;
            })
            .filter((m): m is RelMark => m !== null);
          return marks.length
            ? {
                flowActionId: p.engine_flow_action_id,
                prePositionedDocumentMarks: toEngineMarks(marks, sizes),
              }
            : null;
        })
        .filter((m) => m !== null);
      const upload = await signdoc.uploadBytes(toBase64(bytes));
      await signdoc.addVersion(doc.engine_document_id, {
        file: { id: upload, name, displayName: doc.name, contentType: "application/pdf" },
        ...(prePositionedMarks.length ? { prePositionedMarks } : {}),
      });
      // Nova versão: nunca sobrescreve a anterior; o hash identifica o arquivo de cada versão.
      const { data: last } = await admin
        .from("document_versions")
        .select("number")
        .eq("document_id", doc.id)
        .order("number", { ascending: false })
        .limit(1)
        .maybeSingle();
      const number = (last?.number ?? 1) + 1;
      await admin.from("document_versions").insert({
        document_id: doc.id,
        organization_id: doc.organization_id,
        number,
        file_name: name.slice(0, 200),
        sha256: await sha256Hex(bytes),
        size_bytes: bytes.length,
        created_by: caller.user.id,
        created_by_name: (caller.profile.full_name ?? caller.user.email ?? "").slice(0, 160) || null,
      });
      // Correção enviada: o fluxo recomeça no motor e precisa de nova aprovação.
      await admin.from("documents").update({ refusal_kind: null }).eq("id", doc.id);
      await event(doc, caller, "document.version_added", caller.profile.full_name, {
        file: name,
        version: number,
        resubmitted: doc.status === "refused",
      });
      await admin.rpc("write_audit_as", {
        org: doc.organization_id,
        actor: caller.user.id,
        act: "document.version_added",
        ent: "document",
        ent_id: doc.id,
        payload: { file: name, pages: sizes.length, version: number },
      });
      await syncDocument(doc).catch(() => undefined);
      return json({ ok: true }, 200, origin);
    }

    // ---- Editar participantes e observadores ----
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new AppError("invalid_request");
    }
    const doc = await loadEditable(caller, String(body["documentId"] ?? ""));
    const { data: parts } = await admin
      .from("document_participants")
      .select("id, name, email, step, status, role, engine_flow_action_id, rule_key")
      .eq("document_id", doc.id);
    const byId = new Map((parts ?? []).map((p) => [p.id as string, p]));
    const editable = (id: string) => {
      const p = byId.get(id);
      // Quem já assinou, aprovou ou recusou não pode ser alterado.
      if (!p || !p.engine_flow_action_id || p.status === "completed" || p.status === "refused")
        throw new AppError("participant_locked", 409);
      // Membros de um grupo com quórum: a regra é editada no motor como um todo (ainda não
      // suportado aqui); trocar ou remover uma pessoa isolada quebraria a contagem.
      if (p.rule_key) throw new AppError("quorum_edit_unsupported", 409);
      return p;
    };
    const { data: locale } = await admin
      .from("organizations")
      .select("locale")
      .eq("id", doc.organization_id)
      .single();
    const lang = String(locale?.locale ?? "pt");

    const removed = (Array.isArray(body["removed"]) ? body["removed"] : []).map(String);
    removed.forEach(editable);
    const edited = (Array.isArray(body["edited"]) ? body["edited"] : []) as {
      participantId: string;
      email?: string;
      phone?: string;
    }[];
    const editedActions = edited.map((e) => {
      const p = editable(e.participantId);
      const email = e.email ? String(e.email).trim().toLowerCase() : undefined;
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        throw new AppError("invalid_participants", 422);
      const phone = e.phone ? normalizePhone(e.phone) : undefined;
      if (e.phone && !phone) throw new AppError("invalid_participants", 422);
      return {
        flowActionId: p.engine_flow_action_id,
        step: p.step,
        // Editar sem o título apaga o título no SignDoc: a testemunha sempre o reenvia.
        ...(p.role === "witness" ? { title: witnessTitle[lang] ?? witnessTitle["pt"] } : {}),
        ...(email ? { participantEmailAddress: email } : {}),
        ...(phone ? { participantPhoneNumber: phone } : {}),
      };
    });
    // Novos participantes: passo informado (ou depois do último), nunca antes do passo atual.
    const pendingStep = Math.min(
      ...(parts ?? []).filter((p) => p.status !== "completed").map((p) => p.step as number),
      Number.MAX_SAFE_INTEGER,
    );
    const lastStep = Math.max(1, ...(parts ?? []).map((p) => p.step as number));
    const addedRaw = (Array.isArray(body["added"]) ? body["added"] : []) as (ParticipantInput & {
      step?: number;
    })[];
    const added = (addedRaw.length ? cleanParticipants(addedRaw, false) : []).map((p) => ({
      ...p,
      rule: null, // grupo com quórum só no envio, não na edição
    }));
    // Aprovação em várias etapas depende do plano (no Cedro, 1 aprovador), também na edição.
    const approvers =
      (parts ?? []).filter((p) => p.role === "approver" && !removed.includes(p.id as string))
        .length + added.filter((p) => p.role === "approver").length;
    if (approvers > 1) await assertFeature(doc.organization_id, "approval_multi");
    added.forEach((p, i) => {
      const wanted = Math.trunc(Number(addedRaw[i]?.step)) || lastStep + 1;
      p.step = Math.max(wanted, pendingStep === Number.MAX_SAFE_INTEGER ? 1 : pendingStep);
    });
    const addedObservers = cleanObservers(body["addedObservers"]);
    const removedObservers = (
      Array.isArray(body["removedObservers"]) ? body["removedObservers"] : []
    ).map(String);
    const { data: obsRows } = removedObservers.length
      ? await admin
          .from("document_observers")
          .select("id, email, engine_observer_id")
          .eq("document_id", doc.id)
          .in("id", removedObservers)
      : { data: [] };

    if (
      !removed.length &&
      !editedActions.length &&
      !added.length &&
      !addedObservers.length &&
      !obsRows?.length
    )
      throw new AppError("invalid_request");

    await signdoc.editFlow(doc.engine_document_id, {
      ...(added.length ? { addedFlowActions: added.map((p) => toFlowAction(p, lang)) } : {}),
      ...(editedActions.length ? { editedFlowActions: editedActions } : {}),
      ...(removed.length
        ? { deletedFlowActionIds: removed.map((id) => byId.get(id)!.engine_flow_action_id) }
        : {}),
      ...(addedObservers.length
        ? { addedObservers: addedObservers.map((o) => toObserver(o, lang)) }
        : {}),
      ...(obsRows?.some((o) => o.engine_observer_id)
        ? {
            deletedObserverIds: obsRows
              .filter((o) => o.engine_observer_id)
              .map((o) => o.engine_observer_id),
          }
        : {}),
    });

    // Espelha no MDSign o que o motor aceitou.
    const engine = await signdoc.getDocument(doc.engine_document_id);
    if (removed.length) await admin.from("document_participants").delete().in("id", removed);
    for (const e of edited) {
      const email = e.email ? String(e.email).trim().toLowerCase() : undefined;
      const phone = e.phone ? normalizePhone(e.phone) : undefined;
      if (!email && !phone) continue;
      const { data: userId } = email
        ? await admin.rpc("user_id_by_email", { target: email })
        : { data: undefined };
      await admin
        .from("document_participants")
        .update({
          ...(email ? { email, user_id: (userId as string | null) ?? null } : {}),
          ...(phone ? { phone } : {}),
        })
        .eq("id", e.participantId);
    }
    if (added.length) {
      const known = new Set((parts ?? []).map((p) => p.engine_flow_action_id));
      const fresh = (engine.flowActions ?? []).filter((a) => !known.has(a.id));
      const rows = [];
      for (const p of added) {
        const idx = fresh.findIndex(
          (a) => (a.user?.email ?? "").toLowerCase() === p.email && a.step === p.step,
        );
        const action = idx >= 0 ? fresh.splice(idx, 1)[0] : undefined;
        const { data: userId } = await admin.rpc("user_id_by_email", { target: p.email });
        rows.push({
          document_id: doc.id,
          organization_id: doc.organization_id,
          user_id: (userId as string | null) ?? null,
          role: p.role,
          step: p.step,
          name: p.name,
          email: p.email,
          cpf: p.cpf,
          no_cpf: p.noCpf,
          phone: p.phone,
          auth_level: p.authLevel,
          status: action?.status === "Created" ? "created" : "pending",
          engine_flow_action_id: action?.id ?? null,
        });
      }
      await admin.from("document_participants").insert(rows);
    }
    if (obsRows?.length)
      await admin
        .from("document_observers")
        .delete()
        .in(
          "id",
          obsRows.map((o) => o.id),
        );
    if (addedObservers.length)
      await saveObservers(doc.id, doc.organization_id, addedObservers, engine);

    for (const id of removed)
      await event(doc, caller, "participant.removed", byId.get(id)!.name as string);
    for (const e of edited)
      await event(doc, caller, "participant.updated", byId.get(e.participantId)!.name as string);
    for (const p of added) await event(doc, caller, "participant.added", p.name, { role: p.role });
    for (const o of addedObservers) await event(doc, caller, "observer.added", o.name);
    for (const o of obsRows ?? []) await event(doc, caller, "observer.removed", o.email as string);
    await admin.rpc("write_audit_as", {
      org: doc.organization_id,
      actor: caller.user.id,
      act: "document.flow_edited",
      ent: "document",
      ent_id: doc.id,
      payload: {
        added: added.map((p) => ({ email: p.email, role: p.role, step: p.step })),
        edited: edited.map((e) => ({
          id: e.participantId,
          from: byId.get(e.participantId)?.email,
          to: e.email ?? null,
        })),
        removed: removed.map((id) => byId.get(id)?.email),
        addedObservers: addedObservers.map((o) => o.email),
        removedObservers: (obsRows ?? []).map((o) => o.email),
      },
    });
    await syncDocument(doc, engine).catch(() => undefined);
    return json({ ok: true }, 200, origin);
  } catch (error) {
    return handleError(error, origin);
  }
});
