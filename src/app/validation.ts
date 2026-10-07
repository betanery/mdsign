import type { AppMessages } from "@/i18n/app/pt";

/** Validações e formatação de documentos brasileiros (somente dígitos no banco). */

export const onlyDigits = (value: string) => value.replace(/\D/g, "");

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digit = (len: number) => {
    const weights =
      len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(cnpj[i]), 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

export function formatCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function formatCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/**
 * Celular enquanto a pessoa digita: (61) 99167-0611 / (61) 3333-4444. Número estrangeiro
 * (começa com "+") fica como foi digitado — o servidor normaliza para o formato do motor.
 */
export function formatPhone(value: string): string {
  if (value.trim().startsWith("+")) return value;
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** CEP enquanto a pessoa digita: 70000-000. */
export function formatCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Endereço pelo CEP (ViaCEP, serviço público): rua, bairro e cidade/UF. Null se não achar. */
export async function lookupCep(
  cep: string,
): Promise<{ address: string; province: string; city: string } | null> {
  const d = onlyDigits(cep);
  if (d.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as {
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (!res.ok || data.erro) return null;
    return {
      address: data.logradouro ?? "",
      province: data.bairro ?? "",
      city: data.localidade ? `${data.localidade}${data.uf ? `/${data.uf}` : ""}` : "",
    };
  } catch {
    return null;
  }
}

/** Mensagem amigável para erros do Supabase (Auth e banco). */
export function friendlyError(
  error: { message?: string | undefined; code?: string | undefined } | null | undefined,
  t: AppMessages,
): string {
  const msg = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (msg.includes("invalid login credentials")) return t.auth.invalidCredentials;
  if (msg.includes("email not confirmed")) return t.auth.emailNotConfirmed;
  if (msg.includes("already registered") || msg.includes("user_already_exists"))
    return t.auth.alreadyRegistered;
  if (msg.includes("password") && msg.includes("characters")) return t.auth.weakPassword;
  if (msg.includes("rate limit") || msg.includes("over_email_send_rate_limit"))
    return t.auth.rateLimited;
  // E-mail padrão do Supabase sem SMTP próprio: só envia para a equipe do projeto.
  if (
    msg.includes("email_address_not_authorized") ||
    msg.includes("not authorized") ||
    msg.includes("sending confirmation")
  )
    return t.auth.emailNotSent;
  if (msg.includes("profiles_cpf_unique") || (msg.includes("23505") && msg.includes("cpf")))
    return t.settings.cpfTaken;
  if (msg.includes("last_owner")) return t.organization.lastOwner;
  if (msg.includes("plan_users_limit")) return t.errors["plan_users_limit"]!;
  if (msg.includes("invitation_email_mismatch")) return t.invite.mismatch;
  if (msg.includes("invitation_invalid")) return t.invite.invalid;
  if (msg.includes("forbidden") || msg.includes("42501") || msg.includes("row-level security"))
    return t.common.forbidden;
  return t.common.genericError;
}

/**
 * Celular no formato internacional que o motor exige ("+55 11 91234-5678"). Aceita o número
 * como a pessoa digita: com ou sem DDI, com 0 na frente do DDD, com pontuação.
 * Devolve null se não der para entender o número.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  let d = value.replace(/\D/g, "");
  if (value.startsWith("+") && !d.startsWith("55")) {
    // Estrangeiro: mantém o DDI informado.
    return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
  }
  if (!value.startsWith("+")) d = d.replace(/^0+/, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = d.slice(0, 2);
  const local = d.slice(2);
  return `+55 ${ddd} ${local.slice(0, local.length - 4)}-${local.slice(-4)}`;
}

/** Domínios reservados para exemplos e testes (RFC 2606/6761): não recebem e-mail. */
export const reservedEmailDomain = (email: string) =>
  /@(?:[^@\s]+\.)?(?:example\.(?:com|net|org)|[^@\s]+\.(?:example|test|invalid|localhost))$/i.test(
    email.trim(),
  );
