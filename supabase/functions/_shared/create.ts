// Criação de documento no motor + registro no MDSign. Usado por Só eu assino, envio,
// modelos, formulários e envio em massa: uma única regra de criação.

import { admin } from "./auth.ts";
import { AppError } from "./http.ts";
import { enqueueWhatsApp } from "./notifications.ts";
import {
  toFlowAction,
  toObserver,
  type CleanParticipant,
  type ObserverInput,
} from "./participants.ts";
import { assertSafePdf, loadPdf, pageSizes, toEngineMarks, type RelMark } from "./pdf.ts";
import { signdoc } from "./signdoc.ts";
import { deliverDue } from "./webhooks.ts";

export type CreateInput = {
  organizationId: string;
  createdBy: string | null;
  actorName: string;
  kind: "self" | "send";
  name: string;
  pdf: Uint8Array;
  filename: string;
  participants: CleanParticipant[];
  locale: string;
  message?: string | null;
  /** AAAA-MM-DD; o motor usa o fim do dia. */
  expiresAt?: string | null;
  /** false = assinatura dentro do MDSign (sem e-mail para o 1º passo). */
  notify: boolean;
  reminders?: { enabled: boolean; firstDays: number; everyDays: number; max: number };
  /** Origem para auditoria/consumo (ex.: "self", "send", "template", "form", "bulk"). */
  origin: string;
  /** Modelo usado (relatórios por modelo). */
  templateId?: string | null;
  /** Salva os participantes nos contatos da organização. */
  saveContacts?: boolean;
  /** Assinatura/rubrica posicionadas, por participante (mesmo índice de `participants`). */
  marks?: (RelMark[] | undefined)[];
  /** Observadores: acompanham e recebem as notificações, sem assinar. */
  observers?: ObserverInput[] | undefined;
};

export type Created = { documentId: string; engineDocumentId: string; participantIds: string[] };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

type Delegation = { fromUser: string; fromName: string; delegationId: string | null } | null;

/**
 * Delegação de aprovações (Bloco C): se um aprovador tem delegação ativa, a etapa vai para o
 * delegado — que age com a própria identidade (nome, e-mail e CPF dele). Assinaturas nunca
 * são delegadas. Sem CPF no perfil do delegado (o motor exige), a aprovação fica com o titular.
 */
async function applyDelegations(organizationId: string, list: CleanParticipant[]) {
  const info: Delegation[] = [];
  const out: CleanParticipant[] = [];
  for (const p of list) {
    let next = p;
    let from: Delegation = null;
    if (p.role === "approver") {
      const { data: owner } = await admin.rpc("user_id_by_email", { target: p.email });
      const { data: delegate } = owner
        ? await admin.rpc("active_delegate", {
            org: organizationId,
            delegator: owner,
            delegation_scope: "approvals",
          })
        : { data: null };
      if (delegate) {
        const [{ data: profile }, { data: auth }, { data: row }] = await Promise.all([
          admin.from("profiles").select("full_name, cpf").eq("id", delegate).maybeSingle(),
          admin.auth.admin.getUserById(delegate as string),
          admin
            .from("delegations")
            .select("id")
            .eq("organization_id", organizationId)
            .eq("delegator_id", owner)
            .eq("delegate_id", delegate)
            .eq("active", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        const email = auth?.user?.email?.toLowerCase();
        const already = list.some((x) => x.email === email);
        if (email && profile?.cpf && !already) {
          next = {
            ...p,
            name: profile.full_name?.trim() || email,
            email,
            cpf: profile.cpf,
            noCpf: false,
          };
          from = { fromUser: owner as string, fromName: p.name, delegationId: row?.id ?? null };
        }
      }
    }
    out.push(next);
    info.push(from);
  }
  return { list: out, info };
}

export async function createDocument(input: CreateInput): Promise<Created> {
  // PDF com conteúdo ativo (scripts, anexos, ações) é recusado antes de consumir o plano.
  await assertSafePdf(input.pdf);
  // Limite do plano (Bloco 6): bloqueia antes de criar no motor.
  const { data: allowed, error: limitError } = await admin.rpc("consume_document", {
    org: input.organizationId,
    origin: input.origin,
  });
  if (limitError) throw new AppError("internal_error", 500);
  if (allowed === false) throw new AppError("plan_limit_reached", 402);
  const delegated = await applyDelegations(input.organizationId, input.participants);
  input = { ...input, participants: delegated.list };

  try {
    const sizes = input.marks?.some((m) => m?.length) ? pageSizes(await loadPdf(input.pdf)) : [];
    const upload = await signdoc.uploadBytes(toBase64(input.pdf));
    const [created] = await signdoc.createDocuments({
      files: [
        {
          id: upload,
          name: input.filename,
          displayName: input.name,
          contentType: "application/pdf",
        },
      ],
      flowActions: input.participants.map((p, i) => {
        const marks = p.role !== "approver" ? (input.marks?.[i] ?? []) : [];
        return {
          ...toFlowAction(p, input.locale),
          ...(marks.length ? { prePositionedMarks: toEngineMarks(marks, sizes) } : {}),
        };
      }),
      ...(input.message ? { description: input.message } : {}),
      ...(input.expiresAt ? { expirationDate: input.expiresAt } : {}),
      disablePendingActionNotifications: !input.notify,
      ...(input.observers?.length
        ? { observers: input.observers.map((o) => toObserver(o, input.locale)) }
        : {}),
    });
    if (!created) throw new AppError("engine_rejected", 422);
    const engine = await signdoc.getDocument(created.documentId);

    const { data: doc, error } = await admin
      .from("documents")
      .insert({
        organization_id: input.organizationId,
        created_by: input.createdBy,
        kind: input.kind,
        name: input.name,
        engine_document_id: created.documentId,
        origin: input.origin,
        template_id: input.templateId ?? null,
        expires_at: engine.expirationDate ?? null,
        message: input.message ?? null,
        reminders_enabled: input.reminders?.enabled ?? input.notify,
        reminder_first_days: input.reminders?.firstDays ?? 2,
        reminder_every_days: input.reminders?.everyDays ?? 3,
        reminder_max: input.reminders?.max ?? 3,
      })
      .select("id")
      .single();
    if (error || !doc) throw error ?? new AppError("internal_error", 500);

    // Liga cada participante à ação do motor (mesma ordem de envio) e à conta MDSign, se houver.
    const actions = [...(engine.flowActions ?? [])];
    const rows = [];
    for (const [i, p] of input.participants.entries()) {
      const d = delegated.info[i];
      const idx = actions.findIndex(
        (a) => a.step === p.step && (a.user?.email ?? "").toLowerCase() === p.email,
      );
      const action = idx >= 0 ? actions.splice(idx, 1)[0] : undefined;
      const { data: userId } = await admin.rpc("user_id_by_email", { target: p.email });
      rows.push({
        document_id: doc.id,
        organization_id: input.organizationId,
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
        ...(d
          ? {
              delegated_from_user: d.fromUser,
              delegated_from_name: d.fromName,
              delegation_id: d.delegationId,
            }
          : {}),
      });
    }
    const { data: inserted } = await admin
      .from("document_participants")
      .insert(rows)
      .select("id, status");
    // Convite também por WhatsApp (se a organização ligou o canal) para quem já está com a vez.
    if (input.kind === "send" && input.notify)
      await enqueueWhatsApp(
        doc.id,
        (inserted ?? []).filter((r) => r.status === "pending").map((r) => r.id as string),
        "signature_requested",
        input.createdBy,
      ).catch((e) => console.error("enqueue whatsapp", e));
    if (input.observers?.length)
      await saveObservers(doc.id, input.organizationId, input.observers, engine);

    await admin.from("document_events").insert({
      document_id: doc.id,
      organization_id: input.organizationId,
      type: input.kind === "send" ? "document.sent" : "document.created",
      actor_name: input.actorName,
      source: "mdsign",
    });
    // Aprovações delegadas: registradas na linha do tempo ("em delegação de").
    const delegations = input.participants
      .map((p, i) => ({ p, d: delegated.info[i] }))
      .filter((x) => x.d);
    if (delegations.length)
      await admin.from("document_events").insert(
        delegations.map(({ p, d }) => ({
          document_id: doc.id,
          organization_id: input.organizationId,
          type: "participant.delegated",
          actor_name: p.name,
          source: "mdsign",
          data: { from: d!.fromName, delegation: d!.delegationId },
        })),
      );
    // Webhooks de saída: avisa o sistema do cliente já no envio.
    await deliverDue(10, input.organizationId).catch(() => undefined);
    await admin.rpc("write_audit_as", {
      org: input.organizationId,
      actor: input.createdBy,
      act: "document.created",
      ent: "document",
      ent_id: doc.id,
      payload: { origin: input.origin, name: input.name, participants: input.participants.length },
    });

    if (input.saveContacts)
      await admin.from("contacts").upsert(
        input.participants.map((p) => ({
          organization_id: input.organizationId,
          name: p.name,
          email: p.email,
          cpf: p.cpf,
          no_cpf: p.noCpf,
          phone: p.phone,
          source: "document",
          created_by: input.createdBy,
        })),
        { onConflict: "organization_id,email", ignoreDuplicates: true },
      );

    return {
      documentId: doc.id,
      engineDocumentId: created.documentId,
      participantIds: (inserted ?? []).map((r) => r.id as string),
    };
  } catch (error) {
    // Não cobra documento que não foi criado.
    await admin.rpc("refund_document", { org: input.organizationId });
    throw error;
  }
}

/** Valida PDF enviado pelo navegador (PRD §43: upload seguro). */
export async function readPdf(
  file: FormDataEntryValue | null,
): Promise<{ bytes: Uint8Array; name: string }> {
  if (!(file instanceof File)) throw new AppError("file_required");
  if (file.size === 0 || file.size > 20 * 1024 * 1024) throw new AppError("file_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
    throw new AppError("file_not_pdf");
  return { bytes, name: file.name.slice(0, 200) };
}

/** Registra os observadores do documento (ligando à conta MDSign e ao id no motor). */
export async function saveObservers(
  documentId: string,
  organizationId: string,
  observers: ObserverInput[],
  engine: { observers?: { id: string; user?: { email?: string } }[] },
) {
  const rows = [];
  for (const o of observers) {
    const { data: userId } = await admin.rpc("user_id_by_email", { target: o.email });
    const match = (engine.observers ?? []).find(
      (e) => (e.user?.email ?? "").toLowerCase() === o.email,
    );
    rows.push({
      document_id: documentId,
      organization_id: organizationId,
      user_id: (userId as string | null) ?? null,
      name: o.name,
      email: o.email,
      engine_observer_id: match?.id ?? null,
    });
  }
  await admin.from("document_observers").upsert(rows, { onConflict: "document_id,email" });
}
