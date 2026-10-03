/**
 * Textos, planos e dados da landing (PRD MDSign — Fase 1).
 * Não altere textos, preços, limites ou nomenclaturas sem aprovação da MDTech.
 */
import cedro from "@/assets/plans/cedro.webp";
import jacaranda from "@/assets/plans/jacaranda.webp";
import angico from "@/assets/plans/angico.webp";
import aroeira from "@/assets/plans/aroeira.webp";
import ipe from "@/assets/plans/ipe.webp";
import mogno from "@/assets/plans/mogno.webp";
import magicColors from "@/assets/clients/magic-colors.webp";
import abrace from "@/assets/clients/abrace.webp";

export const navItems = [
  { label: "Produto", href: "#produto" },
  { label: "Soluções", href: "#como-funciona" },
  { label: "Planos", href: "#planos" },
  { label: "Integrações", href: "#integracoes" },
  { label: "Segurança", href: "#seguranca" },
  { label: "Ajuda", href: "#faq" },
] as const;

export const trustItems = [
  { icon: "scale", label: "Validade jurídica (ICP-Brasil)" },
  { icon: "file-signature", label: "Assinatura eletrônica e com certificado digital" },
  { icon: "devices", label: "Acesse de qualquer dispositivo" },
  { icon: "shield", label: "Atendimento à LGPD" },
  { icon: "bell", label: "Alertas em tempo real" },
] as const;

export const platformFeatures = [
  "Múltiplos signatários",
  "Fluxos personalizados",
  "Modelos de documentos",
  "Pastas e organização",
  "Relatórios e auditoria",
  "Integração via API",
] as const;

export const steps = [
  {
    icon: "upload",
    title: "Envie",
    text: "Faça upload do documento e informe quem precisa participar.",
  },
  {
    icon: "settings",
    title: "Configure",
    text: "Defina signatários, ordem e forma de autenticação.",
  },
  {
    icon: "pen",
    title: "Assine",
    text: "Cada participante recebe o acesso para revisar e assinar.",
  },
  {
    icon: "chart",
    title: "Acompanhe",
    text: "Veja o andamento e receba as atualizações do processo em tempo real.",
  },
] as const;

export const integrationCapabilities = [
  { icon: "api", label: "API REST" },
  { icon: "webhook", label: "Webhooks" },
  { icon: "automation", label: "Automação de documentos" },
  { icon: "events", label: "Acompanhamento de eventos" },
] as const;

/** Eventos de webhook da API (WebhookTypes na documentação Swagger). */
export const webhookEvents = [
  "Documento criado",
  "Documento assinado",
  "Documento aprovado",
  "Documento recusado",
  "Documento concluído",
  "Documento cancelado",
  "Documento expirado",
] as const;

/**
 * Exemplo exibido na seção de integrações, conforme a API real
 * (https://sign.signdocmd.com.br/swagger/index.html — POST /api/documents).
 * O arquivo é enviado antes por POST /api/uploads. Dados fictícios.
 */
export const apiExample = {
  method: "POST",
  url: "https://sign.signdocmd.com.br/api/documents",
  headers: "X-Api-Key: sua-aplicacao|sua-chave",
  body: `{
  "files": [
    {
      "displayName": "Proposta Comercial",
      "id": "<id retornado por /api/uploads>",
      "name": "proposta-comercial.pdf",
      "contentType": "application/pdf"
    }
  ],
  "flowActions": [
    {
      "type": "Signer",
      "step": 1,
      "user": {
        "name": "Carlos Pereira",
        "email": "carlos@empresa.com.br"
      }
    }
  ]
}`,
  response: `[
  {
    "uploadId": "<id do arquivo enviado>",
    "documentId": "<id do novo documento>"
  }
]`,
};

export const apiDocsReferenceUrl = "https://sign.signdocmd.com.br/swagger/index.html";

export type PlanId = "cedro" | "jacaranda" | "angico" | "aroeira" | "ipe" | "mogno";

export type Plan = {
  id: PlanId;
  name: string;
  image: string;
  imageAlt: string;
  price?: string;
  priceLabel: string;
  priceNote?: string;
  features: string[];
  cta: "free" | "subscribe" | "specialist";
};

/** Ordem fixa definida no PRD. Cada plano usa a foto real da espécie. */
export const plans: Plan[] = [
  {
    id: "cedro",
    name: "Cedro",
    image: cedro,
    imageAlt: "Foto da árvore Cedro",
    priceLabel: "Gratuito",
    features: [
      "5 documentos no total (não mensais)",
      "1 usuário",
      "Assinatura eletrônica",
      "Suporte por e-mail",
    ],
    cta: "free",
  },
  {
    id: "jacaranda",
    name: "Jacarandá",
    image: jacaranda,
    imageAlt: "Foto da árvore Jacarandá",
    price: "R$ 39,90",
    priceLabel: "/mês",
    features: [
      "20 documentos/mês",
      "1 usuário",
      "Assinatura eletrônica com certificado digital",
      "Suporte por e-mail",
    ],
    cta: "subscribe",
  },
  {
    id: "angico",
    name: "Angico",
    image: angico,
    imageAlt: "Foto da árvore Angico",
    price: "R$ 99,97",
    priceLabel: "/mês",
    features: [
      "Documentos ilimitados",
      "4 usuários",
      "Assinatura eletrônica",
      "Suporte prioritário",
    ],
    cta: "subscribe",
  },
  {
    id: "aroeira",
    name: "Aroeira",
    image: aroeira,
    imageAlt: "Foto da árvore Aroeira",
    price: "R$ 149,97",
    priceLabel: "/mês",
    features: [
      "Documentos ilimitados",
      "6 usuários",
      "Assinatura eletrônica",
      "Suporte prioritário",
    ],
    cta: "subscribe",
  },
  {
    id: "ipe",
    name: "Ipê",
    image: ipe,
    imageAlt: "Foto da árvore Ipê",
    price: "R$ 199,97",
    priceLabel: "/mês",
    features: [
      "Documentos ilimitados",
      "10 usuários",
      "Assinatura eletrônica",
      "Suporte prioritário",
    ],
    cta: "subscribe",
  },
  {
    id: "mogno",
    name: "Mogno",
    image: mogno,
    imageAlt: "Foto da árvore Mogno",
    priceLabel: "Corporativo",
    priceNote: "Sob consulta",
    features: [
      "Grandes operações",
      "Integrações avançadas",
      "Ambiente dedicado",
      "Suporte personalizado",
    ],
    cta: "specialist",
  },
];

export const storageNote = "O armazenamento dos documentos segue as regras de cada plano.";

export const sustainabilityItems = [
  { icon: "leaf", title: "Menos papel", text: "Mais árvores" },
  { icon: "gear", title: "Processos digitais", text: "Mais eficiência" },
  { icon: "globe", title: "Um futuro", text: "mais sustentável" },
] as const;

export type Testimonial = {
  company: string;
  logo: string;
  logoAlt: string;
  author: string;
  role: string;
  quote: string;
};

/** Depoimentos reais (texto do mockup aprovado), sem foto da pessoa. */
export const testimonials: Testimonial[] = [
  {
    company: "Magic Colors",
    logo: magicColors,
    logoAlt: "Logo Magic Colors",
    author: "Pâmela Lima",
    role: "Diretora Administrativa",
    quote:
      "O MDSign trouxe mais agilidade para nossa rotina de contratos. Eliminamos o papel, ganhamos tempo e muito mais segurança no processo.",
  },
  {
    company: "Abrace",
    logo: abrace,
    logoAlt: "Logo Abrace",
    author: "Juliana Abrace",
    role: "Diretora Executiva",
    quote:
      "A plataforma é simples e intuitiva. Nossos fornecedores assinam de qualquer lugar e o acompanhamento em tempo real facilitou muito a nossa gestão.",
  },
];

export const securityItems = [
  {
    icon: "scale",
    title: "Validade jurídica",
    text: "A assinatura eletrônica tem validade jurídica no Brasil, conforme a MP 2.200-2/2001 e a Lei 14.063/2020, nos níveis simples, avançado e qualificado.",
  },
  {
    icon: "badge",
    title: "Certificado digital ICP-Brasil",
    text: "Quando o documento exige assinatura qualificada, o signatário assina com certificado digital ICP-Brasil, inclusive e-CNPJ para assinar pela empresa.",
  },
  {
    icon: "pen",
    title: "Eletrônica ou com certificado",
    text: "Na assinatura eletrônica, o signatário é identificado pelos fatores de autenticação do processo. Na assinatura com certificado digital, pelo certificado emitido por autoridade credenciada.",
  },
  {
    icon: "lock",
    title: "Autenticação do signatário",
    text: "No envio, defina como cada participante confirma a identidade: e-mail, SMS, WhatsApp, aplicativo autenticador ou selfie, entre outros fatores disponíveis.",
  },
  {
    icon: "route",
    title: "Rastreabilidade",
    text: "Cada etapa fica registrada: criação, assinatura, aprovação, recusa, cancelamento e conclusão, com os detalhes de cada assinatura.",
  },
  {
    icon: "search",
    title: "Validação do documento",
    text: "Qualquer pessoa confere as assinaturas de um documento pelo código de verificação ou enviando o arquivo assinado.",
  },
  {
    icon: "shield",
    title: "LGPD",
    text: "Tratamento de dados pessoais em atendimento à Lei Geral de Proteção de Dados.",
  },
] as const;

export const faqs = [
  {
    q: "A assinatura eletrônica tem validade jurídica?",
    a: "Sim. A MP 2.200-2/2001 e a Lei 14.063/2020 reconhecem a assinatura eletrônica como válida para comprovar a autoria e a integridade de documentos. Para os casos em que a lei exige assinatura qualificada, use o certificado digital ICP-Brasil.",
  },
  {
    q: "O signatário precisa criar uma conta?",
    a: "Não. Cada participante recebe por e-mail o link para revisar e assinar o documento, sem precisar contratar um plano ou instalar nada. Lembretes podem ser enviados para quem ainda não assinou.",
  },
  {
    q: "Posso assinar com certificado digital?",
    a: "Sim. Além da assinatura eletrônica, o MDSign aceita assinatura com certificado digital ICP-Brasil, de pessoa física (e-CPF) ou jurídica (e-CNPJ). Confira na seção de planos o tipo de assinatura incluído em cada um.",
  },
  {
    q: "Posso ter vários usuários na empresa?",
    a: "Sim. O número de usuários varia por plano: 1 no Cedro e no Jacarandá, 4 no Angico, 6 na Aroeira e 10 no Ipê. No Mogno, a quantidade é definida conforme a sua operação.",
  },
  {
    q: "Consigo acompanhar quem já assinou?",
    a: "Sim. Você vê o status de cada participante, sabe quem já assinou e quem ainda está pendente, e recebe as atualizações do processo em tempo real.",
  },
  {
    q: "Posso definir a ordem das assinaturas?",
    a: "Sim. Você define a ordem dos signatários e aprovadores. Cada participante recebe o documento na sua vez, e o fluxo segue automaticamente até a conclusão.",
  },
  {
    q: "Posso integrar o MDSign ao meu sistema?",
    a: "Sim. Pela API REST você envia documentos, define o fluxo de assinatura e baixa os arquivos assinados. Com os webhooks, seu sistema é avisado quando um documento é assinado, recusado, concluído ou expira.",
  },
  {
    q: "Como funciona o armazenamento dos documentos?",
    a: "Os documentos ficam guardados no MDSign e podem ser organizados em pastas. O armazenamento segue as regras de cada plano. Fale com um especialista para conhecer as condições do plano que você pretende contratar.",
  },
  {
    q: "Qual é a diferença entre os planos?",
    a: "Os planos variam na quantidade de documentos, no número de usuários, no tipo de assinatura e no nível de suporte. Do Angico em diante os documentos são ilimitados. O Mogno atende grandes operações, com integrações avançadas e ambiente dedicado.",
  },
  {
    q: "Como funciona o plano gratuito Cedro?",
    a: "O Cedro é gratuito e inclui 5 documentos no total (não são renovados a cada mês), 1 usuário, assinatura eletrônica e suporte por e-mail. Quando precisar de mais, é só escolher um plano pago.",
  },
] as const;

export const footerLinks: Record<string, { label: string; href?: string | undefined }[]> = {
  Produto: [
    { label: "Funcionalidades", href: "/#produto" },
    { label: "Segurança", href: "/#seguranca" },
    { label: "Planos", href: "/#planos" },
    { label: "Integrações", href: "/#integracoes" },
    { label: "API", href: "/desenvolvedores" },
  ],
  Empresa: [
    // Sem URL definida, aparecem como texto sem link.
    { label: "Quem somos", href: undefined },
    { label: "Blog", href: undefined },
    { label: "Contato", href: "/#contato" },
    { label: "Suporte", href: "/#contato" },
  ],
};
