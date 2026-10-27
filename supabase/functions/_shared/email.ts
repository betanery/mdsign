// E-mail próprio do MDSign (Resend): convite, lembrete e reenvio para quem precisa assinar.
//
// Regras:
// - O e-mail leva o link seguro do MDSign (/s/…), o mesmo do WhatsApp: abre a cerimônia do motor
//   com a autenticação exigida. Nunca leva o PDF, chave ou token permanente.
// - "Enviado" = o Resend aceitou. Entrega e abertura não são afirmadas.
// - Modo de teste (remetente @resend.dev): o Resend só entrega para o dono da conta, então o
//   MDSign só usa o e-mail próprio em documentos criados por um Super Admin.

import { fetchWithTimeout } from "./net.ts";

const RESEND = "https://api.resend.com/emails";

export const emailConfigured = () =>
  Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("EMAIL_FROM"));

/** Remetente de teste do Resend: entrega só para o e-mail da conta. */
export const emailTestMode = () => /@resend\.dev>?\s*$/i.test(Deno.env.get("EMAIL_FROM") ?? "");

export async function sendEmail(p: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Evita e-mail dobrado se a mesma notificação for tentada de novo. */
  idempotencyKey: string;
}) {
  const res = await fetchWithTimeout(RESEND, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": p.idempotencyKey,
    },
    body: JSON.stringify({
      from: Deno.env.get("EMAIL_FROM"),
      to: [p.to],
      subject: p.subject,
      html: p.html,
      text: p.text,
    }),
  });
  const data = (await res.json().catch(() => null)) as {
    id?: string;
    name?: string;
    message?: string;
  } | null;
  if (!res.ok) throw new Error(`resend_${res.status}:${data?.name ?? ""}`.slice(0, 200));
  return data?.id ?? null;
}

type Kind = "signature_requested" | "reminder" | "resend";
type Locale = "pt" | "en" | "es";

const T: Record<
  Locale,
  {
    action: Record<string, string>;
    subject: Record<Kind, string>;
    hello: string;
    sentBy: string;
    sentByOrg: string;
    reminder: string;
    message: string;
    button: Record<string, string>;
    linkNote: string;
    ignore: string;
    footer: string;
  }
> = {
  pt: {
    action: { signer: "assinar", approver: "aprovar", witness: "assinar como testemunha" },
    subject: {
      signature_requested: "{sender} enviou “{doc}” para você {action}",
      reminder: "Lembrete: “{doc}” aguarda você {action}",
      resend: "{sender} enviou “{doc}” para você {action}",
    },
    hello: "Olá, {first}!",
    sentBy: "{person} ({org}) enviou o documento <b>{doc}</b> para você {action} pelo MDSign.",
    sentByOrg: "{org} enviou o documento <b>{doc}</b> para você {action} pelo MDSign.",
    reminder: "Lembrete: o documento <b>{doc}</b>, de {org}, ainda aguarda você {action}.",
    message: "Mensagem de quem enviou:",
    button: { signer: "Abrir e assinar", approver: "Abrir e aprovar", witness: "Abrir e assinar" },
    linkNote:
      "O link é pessoal e vale por 7 dias. A verificação exigida (código, selfie ou certificado) acontece na própria assinatura.",
    ignore: "Se você não reconhece este envio, ignore este e-mail.",
    footer: "MDSign · assinatura eletrônica · Mundo Digital Tecnologia da Informação Ltda.",
  },
  en: {
    action: { signer: "sign", approver: "approve", witness: "sign as a witness" },
    subject: {
      signature_requested: "{sender} sent “{doc}” for you to {action}",
      reminder: "Reminder: “{doc}” is waiting for you to {action}",
      resend: "{sender} sent “{doc}” for you to {action}",
    },
    hello: "Hi, {first}!",
    sentBy: "{person} ({org}) sent the document <b>{doc}</b> for you to {action} via MDSign.",
    sentByOrg: "{org} sent the document <b>{doc}</b> for you to {action} via MDSign.",
    reminder:
      "Reminder: the document <b>{doc}</b>, from {org}, is still waiting for you to {action}.",
    message: "Message from the sender:",
    button: { signer: "Open and sign", approver: "Open and approve", witness: "Open and sign" },
    linkNote:
      "This link is personal and valid for 7 days. The required verification (code, selfie or certificate) happens during signing.",
    ignore: "If you don't recognize this request, ignore this email.",
    footer: "MDSign · electronic signature · Mundo Digital Tecnologia da Informação Ltda.",
  },
  es: {
    action: { signer: "firmar", approver: "aprobar", witness: "firmar como testigo" },
    subject: {
      signature_requested: "{sender} envió “{doc}” para que lo {action}",
      reminder: "Recordatorio: “{doc}” espera que lo {action}",
      resend: "{sender} envió “{doc}” para que lo {action}",
    },
    hello: "¡Hola, {first}!",
    sentBy:
      "{person} ({org}) envió el documento <b>{doc}</b> para que lo {action} a través de MDSign.",
    sentByOrg: "{org} envió el documento <b>{doc}</b> para que lo {action} a través de MDSign.",
    reminder: "Recordatorio: el documento <b>{doc}</b>, de {org}, aún espera que lo {action}.",
    message: "Mensaje de quien lo envió:",
    button: { signer: "Abrir y firmar", approver: "Abrir y aprobar", witness: "Abrir y firmar" },
    linkNote:
      "El enlace es personal y vale por 7 días. La verificación exigida (código, selfie o certificado) se hace en la propia firma.",
    ignore: "Si no reconoces este envío, ignora este correo.",
    footer: "MDSign · firma electrónica · Mundo Digital Tecnologia da Informação Ltda.",
  },
};

export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const fill = (s: string, v: Record<string, string>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

/** Convite, lembrete ou reenvio: assunto, HTML e texto simples (mesmo conteúdo). */
export function signatureEmail(p: {
  kind: Kind;
  locale: string;
  role: string;
  name: string;
  /** Pessoa que enviou; vazio em link público e integração (só a organização). */
  senderName: string;
  orgName: string;
  docName: string;
  message?: string | null;
  link: string;
}) {
  const t = T[(p.locale as Locale) in T ? (p.locale as Locale) : "pt"];
  const action = t.action[p.role] ?? t.action["signer"]!;
  const first = p.name.trim().split(/\s+/)[0] ?? p.name;
  const sender = p.senderName.trim() || p.orgName;
  // Valores do usuário entram escapados no HTML; o texto simples usa os originais.
  const html = (v: string) => escapeHtml(v);
  const lead = p.kind === "reminder" ? t.reminder : p.senderName.trim() ? t.sentBy : t.sentByOrg;
  const vals = { person: p.senderName.trim(), org: p.orgName, doc: p.docName, action };
  const leadHtml = fill(
    lead,
    Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, html(v)])),
  );
  const leadText = fill(lead, vals).replace(/<\/?b>/g, "");
  const message = p.message?.trim() ?? "";
  const button = t.button[p.role] ?? t.button["signer"]!;

  const subject = fill(t.subject[p.kind], { sender, doc: p.docName, action }).slice(0, 200);
  const htmlBody = `<!doctype html><html><body style="margin:0;background:#f4f2f8;font-family:Arial,Helvetica,sans-serif;color:#1f1a2e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#9724C2;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:bold">MDSign</td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.5">
<p style="margin:0 0 12px">${html(fill(t.hello, { first }))}</p>
<p style="margin:0 0 16px">${leadHtml}</p>
${
  message
    ? `<p style="margin:0 0 4px;color:#5b5570;font-size:14px">${html(t.message)}</p><p style="margin:0 0 16px;padding:12px;background:#f4f2f8;border-radius:8px;white-space:pre-line">${html(message)}</p>`
    : ""
}
<p style="margin:24px 0" align="center"><a href="${html(p.link)}" style="display:inline-block;background:#9724C2;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px">${html(button)}</a></p>
<p style="margin:0 0 8px;color:#5b5570;font-size:13px">${html(t.linkNote)}</p>
<p style="margin:0;color:#5b5570;font-size:13px">${html(t.ignore)}</p>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #ece8f3;color:#8a84a0;font-size:12px">${html(t.footer)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    fill(t.hello, { first }),
    "",
    leadText,
    ...(message ? ["", t.message, message] : []),
    "",
    `${button}: ${p.link}`,
    "",
    t.linkNote,
    t.ignore,
    "",
    t.footer,
  ].join("\n");
  return { subject, html: htmlBody, text };
}

/** Cópia do documento concluído para alguém de fora do fluxo (link com prazo para baixar). */
export function shareEmail(p: {
  locale: string;
  senderName: string;
  orgName: string;
  docName: string;
  message?: string | null;
  link: string;
  days: number;
  /** Página pública de validação (o destinatário confere a autenticidade). */
  validateUrl: string;
}) {
  const L = {
    pt: {
      subject: "{sender} compartilhou o documento assinado “{doc}”",
      lead: "<b>{sender}</b> ({org}) compartilhou com você o documento assinado <b>{doc}</b>.",
      message: "Mensagem:",
      button: "Baixar documento assinado",
      note: "O link vale por {days} dias. A autenticidade pode ser conferida em {validate}.",
      footer: "Enviado pelo MDSign. Se não esperava este e-mail, pode ignorá-lo.",
    },
    en: {
      subject: "{sender} shared the signed document “{doc}”",
      lead: "<b>{sender}</b> ({org}) shared the signed document <b>{doc}</b> with you.",
      message: "Message:",
      button: "Download signed document",
      note: "The link is valid for {days} days. Authenticity can be checked at {validate}.",
      footer: "Sent by MDSign. If you weren't expecting this email, you can ignore it.",
    },
    es: {
      subject: "{sender} compartió el documento firmado “{doc}”",
      lead: "<b>{sender}</b> ({org}) compartió con usted el documento firmado <b>{doc}</b>.",
      message: "Mensaje:",
      button: "Descargar documento firmado",
      note: "El enlace vale {days} días. La autenticidad puede verificarse en {validate}.",
      footer: "Enviado por MDSign. Si no esperaba este correo, puede ignorarlo.",
    },
  } as const;
  const t = L[(p.locale as Locale) in L ? (p.locale as Locale) : "pt"];
  const sender = p.senderName.trim() || p.orgName;
  const vals = {
    sender,
    org: p.orgName,
    doc: p.docName,
    days: String(p.days),
    validate: p.validateUrl,
  };
  const esc = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, escapeHtml(v)]));
  const message = p.message?.trim() ?? "";
  const subject = fill(t.subject, vals).slice(0, 200);
  const html = `<!doctype html><html><body style="margin:0;background:#f4f2f8;font-family:Arial,Helvetica,sans-serif;color:#1f1a2e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#9724C2;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:bold">MDSign</td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.5">
<p style="margin:0 0 16px">${fill(t.lead, esc)}</p>
${
  message
    ? `<p style="margin:0 0 4px;color:#5b5570;font-size:14px">${escapeHtml(t.message)}</p><p style="margin:0 0 16px;padding:12px;background:#f4f2f8;border-radius:8px;white-space:pre-line">${escapeHtml(message)}</p>`
    : ""
}
<p style="margin:24px 0" align="center"><a href="${escapeHtml(p.link)}" style="display:inline-block;background:#9724C2;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px">${escapeHtml(t.button)}</a></p>
<p style="margin:0;color:#5b5570;font-size:13px">${escapeHtml(fill(t.note, vals))}</p>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #ece8f3;color:#8a84a0;font-size:12px">${escapeHtml(t.footer)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    fill(t.lead, vals).replace(/<\/?b>/g, ""),
    ...(message ? ["", t.message, message] : []),
    "",
    `${t.button}: ${p.link}`,
    "",
    fill(t.note, vals),
    "",
    t.footer,
  ].join("\n");
  return { subject, html, text };
}
