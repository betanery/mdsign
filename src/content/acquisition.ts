// Landing de aquisição do Cedro (/assinar-gratis) e variantes de campanha (/lp/<slug>).
// Todas levam ao mesmo cadastro e guardam a variante na origem da sessão.

import type { Locale } from "@/i18n";

export type AcquisitionVariant = {
  /** Identificador da campanha gravado na origem do cadastro. */
  campaign: string;
  title: string;
  subtitle: string;
  metaTitle: string;
  metaDescription: string;
};

type Copy = {
  /** Nota junto ao botão (Condições do Cedro), com links para os Termos e as Condições. */
  ctaNote: string;
  termsLabel: string;
  cedroLabel: string;
  primary: string;
  secondary: string;
  badges: string[];
  stepsTitle: string;
  steps: { title: string; text: string }[];
  freeTitle: string;
  freeText: string;
  freeItems: string[];
  trustTitle: string;
  trustItems: { title: string; text: string }[];
  faqTitle: string;
  faq: { q: string; a: string }[];
  finalTitle: string;
  finalText: string;
  variants: Record<string, AcquisitionVariant>;
};

/** Variante padrão (/assinar-gratis) + as de campanha. */
export const DEFAULT_VARIANT = "assinar-gratis";
export const CAMPAIGN_SLUGS = [
  "assinar-pdf-gratis",
  "assinar-contrato-online",
  "enviar-documento-para-assinatura",
] as const;

const pt: Copy = {
  ctaNote: "Franquia total de 5 documentos; não renovada mensalmente. Aplicam-se os",
  termsLabel: "Termos de Uso",
  cedroLabel: "Condições do plano Cedro",
  primary: "Começar grátis",
  secondary: "Conhecer o MDSign",
  badges: ["5 documentos grátis", "Sem cartão de crédito", "Validade jurídica"],
  stepsTitle: "Como funciona",
  steps: [
    { title: "Crie sua conta", text: "Nome, e-mail e senha. Leva menos de um minuto." },
    {
      title: "Envie o PDF",
      text: "Assine você mesmo ou indique quem precisa assinar, na ordem que quiser.",
    },
    {
      title: "Pronto",
      text: "Acompanhe cada assinatura e baixe o documento assinado com a trilha de auditoria.",
    },
  ],
  freeTitle: "Grátis de verdade",
  freeText:
    "O plano Cedro dá 5 documentos no total para assinar ou enviar para assinatura. Quando precisar de mais, é só escolher um plano.",
  freeItems: [
    "Assine seus próprios documentos",
    "Envie para outras pessoas assinarem",
    "Lembretes e acompanhamento em tempo real",
    "Documentos guardados com segurança",
  ],
  trustTitle: "Seguro e com validade jurídica",
  trustItems: [
    {
      title: "Lei 14.063/2020",
      text: "Assinatura eletrônica com validade jurídica no Brasil.",
    },
    {
      title: "Trilha de auditoria",
      text: "Quem assinou, quando e de onde, registrado no documento.",
    },
    { title: "LGPD", text: "Seus dados são usados apenas para assinar e guardar seus documentos." },
  ],
  faqTitle: "Perguntas frequentes",
  faq: [
    {
      q: "Preciso de cartão de crédito?",
      a: "Não. O plano Cedro é grátis e não pede nenhum dado de pagamento.",
    },
    {
      q: "Os 5 documentos são por mês?",
      a: "Não, são 5 documentos no total por pessoa, sem renovação mensal. Criar a conta não gasta nenhum.",
    },
    {
      q: "E quando acabarem?",
      a: "Cada documento fica disponível para consulta e download por 6 meses a partir da criação. Para criar novos documentos, escolha um plano a partir de R$ 39,90/mês.",
    },
  ],
  finalTitle: "Comece agora, de graça",
  finalText: "Crie sua conta e assine seu primeiro documento em poucos minutos.",
  variants: {
    "assinar-gratis": {
      campaign: "assinar-gratis",
      title: "Assine documentos online gratuitamente.",
      subtitle:
        "Crie sua conta no MDSign e tenha até 5 documentos grátis para assinar ou enviar para assinatura. Sem cartão de crédito.",
      metaTitle: "Assine documentos online grátis | MDSign",
      metaDescription:
        "Até 5 documentos grátis para assinar ou enviar para assinatura, com validade jurídica. Sem cartão de crédito.",
    },
    "assinar-pdf-gratis": {
      campaign: "assinar-pdf-gratis",
      title: "Assine PDF online grátis.",
      subtitle:
        "Envie seu PDF, assine em poucos cliques e baixe o documento assinado. Até 5 documentos grátis, sem cartão de crédito.",
      metaTitle: "Assinar PDF grátis online | MDSign",
      metaDescription:
        "Assine PDF online grátis com validade jurídica. Até 5 documentos, sem cartão de crédito.",
    },
    "assinar-contrato-online": {
      campaign: "assinar-contrato-online",
      title: "Assine contratos online, com validade jurídica.",
      subtitle:
        "Envie o contrato, colete as assinaturas e acompanhe tudo em um só lugar. Até 5 documentos grátis, sem cartão de crédito.",
      metaTitle: "Assinar contrato online grátis | MDSign",
      metaDescription:
        "Assine e colete assinaturas de contratos online com validade jurídica. Até 5 documentos grátis.",
    },
    "enviar-documento-para-assinatura": {
      campaign: "enviar-documento-para-assinatura",
      title: "Envie documentos para assinatura, grátis.",
      subtitle:
        "Indique quem precisa assinar, receba lembretes automáticos e baixe o documento assinado. Até 5 documentos grátis, sem cartão de crédito.",
      metaTitle: "Enviar documento para assinatura grátis | MDSign",
      metaDescription:
        "Envie documentos para assinatura eletrônica com lembretes e acompanhamento. Até 5 documentos grátis.",
    },
  },
};

const en: Copy = {
  ctaNote: "5 documents in total; not renewed monthly. Subject to the",
  termsLabel: "Terms of Use",
  cedroLabel: "Cedro plan conditions",
  primary: "Start for free",
  secondary: "Discover MDSign",
  badges: ["5 free documents", "No credit card", "Legally valid"],
  stepsTitle: "How it works",
  steps: [
    {
      title: "Create your account",
      text: "Name, email and password. It takes less than a minute.",
    },
    {
      title: "Upload the PDF",
      text: "Sign it yourself or choose who needs to sign, in the order you want.",
    },
    {
      title: "Done",
      text: "Track every signature and download the signed document with its audit trail.",
    },
  ],
  freeTitle: "Truly free",
  freeText:
    "The Cedro plan gives you 5 documents in total to sign or send for signature. When you need more, just choose a plan.",
  freeItems: [
    "Sign your own documents",
    "Send them for others to sign",
    "Reminders and real-time tracking",
    "Documents stored securely",
  ],
  trustTitle: "Secure and legally valid",
  trustItems: [
    { title: "Law 14.063/2020", text: "Electronic signature legally valid in Brazil." },
    { title: "Audit trail", text: "Who signed, when and from where, recorded in the document." },
    { title: "LGPD", text: "Your data is used only to sign and store your documents." },
  ],
  faqTitle: "Frequently asked questions",
  faq: [
    {
      q: "Do I need a credit card?",
      a: "No. The Cedro plan is free and asks for no payment data.",
    },
    {
      q: "Are the 5 documents per month?",
      a: "No, they are 5 documents in total per person, with no monthly renewal. Creating the account uses none.",
    },
    {
      q: "What happens when they run out?",
      a: "Each document is available to view and download for 6 months from creation. To create new documents, choose a plan from R$ 39.90/month.",
    },
  ],
  finalTitle: "Start now, for free",
  finalText: "Create your account and sign your first document in a few minutes.",
  variants: {
    "assinar-gratis": {
      campaign: "assinar-gratis",
      title: "Sign documents online for free.",
      subtitle:
        "Create your MDSign account and get up to 5 free documents to sign or send for signature. No credit card.",
      metaTitle: "Sign documents online for free | MDSign",
      metaDescription:
        "Up to 5 free documents to sign or send for signature, legally valid. No credit card.",
    },
    "assinar-pdf-gratis": {
      campaign: "assinar-pdf-gratis",
      title: "Sign PDFs online for free.",
      subtitle:
        "Upload your PDF, sign in a few clicks and download the signed document. Up to 5 free documents, no credit card.",
      metaTitle: "Sign PDF online for free | MDSign",
      metaDescription:
        "Sign PDFs online for free, legally valid. Up to 5 documents, no credit card.",
    },
    "assinar-contrato-online": {
      campaign: "assinar-contrato-online",
      title: "Sign contracts online, legally valid.",
      subtitle:
        "Send the contract, collect signatures and track everything in one place. Up to 5 free documents, no credit card.",
      metaTitle: "Sign contracts online for free | MDSign",
      metaDescription:
        "Sign and collect contract signatures online, legally valid. Up to 5 free documents.",
    },
    "enviar-documento-para-assinatura": {
      campaign: "enviar-documento-para-assinatura",
      title: "Send documents for signature, free.",
      subtitle:
        "Choose who needs to sign, get automatic reminders and download the signed document. Up to 5 free documents, no credit card.",
      metaTitle: "Send documents for signature for free | MDSign",
      metaDescription:
        "Send documents for electronic signature with reminders and tracking. Up to 5 free documents.",
    },
  },
};

const es: Copy = {
  ctaNote: "5 documentos en total; no se renueva mensualmente. Se aplican los",
  termsLabel: "Términos de Uso",
  cedroLabel: "Condiciones del plan Cedro",
  primary: "Empezar gratis",
  secondary: "Conocer MDSign",
  badges: ["5 documentos gratis", "Sin tarjeta de crédito", "Validez jurídica"],
  stepsTitle: "Cómo funciona",
  steps: [
    { title: "Cree su cuenta", text: "Nombre, correo y contraseña. Toma menos de un minuto." },
    {
      title: "Suba el PDF",
      text: "Fírmelo usted o indique quién debe firmar, en el orden que quiera.",
    },
    {
      title: "Listo",
      text: "Siga cada firma y descargue el documento firmado con su registro de auditoría.",
    },
  ],
  freeTitle: "Gratis de verdad",
  freeText:
    "El plan Cedro ofrece 5 documentos en total para firmar o enviar a firmar. Cuando necesite más, elija un plan.",
  freeItems: [
    "Firme sus propios documentos",
    "Envíelos para que otras personas firmen",
    "Recordatorios y seguimiento en tiempo real",
    "Documentos guardados con seguridad",
  ],
  trustTitle: "Seguro y con validez jurídica",
  trustItems: [
    { title: "Ley 14.063/2020", text: "Firma electrónica con validez jurídica en Brasil." },
    {
      title: "Registro de auditoría",
      text: "Quién firmó, cuándo y desde dónde, registrado en el documento.",
    },
    { title: "LGPD", text: "Sus datos se usan solo para firmar y guardar sus documentos." },
  ],
  faqTitle: "Preguntas frecuentes",
  faq: [
    {
      q: "¿Necesito tarjeta de crédito?",
      a: "No. El plan Cedro es gratis y no pide datos de pago.",
    },
    {
      q: "¿Los 5 documentos son por mes?",
      a: "No, son 5 documentos en total por persona, sin renovación mensual. Crear la cuenta no consume ninguno.",
    },
    {
      q: "¿Y cuando se acaben?",
      a: "Cada documento está disponible para consulta y descarga por 6 meses desde su creación. Para crear nuevos documentos, elija un plan desde R$ 39,90/mes.",
    },
  ],
  finalTitle: "Empiece ahora, gratis",
  finalText: "Cree su cuenta y firme su primer documento en pocos minutos.",
  variants: {
    "assinar-gratis": {
      campaign: "assinar-gratis",
      title: "Firme documentos en línea gratis.",
      subtitle:
        "Cree su cuenta en MDSign y obtenga hasta 5 documentos gratis para firmar o enviar a firmar. Sin tarjeta de crédito.",
      metaTitle: "Firme documentos en línea gratis | MDSign",
      metaDescription:
        "Hasta 5 documentos gratis para firmar o enviar a firmar, con validez jurídica. Sin tarjeta de crédito.",
    },
    "assinar-pdf-gratis": {
      campaign: "assinar-pdf-gratis",
      title: "Firme PDF en línea gratis.",
      subtitle:
        "Suba su PDF, firme en pocos clics y descargue el documento firmado. Hasta 5 documentos gratis, sin tarjeta.",
      metaTitle: "Firmar PDF gratis en línea | MDSign",
      metaDescription:
        "Firme PDF en línea gratis con validez jurídica. Hasta 5 documentos, sin tarjeta.",
    },
    "assinar-contrato-online": {
      campaign: "assinar-contrato-online",
      title: "Firme contratos en línea, con validez jurídica.",
      subtitle:
        "Envíe el contrato, reúna las firmas y siga todo en un solo lugar. Hasta 5 documentos gratis, sin tarjeta.",
      metaTitle: "Firmar contrato en línea gratis | MDSign",
      metaDescription:
        "Firme y reúna firmas de contratos en línea con validez jurídica. Hasta 5 documentos gratis.",
    },
    "enviar-documento-para-assinatura": {
      campaign: "enviar-documento-para-assinatura",
      title: "Envíe documentos a firmar, gratis.",
      subtitle:
        "Indique quién debe firmar, reciba recordatorios automáticos y descargue el documento firmado. Hasta 5 documentos gratis, sin tarjeta.",
      metaTitle: "Enviar documento a firmar gratis | MDSign",
      metaDescription:
        "Envíe documentos a firma electrónica con recordatorios y seguimiento. Hasta 5 documentos gratis.",
    },
  },
};

export const acquisition: Record<Locale, Copy> = { pt, en, es };

export function acquisitionVariant(locale: Locale, slug: string): AcquisitionVariant | null {
  return acquisition[locale].variants[slug] ?? null;
}
