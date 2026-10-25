// Navegação progressiva: o que cada plano mostra (disponível, prévia de upgrade ou oculto).
// A decisão vem do banco (org_features → feature_mode); a tela só apresenta. O backend recusa
// o recurso fora do plano mesmo que alguém force a rota.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/lib/supabase";
import { useAppI18n } from "./i18n";
import { useOrg } from "./org";

export type FeatureMode = "available" | "preview" | "hidden";
export type FeatureCode =
  | "dashboard"
  | "documents"
  | "e_signature"
  | "contacts"
  | "certificate_signature"
  | "templates"
  | "team"
  | "forms"
  | "bulk_send"
  | "reports"
  | "advanced_management"
  | "api_webhooks"
  | "whatsapp"
  | "approval_multi"
  | "reports_advanced";

export type OfferPlan = {
  id: string;
  name: string;
  price_cents: number | null;
  period: "one_time" | "month" | "contract";
  description: string | null;
  benefits: string[];
  highlight: boolean;
  cta: string | null;
  sort: number;
  entitlements: Record<string, number | boolean>;
};
export type FeatureOffer = {
  version: string;
  features: { code: FeatureCode; core: boolean; modes: Record<string, string> }[];
  plans: OfferPlan[];
};

const USAGE_EVENT = "mdsign:usage-changed";

/** Modos das funcionalidades na organização atual (cache por organização). */
const modeCache = new Map<string, Promise<Record<string, FeatureMode>>>();
export function useFeatures() {
  const { current } = useOrg();
  const orgId = current?.id;
  const [modes, setModes] = useState<Record<string, FeatureMode> | null>(null);
  useEffect(() => {
    if (!orgId) return;
    let alive = true;
    const load = (fresh = false) => {
      if (fresh || !modeCache.has(orgId))
        modeCache.set(
          orgId,
          Promise.resolve(supabase.rpc("org_features", { org: orgId })).then(
            ({ data }) => (data as Record<string, FeatureMode> | null) ?? {},
          ),
        );
      void modeCache.get(orgId)!.then((m) => alive && setModes(m));
    };
    load();
    const onChange = () => load(true);
    window.addEventListener(USAGE_EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(USAGE_EVENT, onChange);
    };
  }, [orgId]);
  // Enquanto carrega, o essencial aparece e o resto espera (nada é liberado por padrão).
  const mode = useCallback(
    (code: FeatureCode): FeatureMode | "loading" => (modes ? (modes[code] ?? "hidden") : "loading"),
    [modes],
  );
  return { modes, mode };
}

/** Matriz publicada (comparação comercial), sem dados de organização. */
let offerCache: Promise<FeatureOffer | null> | null = null;
export function useFeatureOffer() {
  const [offer, setOffer] = useState<FeatureOffer | null>(null);
  useEffect(() => {
    offerCache ??= Promise.resolve(supabase.rpc("plan_features_offer")).then(
      ({ data }) => (data as FeatureOffer | null) ?? null,
    );
    let alive = true;
    void offerCache.then((o) => alive && setOffer(o));
    return () => {
      alive = false;
    };
  }, []);
  return offer;
}

/** Plano mais barato da matriz publicada em que o recurso está disponível. */
export function requiredPlan(offer: FeatureOffer | null, code: FeatureCode) {
  if (!offer) return null;
  const f = offer.features.find((x) => x.code === code);
  if (!f) return null;
  return (
    [...offer.plans].sort((a, b) => a.sort - b.sort).find((p) => f.modes[p.id] === "available") ??
    null
  );
}

/** Evento do funil (sem dado pessoal; o servidor evita duplicar visualizações no dia). */
export function trackPlanEvent(
  orgId: string | undefined,
  ev: "feature_preview_viewed" | "locked_feature_clicked" | "upgrade_cta_clicked",
  payload: Record<string, string | null | undefined>,
) {
  if (!orgId) return;
  const clean = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v != null && v !== ""),
  );
  void supabase.rpc("growth_app_event", { org: orgId, ev, payload: clean });
}

// Prévia de upgrade aberta de qualquer lugar (menu, página bloqueada, atalhos).
type PreviewState = { code: FeatureCode; where: string } | null;
const PreviewContext = createContext<{
  open: (code: FeatureCode, where: string) => void;
  state: PreviewState;
  close: () => void;
} | null>(null);

export function FeaturePreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PreviewState>(null);
  const value = useMemo(
    () => ({
      state,
      open: (code: FeatureCode, where: string) => setState({ code, where }),
      close: () => setState(null),
    }),
    [state],
  );
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function useFeaturePreview() {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error("useFeaturePreview precisa estar dentro de <FeaturePreviewProvider>");
  return ctx;
}

/** Textos da apresentação de cada recurso (nome, para que serve, benefício e exemplos). */
const T = {
  pt: {
    features: {
      dashboard: {
        name: "Painel inicial",
        text: "Pendências, atalhos e consumo do plano.",
        benefit: "Saber o que precisa de atenção hoje.",
        examples: [],
      },
      documents: {
        name: "Documentos",
        text: "Lista, busca, situação e download.",
        benefit: "Acompanhar cada assinatura até o fim.",
        examples: [],
      },
      e_signature: {
        name: "Assinatura eletrônica",
        text: "Só eu assino e envio para assinatura.",
        benefit: "Assinar e coletar assinaturas com validade jurídica.",
        examples: [],
      },
      contacts: {
        name: "Contatos",
        text: "Agenda de pessoas com quem você assina.",
        benefit: "Preencher participantes em segundos.",
        examples: [],
      },
      certificate_signature: {
        name: "Assinatura com certificado digital",
        text: "Assinatura com certificado ICP-Brasil (A1/A3).",
        benefit: "Máxima força jurídica, validada pelo ITI.",
        examples: ["Contratos de alto valor", "Documentos para órgãos públicos"],
      },
      templates: {
        name: "Modelos de documentos",
        text: "Modelos com campos e posições de assinatura, incluindo a biblioteca MDSign.",
        benefit: "Gerar documentos repetitivos em minutos, sem refazer o PDF.",
        examples: ["Contrato de prestação de serviços", "Termo de confidencialidade (NDA)"],
      },
      team: {
        name: "Equipes e colaboração",
        text: "Convide pessoas para a organização com papéis e permissões.",
        benefit: "Dividir a operação de assinaturas com a equipe.",
        examples: ["Comercial envia propostas", "Financeiro acompanha cobranças"],
      },
      forms: {
        name: "Formulários e links públicos",
        text: "Links em que a pessoa preenche os dados e assina sem criar conta.",
        benefit: "Receber documentos assinados sem trabalho manual.",
        examples: ["Ficha de matrícula", "Termo de adesão no site"],
      },
      bulk_send: {
        name: "Envio em massa",
        text: "Um documento para cada linha da planilha ou parte de um PDF, com processos salvos.",
        benefit: "Enviar centenas de documentos de uma vez.",
        examples: ["Contracheques do mês", "Termos para todos os colaboradores"],
      },
      reports: {
        name: "Relatórios gerenciais",
        text: "Painel com indicadores, filtros por período, situação e pessoa da equipe, e exportação em CSV.",
        benefit: "Medir a operação e prestar contas.",
        examples: ["Tempo médio até a assinatura", "Documentos por unidade"],
      },
      advanced_management: {
        name: "Gestão avançada",
        text: "Unidades e departamentos, grupos (inclusive com quórum) e delegações de aprovação.",
        benefit: "Organizar a empresa e garantir continuidade nas aprovações.",
        examples: ["Jurídico aprova com 2 de 3 pessoas", "Aprovação delegada nas férias"],
      },
      api_webhooks: {
        name: "API e Webhooks",
        text: "API REST e avisos assinados para o sistema da sua empresa.",
        benefit: "Integrar o MDSign ao ERP, RH ou CRM.",
        examples: ["Contrato gerado pelo CRM", "Status atualizado no ERP"],
      },
      whatsapp: {
        name: "Notificações por WhatsApp",
        text: "Convites e lembretes por WhatsApp com link seguro.",
        benefit: "Mais assinaturas no mesmo dia.",
        examples: [],
      },
      approval_multi: {
        name: "Aprovação em várias etapas",
        text: "Mais de um aprovador no mesmo documento, em ordem, antes das assinaturas.",
        benefit: "Validar o documento em vários níveis antes de assinar.",
        examples: ["Jurídico e depois diretoria", "Gestor e depois financeiro"],
      },
      reports_advanced: {
        name: "Relatórios avançados",
        text: "Filtros por origem, modelo, departamento, grupo e pasta, com exportação em Excel e PDF.",
        benefit: "Análises detalhadas e relatórios consolidados.",
        examples: ["Documentos por departamento", "Relatório mensal em Excel"],
      },
    } as Record<FeatureCode, { name: string; text: string; benefit: string; examples: string[] }>,
    available: "Disponível",
    preview: "Disponível no plano {plan}",
    locked: "Recurso de upgrade",
    examples: "Exemplos de uso",
    required: "Plano necessário",
    current: "Seu plano",
    compare: "Comparação",
    documents: "Documentos",
    users: "Usuários",
    price: "Mensalidade",
    seePlans: "Conhecer os planos",
    subscribe: "Contratar {plan}",
    talk: "Falar com especialista",
    close: "Fechar",
    notInPlan: "Este recurso não faz parte do seu plano atual.",
    unlimited: "Ilimitados",
    total: "{n} no total",
    month: "{n} por mês",
    contract: "Conforme contrato",
    free: "Grátis",
    perMonth: "{price}/mês",
  },
  en: {
    features: {
      dashboard: {
        name: "Home dashboard",
        text: "Pending items, shortcuts and plan usage.",
        benefit: "Know what needs attention today.",
        examples: [],
      },
      documents: {
        name: "Documents",
        text: "List, search, status and download.",
        benefit: "Follow each signature to the end.",
        examples: [],
      },
      e_signature: {
        name: "Electronic signature",
        text: "Sign yourself and send for signature.",
        benefit: "Sign and collect legally valid signatures.",
        examples: [],
      },
      contacts: {
        name: "Contacts",
        text: "Address book of people you sign with.",
        benefit: "Fill in participants in seconds.",
        examples: [],
      },
      certificate_signature: {
        name: "Digital certificate signature",
        text: "Signature with an ICP-Brasil certificate (A1/A3).",
        benefit: "Maximum legal strength, validated by ITI.",
        examples: ["High-value contracts", "Documents for public bodies"],
      },
      templates: {
        name: "Document templates",
        text: "Templates with fields and signature positions, including the MDSign library.",
        benefit: "Generate repetitive documents in minutes, without redoing the PDF.",
        examples: ["Service agreement", "Non-disclosure agreement (NDA)"],
      },
      team: {
        name: "Teams and collaboration",
        text: "Invite people to the organization with roles and permissions.",
        benefit: "Share the signing work with your team.",
        examples: ["Sales sends proposals", "Finance follows up"],
      },
      forms: {
        name: "Forms and public links",
        text: "Links where people fill in their data and sign without an account.",
        benefit: "Get signed documents without manual work.",
        examples: ["Enrollment form", "Sign-up agreement on your website"],
      },
      bulk_send: {
        name: "Bulk sending",
        text: "One document per spreadsheet row or PDF part, with saved processes.",
        benefit: "Send hundreds of documents at once.",
        examples: ["Monthly payslips", "Agreements for all employees"],
      },
      reports: {
        name: "Management reports",
        text: "Dashboard with metrics, filters by period, status and team member, and CSV export.",
        benefit: "Measure the operation and report on it.",
        examples: ["Average time to sign", "Documents per unit"],
      },
      advanced_management: {
        name: "Advanced management",
        text: "Units and departments, groups (including quorum) and approval delegations.",
        benefit: "Organize the company and keep approvals flowing.",
        examples: ["Legal approves with 2 of 3 people", "Approval delegated during vacation"],
      },
      api_webhooks: {
        name: "API and Webhooks",
        text: "REST API and signed notifications to your company's system.",
        benefit: "Integrate MDSign with your ERP, HR or CRM.",
        examples: ["Contract generated by the CRM", "Status updated in the ERP"],
      },
      whatsapp: {
        name: "WhatsApp notifications",
        text: "Invitations and reminders on WhatsApp with a secure link.",
        benefit: "More signatures on the same day.",
        examples: [],
      },
      approval_multi: {
        name: "Multi-step approval",
        text: "More than one approver on the same document, in order, before the signatures.",
        benefit: "Validate the document at several levels before signing.",
        examples: ["Legal, then the board", "Manager, then finance"],
      },
      reports_advanced: {
        name: "Advanced reports",
        text: "Filters by origin, template, department, group and folder, with Excel and PDF export.",
        benefit: "Detailed analysis and consolidated reports.",
        examples: ["Documents by department", "Monthly report in Excel"],
      },
    },
    available: "Available",
    preview: "Available on the {plan} plan",
    locked: "Upgrade feature",
    examples: "Examples",
    required: "Required plan",
    current: "Your plan",
    compare: "Comparison",
    documents: "Documents",
    users: "Users",
    price: "Monthly price",
    seePlans: "See plans",
    subscribe: "Subscribe to {plan}",
    talk: "Talk to a specialist",
    close: "Close",
    notInPlan: "This feature isn't part of your current plan.",
    unlimited: "Unlimited",
    total: "{n} in total",
    month: "{n} per month",
    contract: "Per contract",
    free: "Free",
    perMonth: "{price}/month",
  },
  es: {
    features: {
      dashboard: {
        name: "Panel inicial",
        text: "Pendientes, accesos y consumo del plan.",
        benefit: "Saber qué necesita atención hoy.",
        examples: [],
      },
      documents: {
        name: "Documentos",
        text: "Lista, búsqueda, estado y descarga.",
        benefit: "Seguir cada firma hasta el final.",
        examples: [],
      },
      e_signature: {
        name: "Firma electrónica",
        text: "Firmar tú mismo y enviar para firma.",
        benefit: "Firmar y recoger firmas con validez jurídica.",
        examples: [],
      },
      contacts: {
        name: "Contactos",
        text: "Agenda de personas con quienes firmas.",
        benefit: "Completar participantes en segundos.",
        examples: [],
      },
      certificate_signature: {
        name: "Firma con certificado digital",
        text: "Firma con certificado ICP-Brasil (A1/A3).",
        benefit: "Máxima fuerza jurídica, validada por el ITI.",
        examples: ["Contratos de alto valor", "Documentos para organismos públicos"],
      },
      templates: {
        name: "Plantillas de documentos",
        text: "Plantillas con campos y posiciones de firma, incluida la biblioteca MDSign.",
        benefit: "Generar documentos repetitivos en minutos, sin rehacer el PDF.",
        examples: ["Contrato de servicios", "Acuerdo de confidencialidad (NDA)"],
      },
      team: {
        name: "Equipos y colaboración",
        text: "Invita personas a la organización con roles y permisos.",
        benefit: "Repartir la operación de firmas con el equipo.",
        examples: ["Comercial envía propuestas", "Finanzas hace el seguimiento"],
      },
      forms: {
        name: "Formularios y enlaces públicos",
        text: "Enlaces donde la persona completa sus datos y firma sin crear cuenta.",
        benefit: "Recibir documentos firmados sin trabajo manual.",
        examples: ["Ficha de inscripción", "Término de adhesión en el sitio"],
      },
      bulk_send: {
        name: "Envío masivo",
        text: "Un documento por fila de la planilla o parte de un PDF, con procesos guardados.",
        benefit: "Enviar cientos de documentos de una vez.",
        examples: ["Recibos de sueldo del mes", "Términos para todos los colaboradores"],
      },
      reports: {
        name: "Informes de gestión",
        text: "Panel con indicadores, filtros por período, estado y persona del equipo, y exportación en CSV.",
        benefit: "Medir la operación y rendir cuentas.",
        examples: ["Tiempo medio hasta la firma", "Documentos por unidad"],
      },
      advanced_management: {
        name: "Gestión avanzada",
        text: "Unidades y departamentos, grupos (incluso con quórum) y delegaciones de aprobación.",
        benefit: "Organizar la empresa y asegurar la continuidad de las aprobaciones.",
        examples: ["Jurídico aprueba con 2 de 3 personas", "Aprobación delegada en vacaciones"],
      },
      api_webhooks: {
        name: "API y Webhooks",
        text: "API REST y avisos firmados para el sistema de tu empresa.",
        benefit: "Integrar MDSign con el ERP, RR. HH. o CRM.",
        examples: ["Contrato generado por el CRM", "Estado actualizado en el ERP"],
      },
      whatsapp: {
        name: "Notificaciones por WhatsApp",
        text: "Invitaciones y recordatorios por WhatsApp con enlace seguro.",
        benefit: "Más firmas el mismo día.",
        examples: [],
      },
      approval_multi: {
        name: "Aprobación en varias etapas",
        text: "Más de un aprobador en el mismo documento, en orden, antes de las firmas.",
        benefit: "Validar el documento en varios niveles antes de firmar.",
        examples: ["Jurídico y luego dirección", "Gerente y luego finanzas"],
      },
      reports_advanced: {
        name: "Informes avanzados",
        text: "Filtros por origen, plantilla, departamento, grupo y carpeta, con exportación en Excel y PDF.",
        benefit: "Análisis detallados e informes consolidados.",
        examples: ["Documentos por departamento", "Informe mensual en Excel"],
      },
    },
    available: "Disponible",
    preview: "Disponible en el plan {plan}",
    locked: "Función de upgrade",
    examples: "Ejemplos de uso",
    required: "Plan necesario",
    current: "Tu plan",
    compare: "Comparación",
    documents: "Documentos",
    users: "Usuarios",
    price: "Mensualidad",
    seePlans: "Conocer los planes",
    subscribe: "Contratar {plan}",
    talk: "Hablar con un especialista",
    close: "Cerrar",
    notInPlan: "Esta función no forma parte de tu plan actual.",
    unlimited: "Ilimitados",
    total: "{n} en total",
    month: "{n} por mes",
    contract: "Según contrato",
    free: "Gratis",
    perMonth: "{price}/mes",
  },
};
export const featureTexts = T;

export function useFeatureTexts() {
  const { locale } = useAppI18n();
  return T[locale as keyof typeof T] ?? T.pt;
}

export const fillText = (s: string, v: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

export function useMoney() {
  const { locale } = useAppI18n();
  return (cents: number) =>
    (cents / 100).toLocaleString(locale === "pt" ? "pt-BR" : locale, {
      style: "currency",
      currency: "BRL",
    });
}

/** Franquia em texto ("5 no total", "50 por mês", "Ilimitados", "Conforme contrato"). */
export function useDocsLabel() {
  const x = useFeatureTexts();
  return (p: OfferPlan) =>
    p.period === "contract"
      ? x.contract
      : typeof p.entitlements["documents_total"] === "number"
        ? fillText(x.total, { n: p.entitlements["documents_total"] as number })
        : typeof p.entitlements["documents_month"] === "number"
          ? fillText(x.month, { n: p.entitlements["documents_month"] as number })
          : x.unlimited;
}
