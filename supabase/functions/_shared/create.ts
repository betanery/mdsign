// Criação de documento no motor + registro no MDSign. Usado por Só eu assino, envio,
// modelos, formulários e envio em massa: uma única regra de criação.

import { admin } from "./auth.ts";
import { assertFeature } from "./features.ts";
import { AppError } from "./http.ts";
import { enqueueChannels, ownEmailFor } from "./notifications.ts";
import {
  toFlowActions,
  toObserver,
  type CleanParticipant,
  type ObserverInput,
} from "./participants.ts";
import {
  assertOneSignature,
  assertSafePdf,
  loadPdf,
  pageSizes,
  sha256Hex,
  toEngineMarks,
  type RelMark,
} from "./pdf.ts";
import { signdoc, type EngineFlowAction } from "./signdoc.ts";
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
  /**
   * Chave da requisição: a mesma chave de novo não consome outro documento nem cria outro no
   * motor (ex.: "send:<usuário>:<id do envio>", "bulk:<item>", "api:<chave>:<Idempotency-Key>").
   */
  idempotencyKey?: string;
  /** Observadores: acompanham e recebem as notificações, sem assinar. */
  observers?: ObserverInput[] | undefined;
  /** Anexos de apoio (sem assinatura): vão para o motor e uma cópia fica no MDSign. */
  attachments?: AttachmentInput[] | undefined;
  /** Pasta do documento (só no MDSign); ignorada se não for da organização. */
  folderId?: string | null | undefined;
};

export type AttachmentInput = { bytes: Uint8Array; name: string; contentType: AttachmentType };
export type AttachmentType = "application/pdf" | "image/jpeg" | "image/png";
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Tipo real do arquivo pelos primeiros bytes (não confia na extensão nem no navegador). */
export function attachmentType(bytes: Uint8Array): AttachmentType | null {
  const b = bytes;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  return null;
}

/** Anexos do formulário (campo "attachments"): até 5, até 10 MB, PDF limpo, JPG ou PNG. */
export async function readAttachments(entries: FormDataEntryValue[]): Promise<AttachmentInput[]> {
  const files = entries.filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_ATTACHMENTS) throw new AppError("too_many_attachments");
  const out: AttachmentInput[] = [];
  for (const f of files) {
    if (f.size > MAX_ATTACHMENT_BYTES) throw new AppError("attachment_too_large");
    const bytes = new Uint8Array(await f.arrayBuffer());
    const type = attachmentType(bytes);
    if (!type) throw new AppError("attachment_type");
    if (type === "application/pdf") await assertSafePdf(bytes);
    const name =
      f.name
        .replace(/[\\/\u0000-\u001f]/g, "")
        .trim()
        .slice(0, 200) || "anexo";
    out.push({ bytes, name, contentType: type });
  }
  return out;
}

/** Cópia dos anexos no MDSign (bucket privado) para download na página do documento. */
async function saveAttachments(
  documentId: string,
  organizationId: string,
  list: AttachmentInput[],
) {
  for (const [i, a] of list.entries()) {
    const ext =
      a.contentType === "application/pdf" ? "pdf" : a.contentType === "image/png" ? "png" : "jpg";
    const path = `${organizationId}/${documentId}/${i + 1}.${ext}`;
    const { error } = await admin.storage
      .from("attachments")
      .upload(path, a.bytes, { contentType: a.contentType, upsert: true });
    if (error) {
      console.error("attachment copy", error.message);
      continue;
    }
    await admin.from("document_attachments").insert({
      document_id: documentId,
      organization_id: organizationId,
      name: a.name,
      content_type: a.contentType,
      size_bytes: a.bytes.length,
      storage_path: path,
    });
  }
}

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

async function assertQuorumAllowed(userId: string | null) {
  const { data: policy } = await admin
    .from("policies")
    .select("active")
    .eq("id", "quorum_groups")
    .maybeSingle();
  if (policy?.active) return;
  if (userId) {
    const { data: adminRow } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (adminRow) return;
  }
  throw new AppError("quorum_disabled", 403);
}

/** Pessoas de uma regra no motor (o campo antigo signRuleUsers ainda pode vir preenchido). */
export function ruleMembers(a: EngineFlowAction) {
  return a.ruleUsers ?? a.signRuleUsers ?? [];
}

const SENT_BY: Record<string, { person: string; org: string }> = {
  pt: {
    person: "Enviado por {person} ({org}) pelo MDSign.",
    org: "Enviado por {org} pelo MDSign.",
  },
  en: { person: "Sent by {person} ({org}) via MDSign.", org: "Sent by {org} via MDSign." },
  es: {
    person: "Enviado por {person} ({org}) a través de MDSign.",
    org: "Enviado por {org} a través de MDSign.",
  },
};

/**
 * Descrição do documento no motor (aparece nos e-mails de convite): quem enviou + a mensagem.
 * Link público e integração (API) não têm uma pessoa remetente: vai só o nome da organização.
 */
export async function engineDescription(
  input: Pick<CreateInput, "organizationId" | "actorName" | "origin" | "locale" | "message">,
) {
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", input.organizationId)
    .maybeSingle();
  const texts = SENT_BY[input.locale] ?? SENT_BY["pt"]!;
  const person = ["form", "api"].includes(input.origin) ? "" : input.actorName.trim();
  const orgName = (org?.name as string | undefined)?.trim() || "MDSign";
  const line = (person ? texts.person : texts.org)
    .replace("{person}", person)
    .replace("{org}", orgName);
  const message = input.message?.trim();
  return (message ? `${line}\n\n${message}` : line).slice(0, 600);
}

/**
 * Depois de uma falha, o consumo reservado é devolvido ou fica para conferência:
 * - "unknown": o motor já criou o documento (temos o id) ou a chamada de criação ficou sem
 *   resposta (tempo esgotado/rede) → continua contado e vai para conferência;
 * - "release": falhou antes de chamar o motor ou o motor recusou explicitamente → devolve.
 */
export function chargeOutcome(error: unknown, creating: boolean, engineId: string | null) {
  const code = ((error as AppError)?.details as { code?: string } | undefined)?.code ?? "";
  return engineId !== null || (creating && (code === "timeout" || code === "network"))
    ? "unknown"
    : "release";
}

/** Chave de idempotência a partir do id gerado pelo cliente (só formatos seguros). */
export function requestKey(scope: string, owner: string, raw: unknown): string | undefined {
  const id = String(raw ?? "");
  return /^[A-Za-z0-9_-]{8,64}$/.test(id) ? `${scope}:${owner}:${id}` : undefined;
}

export const optionalKey = (key: string | undefined) => (key ? { idempotencyKey: key } : {});

export async function createDocument(input: CreateInput): Promise<Created> {
  // PDF com conteúdo ativo (scripts, anexos, ações) é recusado antes de consumir o plano.
  await assertSafePdf(input.pdf);
  // Quórum só com a política ligada (ou para o Super Admin, durante a homologação).
  if (input.participants.some((p) => p.rule)) await assertQuorumAllowed(input.createdBy);
  // Mais de um aprovador (aprovação em várias etapas) depende do plano; no Cedro, 1 aprovador.
  if (input.participants.filter((p) => p.role === "approver").length > 1)
    await assertFeature(input.organizationId, "approval_multi");
  // Consumo (franquia da pessoa no Cedro; mês no plano pago): reserva antes de criar no motor.
  // O que consome 1 documento: a criação de 1 documento no motor, com qualquer número de
  // participantes. Mesma chave = mesma reserva (reenvio não cobra duas vezes).
  const idem = input.idempotencyKey ?? `auto:${crypto.randomUUID()}`;
  const { data: reserved, error: limitError } = await admin.rpc("reserve_document", {
    org: input.organizationId,
    idem,
    origin: input.origin,
  });
  if (limitError) throw new AppError("internal_error", 500);
  const r = reserved as {
    ok: boolean;
    duplicate?: boolean;
    reservation?: string;
    status?: string;
    document_id?: string | null;
    reason?: string;
  };
  if (r.duplicate) {
    // Já criado nesta mesma requisição: devolve o documento existente, sem criar outro.
    if (r.status === "committed" && r.document_id) return await existingDocument(r.document_id);
    throw new AppError("request_in_progress", 409);
  }
  if (!r.ok)
    throw r.reason === "email_not_confirmed"
      ? new AppError("email_not_confirmed", 403)
      : new AppError("plan_limit_reached", 402);
  const reservation = r.reservation!;
  let creating = false;
  let engineId: string | null = null;
  const delegated = await applyDelegations(input.organizationId, input.participants);
  input = { ...input, participants: delegated.list };
  // E-mail próprio: o MDSign manda convite e lembretes; o motor não manda os de ação pendente.
  const ownEmail =
    input.kind === "send" &&
    input.notify &&
    (await ownEmailFor(input.organizationId, input.createdBy).catch(() => false));

  try {
    for (const m of input.marks ?? []) if (m) assertOneSignature(m);
    const sizes = input.marks?.some((m) => m?.length) ? pageSizes(await loadPdf(input.pdf)) : [];
    const upload = await signdoc.uploadBytes(toBase64(input.pdf));
    const attachmentUploads = [];
    for (const a of input.attachments ?? [])
      attachmentUploads.push({
        id: await signdoc.uploadBytes(toBase64(a.bytes)),
        name: a.name,
        displayName: a.name,
        contentType: a.contentType,
        isPrivate: false,
      });
    creating = true;
    const [created] = await signdoc.createDocuments({
      files: [
        {
          id: upload,
          name: input.filename,
          displayName: input.name,
          contentType: "application/pdf",
        },
      ],
      // Membros de um grupo com quórum viram uma única regra no motor (toFlowActions).
      flowActions: toFlowActions(input.participants, input.locale, (p, i) => {
        const marks = p.role !== "approver" ? (input.marks?.[i] ?? []) : [];
        return marks.length ? { prePositionedMarks: toEngineMarks(marks, sizes) } : {};
      }).actions,
      // O e-mail do motor diz "submetido por <aplicação>": a descrição traz quem enviou de fato.
      description: await engineDescription(input),
      ...(input.expiresAt ? { expirationDate: input.expiresAt } : {}),
      disablePendingActionNotifications: !input.notify || ownEmail,
      ...(input.observers?.length
        ? { observers: input.observers.map((o) => toObserver(o, input.locale)) }
        : {}),
      ...(attachmentUploads.length ? { attachments: attachmentUploads } : {}),
    });
    creating = false;
    if (!created) throw new AppError("engine_rejected", 422);
    engineId = created.documentId;
    const engine = await signdoc.getDocument(created.documentId);

    // Pasta: só se existir nesta organização (uma pasta de outra conta é ignorada).
    let folderId: string | null = null;
    if (input.folderId && /^[0-9a-f-]{36}$/i.test(input.folderId)) {
      const { data: folder } = await admin
        .from("document_folders")
        .select("id")
        .eq("id", input.folderId)
        .eq("organization_id", input.organizationId)
        .maybeSingle();
      folderId = (folder?.id as string | undefined) ?? null;
    }
    const { data: doc, error } = await admin
      .from("documents")
      .insert({
        folder_id: folderId,
        organization_id: input.organizationId,
        created_by: input.createdBy,
        kind: input.kind,
        name: input.name,
        engine_document_id: created.documentId,
        origin: input.origin,
        template_id: input.templateId ?? null,
        expires_at: engine.expirationDate ?? null,
        message: input.message ?? null,
        own_email: ownEmail,
        email_locale: ["pt", "en", "es"].includes(input.locale) ? input.locale : "pt",
        reminders_enabled: input.reminders?.enabled ?? input.notify,
        reminder_first_days: input.reminders?.firstDays ?? 2,
        reminder_every_days: input.reminders?.everyDays ?? 3,
        reminder_max: input.reminders?.max ?? 3,
      })
      .select("id")
      .single();
    if (error || !doc) throw error ?? new AppError("internal_error", 500);
    // Documento existe no motor e no MDSign: consumo definitivo.
    await admin.rpc("commit_document", {
      reservation,
      doc: doc.id,
      engine: created.documentId,
    });
    // Versão 1, com o hash do arquivo enviado (correções viram versão 2, 3…).
    await admin.from("document_versions").insert({
      document_id: doc.id,
      organization_id: input.organizationId,
      number: 1,
      file_name: input.filename.slice(0, 200),
      sha256: await sha256Hex(input.pdf),
      size_bytes: input.pdf.length,
      created_by: input.createdBy,
      created_by_name: input.actorName.slice(0, 160) || null,
    });

    // Liga cada participante à ação do motor (mesma ordem de envio) e à conta MDSign, se houver.
    const actions = [...(engine.flowActions ?? [])];
    const rows = [];
    for (const [i, p] of input.participants.entries()) {
      const d = delegated.info[i];
      // Regra (quórum): todos os membros apontam para a mesma ação do motor.
      const action = p.rule
        ? actions.find(
            (a) =>
              (a.type === "SignRule" || a.type === "ApproverRule") &&
              a.step === p.step &&
              ruleMembers(a).some((u) => (u.email ?? "").toLowerCase() === p.email),
          )
        : (() => {
            const idx = actions.findIndex(
              (a) => a.step === p.step && (a.user?.email ?? "").toLowerCase() === p.email,
            );
            return idx >= 0 ? actions.splice(idx, 1)[0] : undefined;
          })();
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
        ...(p.rule
          ? { rule_key: p.rule.key, rule_name: p.rule.name, rule_required: p.rule.required }
          : {}),
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
    // Convite pelos canais do MDSign (e-mail próprio e WhatsApp) para quem já está com a vez.
    if (input.kind === "send" && input.notify)
      await enqueueChannels(
        doc.id,
        (inserted ?? []).filter((r) => r.status === "pending").map((r) => r.id as string),
        "signature_requested",
        input.createdBy,
      );
    if (input.observers?.length)
      await saveObservers(doc.id, input.organizationId, input.observers, engine);
    if (input.attachments?.length)
      await saveAttachments(doc.id, input.organizationId, input.attachments).catch((e) =>
        console.error("attachments", e),
      );

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
    const uncertain = chargeOutcome(error, creating, engineId) === "unknown";
    if (uncertain)
      await admin
        .rpc("mark_document_unknown", {
          reservation,
          reason: String((error as Error)?.message ?? error).slice(0, 200),
          engine: engineId,
        })
        .then(
          () => undefined,
          () => undefined,
        );
    else
      await admin
        .rpc("release_document", {
          reservation,
          reason: String((error as Error)?.message ?? error).slice(0, 200),
        })
        .then(
          () => undefined,
          () => undefined,
        );
    throw error;
  }
}

/** Reenvio de uma requisição já concluída: devolve o mesmo documento. */
async function existingDocument(documentId: string): Promise<Created> {
  const { data: doc } = await admin
    .from("documents")
    .select("id, engine_document_id, document_participants (id)")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) throw new AppError("request_in_progress", 409);
  return {
    documentId: doc.id as string,
    engineDocumentId: doc.engine_document_id as string,
    participantIds: ((doc.document_participants as { id: string }[] | null) ?? []).map((p) => p.id),
  };
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
