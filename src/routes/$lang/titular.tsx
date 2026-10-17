import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { Container } from "@/components/landing/section";
import { siteConfig } from "@/config/site";
import { isLocale, type Locale, useI18n } from "@/i18n";
import { seoHead } from "@/i18n/seo";
import { supabase } from "@/lib/supabase";

// Canal do titular de dados (LGPD art. 18). Pedido com ou sem conta; devolve um protocolo.
// O atendimento acontece no Super Admin → Titulares.

const copy = {
  pt: {
    title: "Seus direitos sobre dados pessoais",
    intro:
      "Use este formulário para pedir acesso, correção, exclusão, portabilidade ou informações sobre seus dados pessoais no MDSign. Você recebe um protocolo e a resposta chega pelo e-mail informado.",
    name: "Nome completo",
    email: "E-mail para resposta",
    relation: "Sua relação com o MDSign",
    relations: {
      user: "Tenho conta no MDSign",
      signer: "Assinei ou recebi um documento pelo MDSign",
      representative: "Represento o titular dos dados",
      other: "Outra",
    },
    kind: "O que você precisa",
    kinds: {
      access: "Saber quais dados meus são tratados (acesso)",
      correction: "Corrigir dados incompletos ou errados",
      deletion: "Excluir meus dados",
      portability: "Receber meus dados (portabilidade)",
      sharing_info: "Saber com quem meus dados são compartilhados",
      revoke_consent: "Retirar um consentimento (ex.: marketing)",
      opposition: "Me opor a um tratamento",
      other: "Outro pedido",
    },
    organization: "Empresa que enviou o documento (se souber)",
    orgHint:
      "Documentos enviados por uma empresa cliente são controlados por ela; podemos encaminhar o pedido.",
    description: "Descreva o pedido",
    descriptionHint: "Não envie CPF, documentos ou senhas por aqui.",
    submit: "Enviar pedido",
    sending: "Enviando…",
    done: "Pedido registrado",
    doneText:
      "Guarde o número do protocolo. Podemos pedir uma confirmação de identidade pelo e-mail informado antes de responder.",
    protocol: "Protocolo",
    deadline: "Prazo de resposta: até 15 dias.",
    errors: {
      invalid: "Confira os campos destacados.",
      rate: "Muitos pedidos deste endereço. Tente de novo em uma hora.",
      generic: "Não foi possível enviar agora. Tente de novo em instantes.",
    },
    contact: "Também atendemos pelo e-mail",
    metaTitle: "Direitos do titular de dados | MDSign",
    metaDescription: "Peça acesso, correção, exclusão ou portabilidade dos seus dados no MDSign.",
  },
  en: {
    title: "Your personal data rights",
    intro:
      "Use this form to request access, correction, deletion, portability or information about your personal data in MDSign. You get a protocol number and the answer goes to the email you provide.",
    name: "Full name",
    email: "Email for the answer",
    relation: "Your relationship with MDSign",
    relations: {
      user: "I have an MDSign account",
      signer: "I signed or received a document through MDSign",
      representative: "I represent the data subject",
      other: "Other",
    },
    kind: "What you need",
    kinds: {
      access: "Know which of my data is processed (access)",
      correction: "Correct incomplete or wrong data",
      deletion: "Delete my data",
      portability: "Receive my data (portability)",
      sharing_info: "Know who my data is shared with",
      revoke_consent: "Withdraw a consent (e.g., marketing)",
      opposition: "Object to a processing",
      other: "Other request",
    },
    organization: "Company that sent the document (if you know)",
    orgHint:
      "Documents sent by a client company are controlled by it; we may forward your request.",
    description: "Describe your request",
    descriptionHint: "Do not send CPF, documents or passwords here.",
    submit: "Send request",
    sending: "Sending…",
    done: "Request registered",
    doneText:
      "Keep the protocol number. We may ask you to confirm your identity through the email provided before answering.",
    protocol: "Protocol",
    deadline: "Answer within 15 days.",
    errors: {
      invalid: "Check the highlighted fields.",
      rate: "Too many requests from this address. Try again in an hour.",
      generic: "Could not send now. Try again shortly.",
    },
    contact: "We also answer by email at",
    metaTitle: "Data subject rights | MDSign",
    metaDescription: "Request access, correction, deletion or portability of your data in MDSign.",
  },
  es: {
    title: "Sus derechos sobre datos personales",
    intro:
      "Use este formulario para pedir acceso, corrección, eliminación, portabilidad o información sobre sus datos personales en MDSign. Recibe un protocolo y la respuesta llega al correo informado.",
    name: "Nombre completo",
    email: "Correo para la respuesta",
    relation: "Su relación con MDSign",
    relations: {
      user: "Tengo cuenta en MDSign",
      signer: "Firmé o recibí un documento por MDSign",
      representative: "Represento al titular de los datos",
      other: "Otra",
    },
    kind: "Qué necesita",
    kinds: {
      access: "Saber qué datos míos se tratan (acceso)",
      correction: "Corregir datos incompletos o erróneos",
      deletion: "Eliminar mis datos",
      portability: "Recibir mis datos (portabilidad)",
      sharing_info: "Saber con quién se comparten mis datos",
      revoke_consent: "Retirar un consentimiento (ej.: marketing)",
      opposition: "Oponerme a un tratamiento",
      other: "Otro pedido",
    },
    organization: "Empresa que envió el documento (si lo sabe)",
    orgHint:
      "Los documentos enviados por una empresa cliente son controlados por ella; podemos remitir el pedido.",
    description: "Describa el pedido",
    descriptionHint: "No envíe CPF, documentos ni contraseñas por aquí.",
    submit: "Enviar pedido",
    sending: "Enviando…",
    done: "Pedido registrado",
    doneText:
      "Guarde el número de protocolo. Podemos pedir una confirmación de identidad por el correo informado antes de responder.",
    protocol: "Protocolo",
    deadline: "Plazo de respuesta: hasta 15 días.",
    errors: {
      invalid: "Revise los campos destacados.",
      rate: "Demasiados pedidos desde esta dirección. Intente de nuevo en una hora.",
      generic: "No fue posible enviar ahora. Intente de nuevo en unos instantes.",
    },
    contact: "También atendemos por correo en",
    metaTitle: "Derechos del titular de datos | MDSign",
    metaDescription: "Pida acceso, corrección, eliminación o portabilidad de sus datos en MDSign.",
  },
} as const;

export const Route = createFileRoute("/$lang/titular")({
  head: ({ params }) => {
    if (!isLocale(params.lang)) return {};
    const c = copy[params.lang];
    return seoHead(params.lang, "/titular", c.metaTitle, c.metaDescription);
  },
  component: TitularPage,
});

const fieldClass =
  "w-full rounded-lg border border-input bg-white px-3 py-2 text-base focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none aria-[invalid=true]:border-destructive";

function TitularPage() {
  const { locale } = useI18n();
  const c = copy[locale as Locale];
  const [bad, setBad] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [relation, setRelation] = useState("user");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(
      ["name", "email", "relation", "kind", "organization", "description", "website"].map((k) => [
        k,
        String(f.get(k) ?? ""),
      ]),
    );
    setBusy(true);
    setError(null);
    setBad([]);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const endpoint = siteConfig.leadEndpoint.replace(/lead-submit$/, "data-request");
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const out = (await res.json().catch(() => ({}))) as {
        protocol?: string;
        error?: string;
        details?: { fields?: string[] };
      };
      if (res.ok && out.protocol) setProtocol(out.protocol);
      else if (out.error === "invalid_fields") {
        setBad(out.details?.fields ?? []);
        setError(c.errors.invalid);
      } else setError(out.error === "rate_limited" ? c.errors.rate : c.errors.generic);
    } catch {
      setError(c.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header />
      <main id="conteudo" className="bg-white">
        <Container className="max-w-2xl py-12 sm:py-16">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand">
            <ShieldCheck className="size-4" aria-hidden />
            LGPD
          </p>
          <h1 className="mt-2 text-3xl font-bold text-balance sm:text-4xl">{c.title}</h1>
          <p className="mt-3 text-muted-foreground">{c.intro}</p>

          {protocol ? (
            <section
              role="status"
              className="mt-8 grid gap-3 rounded-2xl border bg-brand-soft/40 p-6"
            >
              <CheckCircle2 className="size-8 text-success" aria-hidden />
              <h2 className="text-xl font-semibold">{c.done}</h2>
              <p>
                {c.protocol}: <strong className="font-mono text-lg">{protocol}</strong>
              </p>
              <p className="text-muted-foreground">{c.doneText}</p>
              <p className="text-sm text-muted-foreground">{c.deadline}</p>
            </section>
          ) : (
            <form className="mt-8 grid gap-4" onSubmit={(e) => void submit(e)} noValidate>
              <label className="grid gap-1.5 text-sm font-medium">
                {c.name}
                <input
                  name="name"
                  required
                  maxLength={160}
                  autoComplete="name"
                  className={fieldClass}
                  aria-invalid={bad.includes("name")}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                {c.email}
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className={fieldClass}
                  aria-invalid={bad.includes("email")}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                {c.relation}
                <select
                  name="relation"
                  value={relation}
                  onChange={(e) => setRelation(e.target.value)}
                  className={fieldClass}
                >
                  {Object.entries(c.relations).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                {c.kind}
                <select name="kind" className={fieldClass} aria-invalid={bad.includes("kind")}>
                  {Object.entries(c.kinds).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              {relation !== "user" && (
                <label className="grid gap-1.5 text-sm font-medium">
                  {c.organization}
                  <input name="organization" maxLength={160} className={fieldClass} />
                  <span className="font-normal text-muted-foreground">{c.orgHint}</span>
                </label>
              )}
              <label className="grid gap-1.5 text-sm font-medium">
                {c.description}
                <textarea
                  name="description"
                  required
                  rows={5}
                  maxLength={4000}
                  className={fieldClass}
                  aria-invalid={bad.includes("description")}
                />
                <span className="font-normal text-muted-foreground">{c.descriptionHint}</span>
              </label>
              {/* Campo isca: invisível para pessoas. */}
              <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <input name="website" tabIndex={-1} autoComplete="off" />
              </div>
              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg bg-brand px-6 font-semibold text-white hover:bg-brand-strong focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
              >
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {busy ? c.sending : c.submit}
              </button>
              <p className="text-sm text-muted-foreground">
                {c.contact}{" "}
                <span className="font-medium select-all">{siteConfig.contact.email}</span>
              </p>
            </form>
          )}
        </Container>
      </main>
      <Footer />
    </>
  );
}
