// Cliente da API SignDoc/Lacuna (somente no servidor). Chave em SIGNDOC_API_KEY.

import { AppError } from "./http.ts";

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
};

export type EngineDocument = {
  id: string;
  name: string;
  status: "Pending" | "FlowConcluded" | "Concluded" | "Refused" | "Canceled" | "Expired";
  creationDate: string;
  updateDate: string;
  expirationDate?: string | null;
  flowActions: EngineFlowAction[];
};

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  if (!API_KEY) throw new AppError("engine_not_configured", 503);
  const res = await fetch(`${BASE_URL}${path}`, {
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
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    console.error("signdoc", method, path, res.status, text.slice(0, 500));
    // 400/422 trazem o motivo; 500 traz exceptionCode para os logs do servidor.
    throw new AppError(
      res.status >= 500 ? "engine_unavailable" : "engine_rejected",
      res.status >= 500 ? 502 : 422,
      {
        code: data?.code ?? data?.exceptionCode ?? null,
        message: typeof data?.message === "string" ? data.message.slice(0, 300) : null,
        errors: data?.errors ?? null,
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
  cancel(id: string, reason: string) {
    return call<null>("POST", `/api/documents/${id}/cancellation`, { reason });
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
