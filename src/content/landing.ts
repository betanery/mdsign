/**
 * Textos, planos e dados da landing (PRD MDSign — Fase 1).
 * Não altere textos, preços, limites ou nomenclaturas sem aprovação da MDTech.
 * Itens marcados com "VALIDAR" ainda precisam de confirmação antes da publicação.
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

export const webhookEvents = [
  "Documento assinado",
  "Documento concluído",
  "Documento recusado",
  "Documento expirado",
] as const;

/**
 * Exemplo de requisição exibido na seção de integrações.
 * VALIDAR: endpoint e campos foram tirados do mockup aprovado; confirmar com a
 * documentação real da API SignDoc antes de publicar. Dados fictícios.
 */
export const apiExample = {
  method: "POST",
  url: "https://sign.signdocmd.com.br/api/documents",
  body: `{
  "title": "Proposta Comercial",
  "signers": [
    {
      "name": "Carlos Pereira",
      "email": "carlos@empresa.com.br"
    }
  ]
}`,
};

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
  quote: string;
};

/**
 * Somente depoimentos reais (Magic Colors e Abrace), sem foto da pessoa.
 * VALIDAR: textos tirados do mockup aprovado; confirmar a redação final e se
 * o cargo pode ser exibido (o PRD não informa cargos, por isso não aparecem).
 */
export const testimonials: Testimonial[] = [
  {
    company: "Magic Colors",
    logo: magicColors,
    logoAlt: "Logo Magic Colors",
    author: "Pâmela Lima",
    quote:
      "O MDSign trouxe mais agilidade para nossa rotina de contratos. Eliminamos o papel, ganhamos tempo e muito mais segurança no processo.",
  },
  {
    company: "Abrace",
    logo: abrace,
    logoAlt: "Logo Abrace",
    author: "Juliana",
    quote:
      "A plataforma é simples e intuitiva. Nossos fornecedores assinam de qualquer lugar e o acompanhamento em tempo real facilitou muito a nossa gestão.",
  },
];

export const securityItems = [
  {
    icon: "scale",
    title: "Validade jurídica",
    text: "Assinaturas eletrônicas têm validade jurídica no Brasil, conforme a MP 2.200-2/2001 e a Lei 14.063/2020.",
  },
  {
    icon: "badge",
    title: "Certificado digital ICP-Brasil",
    text: "Para documentos que exigem assinatura qualificada, assine com certificado digital padrão ICP-Brasil.",
  },
  {
    icon: "pen",
    title: "Eletrônica ou com certificado",
    text: "A assinatura eletrônica identifica o signatário pelos dados do processo. A assinatura com certificado digital usa um certificado emitido por autoridade credenciada.",
  },
  {
    icon: "route",
    title: "Rastreabilidade",
    text: "Cada etapa do fluxo fica registrada: envio, visualização, assinatura, recusa e conclusão.",
  },
  {
    icon: "lock",
    title: "Autenticação do signatário",
    text: "Defina, no envio, a forma de autenticação de cada participante.",
  },
  {
    icon: "shield",
    title: "LGPD",
    text: "Tratamento de dados pessoais em atendimento à Lei Geral de Proteção de Dados.",
  },
] as const;

/** VALIDAR: respostas precisam ser revisadas pela MDTech antes da publicação. */
export const faqs = [
  {
    q: "A assinatura eletrônica tem validade jurídica?",
    a: "Sim. A legislação brasileira (MP 2.200-2/2001 e Lei 14.063/2020) reconhece a assinatura eletrônica. Quando o documento exige assinatura qualificada, use o certificado digital ICP-Brasil.",
  },
  {
    q: "O signatário precisa criar uma conta?",
    a: "O signatário recebe o acesso ao documento para revisar e assinar. Ele não precisa contratar um plano do MDSign para participar.",
  },
  {
    q: "Posso assinar com certificado digital?",
    a: "Sim. O MDSign permite assinatura eletrônica e assinatura com certificado digital ICP-Brasil. Confira na seção de planos quais recursos estão incluídos em cada um.",
  },
  {
    q: "Posso ter vários usuários na empresa?",
    a: "Sim. O número de usuários varia por plano: 1 no Cedro e no Jacarandá, 4 no Angico, 6 na Aroeira e 10 no Ipê. O Mogno é dimensionado sob consulta.",
  },
  {
    q: "Consigo acompanhar quem já assinou?",
    a: "Sim. Você acompanha o status de cada signatário e recebe as atualizações do processo em tempo real.",
  },
  {
    q: "Posso integrar o MDSign ao meu sistema?",
    a: "Sim. Pela API REST e por webhooks você envia documentos e recebe eventos como documento assinado, concluído, recusado ou expirado.",
  },
  {
    q: "Como funciona o armazenamento dos documentos?",
    a: "O armazenamento dos documentos segue as regras de cada plano. Fale com um especialista para conhecer as condições do plano que você pretende contratar.",
  },
  {
    q: "Qual é a diferença entre os planos?",
    a: "Os planos variam na quantidade de documentos, no número de usuários, no tipo de assinatura incluído e no nível de suporte. O Mogno atende operações corporativas com integrações avançadas e ambiente dedicado.",
  },
  {
    q: "Como funciona o plano gratuito Cedro?",
    a: "O Cedro é gratuito e inclui 5 documentos no total (não mensais), 1 usuário, assinatura eletrônica e suporte por e-mail. Quando precisar de mais, é só escolher um plano pago.",
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
    // VALIDAR: sem URL definida, aparecem como texto sem link.
    { label: "Quem somos", href: undefined },
    { label: "Blog", href: undefined },
    { label: "Contato", href: "/#contato" },
    { label: "Suporte", href: "/#contato" },
  ],
};
