// Link seguro de assinatura (enviado por WhatsApp): /s/<código> no site chama esta função.
// Confere o código (só o hash fica no banco), a validade e se é a vez da pessoa; registra
// "abriu o link" e devolve a cerimônia do motor — onde a autenticação exigida acontece.
// O link sozinho não assina nada nem dá acesso ao documento fora da cerimônia.

import { admin } from "../_shared/auth.ts";
import { AppError, corsHeaders, handleError, json } from "../_shared/http.ts";
import { hashToken } from "../_shared/notifications.ts";
import { signdoc } from "../_shared/signdoc.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", 405);
    const body = (await req.json().catch(() => ({}))) as { token?: string };
    const token = String(body.token ?? "");
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new AppError("link_invalid", 404);
    const { data: link } = await admin
      .from("sign_links")
      .select(
        "id, document_id, participant_id, organization_id, expires_at, revoked_at, opened_at, open_count",
      )
      .eq("token_hash", await hashToken(token))
      .maybeSingle();
    if (!link || link.revoked_at) throw new AppError("link_invalid", 404);
    if (new Date(link.expires_at).getTime() < Date.now()) throw new AppError("link_expired", 410);

    const [{ data: doc }, { data: p }] = await Promise.all([
      admin
        .from("documents")
        .select("status, engine_document_id")
        .eq("id", link.document_id)
        .single(),
      admin
        .from("document_participants")
        .select("name, email, cpf, status, engine_flow_action_id")
        .eq("id", link.participant_id)
        .single(),
    ]);
    if (!doc || !p) throw new AppError("link_invalid", 404);
    // Já assinou, documento encerrado ou ainda não chegou a vez: informa, sem abrir a cerimônia.
    if (doc.status !== "pending") return json({ state: doc.status }, 200, origin);
    if (p.status === "completed") return json({ state: "done" }, 200, origin);
    if (p.status !== "pending") return json({ state: "not_your_turn" }, 200, origin);

    // 1ª abertura: só quem consegue marcar (opened_at ainda vazio) grava o evento — duas
    // chamadas juntas não duplicam o registro.
    const { data: first } = await admin
      .from("sign_links")
      .update({ opened_at: new Date().toISOString() })
      .eq("id", link.id)
      .is("opened_at", null)
      .select("id");
    if (first?.length)
      await admin.from("document_events").insert({
        document_id: link.document_id,
        organization_id: link.organization_id,
        type: "participant.link_opened",
        actor_name: p.name,
        source: "mdsign",
        data: { participant: link.participant_id },
      });
    await admin
      .from("sign_links")
      .update({ open_count: link.open_count + 1 })
      .eq("id", link.id);

    const action = await signdoc.actionUrl(doc.engine_document_id, {
      emailAddress: p.email,
      ...(p.cpf ? { identifier: p.cpf } : {}),
      ...(p.engine_flow_action_id ? { flowActionId: p.engine_flow_action_id } : {}),
    });
    return json({ state: "ready", url: action.url }, 200, origin);
  } catch (error) {
    return handleError(error, origin);
  }
});
