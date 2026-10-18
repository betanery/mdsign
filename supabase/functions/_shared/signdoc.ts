// Cliente da API SignDoc/Lacuna (somente no servidor). Chave em SIGNDOC_API_KEY.

import { admin } from "./auth.ts";
import { AppError } from "./http.ts";
import { fetchWithTimeout, maskPersonal, NetError } from "./net.ts";

const BASE_URL = (Deno.env.get("SIGNDOC_BASE_URL") ?? "https://sign.signdocmd.com.br").replace(
  /\/$/,
  "",
);
const API_KEY = Deno.env.get("SIGNDOC_API_KEY") ?? "";

export type EngineFlowAction = {
  id: string;
  type: "Signer" | "Approver" | "SignRule" | "ApproverRule";
  status: "Created" | "Pending" | "Completed" | "Refused";
  step: number;
  user?: { name?: string; email?: string; identifier?: string };
  pendingDate?: string | null;
  updateDate?: string | null;
  refusalReason?: string | null;
  /** Regras (quórum): pessoas da regra e quantas precisam agir. */
  ruleName?: string | null;
  numberRequiredActions?: number | null;
  ruleUsers?: EngineRuleUser[] | null;
  signRuleUsers?: EngineRuleUser[] | null;
};

export type EngineRuleUser = {
  id?: string;
  name?: string;
  email?: string;
  identifier?: string | null;
  completeActionDate?: string | null;
  signatureDate?: string | null;
  hasRefused?: boolean;
  refusalDate?: string | null;
  refusalReason?: string | null;
};

export type EngineDocument = {
  id: string;
  name: string;
  status: "Pending" | "FlowConcluded" | "Concluded" | "Refused" | "Canceled" | "Expired";
  creationDate: string;
  updateDate: string;
  expirationDate?: string | null;
  flowActions: EngineFlowAction[];
  observers?: { id: string; user?: { name?: string; email?: string } }[];
  /** Código de validação (impresso na página de assinaturas do PDF). */
  key?: string | null;
};

/** Assinatura como o motor devolve na validação (só os campos que o MDSign usa). */
export type EngineSigner = {
  subjectName?: string | null;
  identifier?: string | null;
  emailAddress?: string | null;
  isElectronic?: boolean | null;
  signingTime?: string | null;
  validationResults?: { isValid?: boolean | null } | null;
};

export type EngineSignaturesInfo = {
  name?: string | null;
  status?: string | null;
  isConcluded?: boolean | null;
  creationDate?: string | null;
  updateDate?: string | null;
  signers?: EngineSigner[] | null;
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const maskPath = (path: string) => path.split("?")[0]!.replace(UUID, ":id");

/** Grava o erro do motor (sem dados pessoais) para o Super Admin; nunca derruba a chamada. */
async function recordEngineError(
  method: string,
  path: string,
  kind: "http" | "timeout" | "network",
  status: number | null,
  code: string | null,
  message: string | null,
) {
  try {
    const doc = /\/documents\/([0-9a-f-]{36})/i.exec(path)?.[1] ?? null;
    await admin.from("engine_errors").insert({
      operation: `${method} ${maskPath(path)}`.slice(0, 200),
      engine_document_id: doc,
      kind,
      http_status: status,
      code: code?.slice(0, 120) ?? null,
      message: message ? maskPersonal(message).slice(0, 500) : null,
    });
  } catch (e) {
    console.error("engine_errors", e);
  }
}

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  init?: RequestInit,
  /** Validação pública: código ou PDF recusado é resposta normal, não erro do motor. */
  quiet = false,
): Promise<T> {
  if (!API_KEY) throw new AppError("engine_not_configured", 503);
  let res: Response;
  try {
    res = await fetchWithTimeout(`${BASE_URL}${path}`, {
      method,
      ...init,
      headers: {
        "X-Api-Key": API_KEY,
        ...(body !== undefined && !(body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...(init?.headers ?? {}),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch (e) {
    // Motor lento ou fora do ar: erro amigável e registro para diagnóstico.
    const kind = e instanceof NetError ? e.kind : "network";
    await recordEngineError(method, path, kind, null, null, String((e as Error)?.message ?? e));
    throw new AppError("engine_unavailable", 502, { code: kind, message: null, errors: null });
  }
  const text = await res.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const code = String(data?.["code"] ?? data?.["exceptionCode"] ?? "") || null;
    const message = typeof data?.["message"] === "string" ? (data["message"] as string) : text;
    const expected = quiet && res.status >= 400 && res.status < 500;
    if (!expected) {
      console.error(
        "signdoc",
        method,
        maskPath(path),
        res.status,
        maskPersonal(text.slice(0, 500)),
      );
      await recordEngineError(method, path, "http", res.status, code, message);
    }
    // 400/422 trazem o motivo; 500 traz exceptionCode para os logs do servidor.
    throw new AppError(
      res.status >= 500 ? "engine_unavailable" : "engine_rejected",
      res.status >= 500 ? 502 : 422,
      {
        code,
        message:
          typeof data?.["message"] === "string"
            ? maskPersonal((data["message"] as string).slice(0, 300))
            : null,
        errors: data?.["errors"] ?? null,
      },
    );
  }
  return data as T;
}

export const signdoc = {
  async upload(file: File): Promise<string> {
    const form = new FormData();
    form.append("file", file, file.name);
    const r = await call<{ id: string }>("POST", "/api/uploads", form);
    return r.id;
  },
  /** Validação pelo código impresso no documento. */
  validateByKey(key: string) {
    return call<EngineSignaturesInfo>(
      "GET",
      `/api/documents/keys/${encodeURIComponent(key)}/signatures`,
      undefined,
      undefined,
      true,
    );
  },
  /** Validação de um PDF assinado enviado por qualquer pessoa. */
  async validateFile(file: File) {
    const fileId = await this.upload(file);
    return call<EngineSigner[]>(
      "POST",
      "/api/documents/validate-signatures",
      { fileId, mimeType: "application/pdf" },
      undefined,
      true,
    );
  },
  async uploadBytes(base64: string): Promise<string> {
    const r = await call<{ id: string }>("POST", "/api/uploads/bytes", { bytes: base64 });
    return r.id;
  },
  createDocuments(request: unknown) {
    return call<{ uploadId: string; documentId: string }[]>("POST", "/api/documents", request);
  },
  getDocument(id: string) {
    return call<EngineDocument>("GET", `/api/documents/${id}`);
  },
  actionUrl(
    id: string,
    body: { identifier?: string; emailAddress?: string; flowActionId?: string },
  ) {
    return call<{ url: string; embedUrl: string }>("POST", `/api/documents/${id}/action-url`, body);
  },
  /** Link temporário para baixar uma versão (Signatures = PDF assinado; PrinterFriendlyVersion = com manifesto). */
  ticket(id: string, type: "Original" | "PrinterFriendlyVersion" | "Signatures") {
    return call<{ location: string }>("GET", `/api/documents/${id}/ticket?type=${type}`);
  },
  /** Adiciona, altera ou remove participantes/observadores ainda pendentes. */
  editFlow(id: string, body: Record<string, unknown>) {
    return call<null>("POST", `/api/documents/${id}/flow`, body);
  },
  /** Nova versão do arquivo: o fluxo de assinatura recomeça. */
  addVersion(id: string, body: Record<string, unknown>) {
    return call<null>("POST", `/api/documents/${id}/versions`, body);
  },
  cancel(id: string, reason: string) {
    return call<null>("POST", `/api/documents/${id}/cancellation`, { reason });
  },
  /** Recusa o documento com motivo (o fluxo pausa; só volta com nova versão). */
  refuse(id: string, reason: string) {
    return call<null>("POST", `/api/documents/${id}/refusal`, { reason });
  },
  remind(documentId: string, flowActionId: string) {
    return call<null>("POST", "/api/notifications/flow-action-reminder", {
      documentId,
      flowActionId,
    });
  },
  baseUrl: BASE_URL,
};

/** Status do motor → status do MDSign. */
export function mapDocumentStatus(status: EngineDocument["status"]) {
  switch (status) {
    case "Concluded":
      return "concluded" as const;
    case "Refused":
      return "refused" as const;
    case "Canceled":
      return "canceled" as const;
    case "Expired":
      return "expired" as const;
    default:
      return "pending" as const;
  }
}
