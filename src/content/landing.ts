/**
 * Dados da landing que não dependem de idioma: imagens, preços, ícones,
 * âncoras e o exemplo da API. Todo texto vem de src/i18n/messages.
 * Não altere preços, limites ou nomenclaturas sem aprovação da MDTech.
 */
import cedro from "@/assets/plans/cedro.webp";
import cedroSmall from "@/assets/plans/cedro-320.webp";
import jacaranda from "@/assets/plans/jacaranda.webp";
import jacarandaSmall from "@/assets/plans/jacaranda-320.webp";
import ipe from "@/assets/plans/ipe.webp";
import ipeSmall from "@/assets/plans/ipe-320.webp";
import mogno from "@/assets/plans/mogno.webp";
import mognoSmall from "@/assets/plans/mogno-320.webp";
import magicColors from "@/assets/clients/magic-colors.webp";
import abrace from "@/assets/clients/abrace.webp";

/** Âncoras do menu, na ordem de messages.nav. */
export const navAnchors = [
  "#produto",
  "#como-funciona",
  "#planos",
  "#integracoes",
  "#seguranca",
  "#faq",
] as const;

/** Ícones na ordem dos textos correspondentes em messages. */
export const trustIcons = ["scale", "file-signature", "devices", "shield", "bell"] as const;
export const stepIcons = ["upload", "settings", "pen", "chart"] as const;
export const capabilityIcons = ["api", "webhook", "automation", "events"] as const;
export const sustainabilityIcons = ["leaf", "gear", "globe"] as const;
export const securityIcons = [
  "scale",
  "badge",
  "pen",
  "lock",
  "route",
  "search",
  "shield",
] as const;

/**
 * Exemplo exibido na seção de integrações, conforme a API real
 * (https://sign.signdocmd.com.br/swagger/index.html — POST /api/documents).
 * O arquivo é enviado antes por POST /api/uploads. Dados fictícios.
 * O código não é traduzido: campos e valores seguem a API.
 */
export const apiExample = {
  method: "POST",
  url: "https://sign.signdocmd.com.br/api/documents",
  headers: "X-Api-Key: your-app|your-key",
  body: `{
  "files": [
    {
      "displayName": "Proposta Comercial",
      "id": "<upload-id>",
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
    "uploadId": "<upload-id>",
    "documentId": "<document-id>"
  }
]`,
};

export const apiDocsReferenceUrl = "https://sign.signdocmd.com.br/swagger/index.html";

export type PlanId = "cedro" | "jacaranda" | "ipe" | "mogno";

export type Plan = {
  id: PlanId;
  /** Nome da espécie: não é traduzido (PRD 27.4). */
  name: string;
  image: string;
  /** Versão de 320 px para telas pequenas (srcset). */
  imageSmall: string;
  /** Preço em reais; sem conversão de moeda nesta fase (PRD 27.4). */
  price?: string;
  /** Destaque visual da oferta principal (sem afirmações como "mais vendido"). */
  featured?: boolean;
  cta: "free" | "subscribe" | "specialist";
};

/** Os 4 planos do lançamento, em ordem. Cada plano usa a foto real da espécie. */
export const plans: Plan[] = [
  { id: "cedro", name: "Cedro", image: cedro, imageSmall: cedroSmall, cta: "free" },
  {
    id: "jacaranda",
    name: "Jacarandá",
    image: jacaranda,
    imageSmall: jacarandaSmall,
    price: "R$ 39,90",
    cta: "subscribe",
  },
  {
    id: "ipe",
    name: "Ipê",
    image: ipe,
    imageSmall: ipeSmall,
    price: "R$ 99,97",
    cta: "subscribe",
    featured: true,
  },
  { id: "mogno", name: "Mogno", image: mogno, imageSmall: mognoSmall, cta: "specialist" },
];

/** Depoimentos reais (mockup aprovado), sem foto. Cargo e fala vêm de messages. */
export const testimonials = [
  { company: "Magic Colors", logo: magicColors, author: "Pâmela Lima" },
  { company: "Abrace", logo: abrace, author: "Juliana Abrace" },
] as const;

/** Links do rodapé, na ordem de messages.footer.product / company. */
export const footerProductLinks = [
  "/#produto",
  "/#seguranca",
  "/#planos",
  "/#integracoes",
  "/desenvolvedores",
] as const;
/** Sem URL definida ("Quem somos", "Blog"), aparecem como texto sem link. */
export const footerCompanyLinks: (string | undefined)[] = [
  undefined,
  undefined,
  "/#contato",
  "/#contato",
];

/**
 * Comparação completa (seção expansível da página de planos). Reflete a matriz de lançamento;
 * "soon" = ainda em homologação, nunca anunciado como disponível.
 */
export type CompareCell = "yes" | "no" | "soon" | "basic" | "advanced" | "contract";
export const planComparison: { row: string; cells: Record<PlanId, CompareCell> }[] = [
  { row: "esign", cells: { cedro: "yes", jacaranda: "yes", ipe: "yes", mogno: "yes" } },
  { row: "history", cells: { cedro: "yes", jacaranda: "yes", ipe: "yes", mogno: "yes" } },
  { row: "order", cells: { cedro: "yes", jacaranda: "yes", ipe: "yes", mogno: "yes" } },
  { row: "approval", cells: { cedro: "yes", jacaranda: "yes", ipe: "yes", mogno: "yes" } },
  { row: "returnFix", cells: { cedro: "yes", jacaranda: "yes", ipe: "yes", mogno: "yes" } },
  { row: "reject", cells: { cedro: "yes", jacaranda: "yes", ipe: "yes", mogno: "yes" } },
  { row: "templates", cells: { cedro: "no", jacaranda: "yes", ipe: "yes", mogno: "yes" } },
  { row: "certificate", cells: { cedro: "no", jacaranda: "soon", ipe: "soon", mogno: "soon" } },
  { row: "multiApproval", cells: { cedro: "no", jacaranda: "yes", ipe: "yes", mogno: "yes" } },
  { row: "team", cells: { cedro: "no", jacaranda: "no", ipe: "yes", mogno: "yes" } },
  { row: "reports", cells: { cedro: "no", jacaranda: "no", ipe: "basic", mogno: "advanced" } },
  { row: "bulk", cells: { cedro: "no", jacaranda: "no", ipe: "no", mogno: "yes" } },
  { row: "api", cells: { cedro: "no", jacaranda: "no", ipe: "no", mogno: "yes" } },
  { row: "support", cells: { cedro: "no", jacaranda: "no", ipe: "no", mogno: "contract" } },
];
