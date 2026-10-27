/**
 * Dicionário-fonte (pt-BR). Textos do PRD MDSign — Fase 1.
 * Não altere textos, preços, limites ou nomenclaturas sem aprovação da MDTech.
 * en.ts e es.ts seguem exatamente esta estrutura (tipo Messages).
 */
const pt = {
  meta: {
    title: "MDSign — Assinatura digital para empresas",
    description:
      "Envie, assine, gerencie e armazene seus documentos de forma simples, segura e 100% digital. Assinatura eletrônica com evidências e validade jurídica.",
    slogan: "Não use papel, plante uma árvore!",
  },
  a11y: {
    skipToContent: "Pular para o conteúdo",
    home: "MDSign — página inicial",
    mainNav: "Principal",
    mobileNav: "Principal (celular)",
    openMenu: "Abrir menu",
    closeMenu: "Fechar menu",
    language: "Idioma",
    mockup: "Tela de documentos do MDSign no notebook e no celular, com documentos de exemplo",
  },
  nav: ["Produto", "Soluções", "Planos", "Integrações", "Segurança", "Ajuda"],
  cta: {
    free: "Comece grátis",
    plans: "Conheça os planos",
    platform: "Conheça a plataforma",
    subscribe: "Assinar plano",
    specialist: "Fale com um especialista",
    api: "Documentação da API",
    login: "Entrar",
  },
  hero: {
    eyebrow: "Assinatura digital para empresas",
    titleLine1: "Documentos assinados hoje.",
    titleLine2: "Um amanhã mais sustentável.",
    text: "Envie, assine, gerencie e armazene seus documentos de forma simples, segura e 100% digital. Menos papel, mais produtividade e um futuro com mais árvores.",
  },
  trust: {
    label: "Diferenciais",
    items: [
      "Validade jurídica (MP 2.200-2 e Lei 14.063)",
      "Assinatura eletrônica com trilha de evidências",
      "Acesse de qualquer dispositivo",
      "Atendimento à LGPD",
      "Alertas em tempo real",
    ],
  },
  platform: {
    eyebrow: "Mais agilidade para o seu dia a dia",
    title: "Assine, gerencie e acompanhe todos os seus documentos em um só lugar.",
    text: "Crie fluxos de assinatura, defina responsáveis, acompanhe o status de cada documento e integre com os seus sistemas através da nossa API.",
    features: [
      "Múltiplos signatários",
      "Fluxos personalizados",
      "Modelos de documentos",
      "Pastas e organização",
      "Relatórios e auditoria",
      "Integração via API",
    ],
    demo: {
      request: "Solicitação de assinatura",
      to: "Para",
      message: "Mensagem",
      messageText: "Segue o documento para sua assinatura. Obrigada!",
      send: "Enviar documento",
      signers: "Signatários do documento",
      signed: "Assinado",
      waiting: "Aguardando",
    },
  },
  how: {
    eyebrow: "Como funciona",
    title: "Assinar não deveria dar trabalho.",
    subtitle: "Em poucos passos, seus documentos assinados e sob controle.",
    steps: [
      { title: "Envie", text: "Faça upload do documento e informe quem precisa participar." },
      { title: "Configure", text: "Defina signatários, ordem e forma de autenticação." },
      { title: "Assine", text: "Cada participante recebe o acesso para revisar e assinar." },
      {
        title: "Acompanhe",
        text: "Veja o andamento e receba as atualizações do processo em tempo real.",
      },
    ],
  },
  integrations: {
    eyebrow: "Integrações",
    titleRest: "dentro do seu sistema.",
    text: "Use o MDSign como plataforma ou integre a assinatura eletrônica aos seus próprios processos através da nossa API REST.",
    capabilities: ["API REST", "Webhooks", "Automação de documentos", "Acompanhamento de eventos"],
    exampleLabel: "Exemplo da API",
    request: "Requisição",
    response: "Resposta",
    webhooksTitle: "Webhooks para acompanhamento de eventos",
    events: [
      "Documento criado",
      "Documento assinado",
      "Documento aprovado",
      "Documento recusado",
      "Documento concluído",
      "Documento cancelado",
      "Documento expirado",
    ],
  },
  plans: {
    eyebrow: "Planos",
    title: "Escolha a árvore que acompanha o crescimento da sua empresa.",
    subtitle: "Comece grátis e mude de plano quando precisar.",
    listLabel: "Planos MDSign",
    swipeHint: "Deslize para ver todos os planos →",
    perMonth: "/mês",
    storageNote: "O armazenamento dos documentos segue as regras de cada plano.",
    photoOf: "Foto da árvore",
    items: {
      cedro: {
        audience: "Experimente gratuitamente",
        priceLabel: "Gratuito",
        priceNote: "",
        features: [
          "5 documentos grátis (uma única vez)",
          "1 usuário",
          "Assine e envie para assinatura",
          "Aprovação e assinatura em ordem",
        ],
      },
      jacaranda: {
        audience: "Para profissionais",
        priceLabel: "",
        priceNote: "",
        features: [
          "50 documentos por mês",
          "1 usuário",
          "Modelos reutilizáveis",
          "Aprovações em várias etapas",
        ],
      },
      ipe: {
        audience: "Para empresas e equipes",
        priceLabel: "",
        priceNote: "",
        features: [
          "Documentos ilimitados",
          "Até 4 usuários",
          "Trabalhe em equipe com permissões",
          "Relatórios gerenciais",
        ],
      },
      mogno: {
        audience: "Para operações corporativas",
        priceLabel: "Corporativo",
        priceNote: "Sob consulta",
        features: [
          "Usuários e documentos sob contrato",
          "Integre seus sistemas (API e Webhooks)",
          "Envio em massa e relatórios avançados",
          "Suporte personalizado",
        ],
      },
    },
    featured: "Para empresas",
    compare: {
      toggle: "Comparar todos os recursos",
      hide: "Ocultar comparação",
      caption: "Recursos de cada plano",
      feature: "Recurso",
      yes: "Incluído",
      no: "Não incluído",
      soon: "Em breve",
      basic: "Básicos",
      advanced: "Avançados",
      contract: "Sob contrato",
      rows: {
        esign: "Assinatura eletrônica",
        history: "Histórico e evidências",
        order: "Assinatura em ordem",
        approval: "Aprovação sem assinatura",
        returnFix: "Devolução para correção",
        reject: "Rejeição definitiva",
        templates: "Modelos reutilizáveis",
        certificate: "Assinatura com certificado digital",
        multiApproval: "Aprovação em várias etapas",
        team: "Vários usuários e permissões",
        reports: "Relatórios",
        bulk: "Envio em massa",
        api: "API e Webhooks",
        support: "Suporte personalizado",
      },
    },
  },
  sustainability: {
    title: "Não use papel, plante uma árvore!",
    text: "Cada documento assinado digitalmente é um passo para um futuro mais sustentável.",
    items: [
      { title: "Menos papel", text: "Mais árvores" },
      { title: "Processos digitais", text: "Mais eficiência" },
      { title: "Um futuro", text: "mais sustentável" },
    ],
  },
  testimonials: {
    eyebrow: "O que dizem nossos clientes",
    title: "Empresas que confiam e evoluem com a gente.",
    items: [
      {
        role: "Diretora Administrativa",
        quote:
          "O MDSign trouxe mais agilidade para nossa rotina de contratos. Eliminamos o papel, ganhamos tempo e muito mais segurança no processo.",
      },
      {
        role: "Diretora Executiva",
        quote:
          "A plataforma é simples e intuitiva. Nossos fornecedores assinam de qualquer lugar e o acompanhamento em tempo real facilitou muito a nossa gestão.",
      },
    ],
  },
  security: {
    eyebrow: "Segurança e validade",
    title: "Assinaturas com validade jurídica e processo rastreável.",
    subtitle:
      "Escolha o tipo de assinatura adequado a cada documento e tenha o registro de cada etapa.",
    items: [
      {
        title: "Validade jurídica",
        text: "A assinatura eletrônica tem validade jurídica no Brasil, conforme a MP 2.200-2/2001 e a Lei 14.063/2020, nos níveis simples, avançado e qualificado.",
      },
      {
        title: "Certificado digital ICP-Brasil (em breve)",
        text: "A assinatura com certificado ICP-Brasil (e-CPF e e-CNPJ) está em homologação e ainda não está disponível.",
      },
      {
        title: "Eletrônica ou com certificado",
        text: "Na assinatura eletrônica, o signatário é identificado pelos fatores de autenticação do processo. A assinatura com certificado digital chegará em breve, após homologação.",
      },
      {
        title: "Autenticação do signatário",
        text: "No envio, defina como cada participante confirma a identidade: e-mail, SMS, WhatsApp, aplicativo autenticador ou selfie, entre outros fatores disponíveis.",
      },
      {
        title: "Rastreabilidade",
        text: "Cada etapa fica registrada: criação, assinatura, aprovação, recusa, cancelamento e conclusão, com os detalhes de cada assinatura.",
      },
      {
        title: "Validação do documento",
        text: "Qualquer pessoa confere as assinaturas de um documento pelo código de verificação ou enviando o arquivo assinado.",
      },
      {
        title: "LGPD",
        text: "Tratamento de dados pessoais em atendimento à Lei Geral de Proteção de Dados.",
      },
    ],
  },
  faq: {
    eyebrow: "Dúvidas frequentes",
    title: "Ainda tem dúvidas?",
    subtitle:
      "Separamos as principais perguntas para te ajudar. Se preferir, fale com a nossa equipe.",
    items: [
      {
        q: "A assinatura eletrônica tem validade jurídica?",
        a: "Sim. A MP 2.200-2/2001 e a Lei 14.063/2020 reconhecem a assinatura eletrônica como válida para comprovar a autoria e a integridade de documentos. Quando a lei exigir assinatura qualificada (ICP-Brasil), esse recurso ainda está em homologação no MDSign.",
      },
      {
        q: "O signatário precisa criar uma conta?",
        a: "Não. Cada participante recebe por e-mail o link para revisar e assinar o documento, sem precisar contratar um plano ou instalar nada. Lembretes podem ser enviados para quem ainda não assinou.",
      },
      {
        q: "Posso assinar com certificado digital?",
        a: "Ainda não. A assinatura com certificado digital ICP-Brasil (e-CPF e e-CNPJ) está em homologação e aparece como \"Em breve\" nos planos. Hoje o MDSign oferece assinatura eletrônica com evidências.",
      },
      {
        q: "Posso ter vários usuários na empresa?",
        a: "Sim. O número de usuários varia por plano: 1 no Cedro e no Jacarandá e até 4 no Ipê. No Mogno, a quantidade é definida em contrato.",
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
        a: "Os planos variam na quantidade de documentos, no número de usuários e nos recursos. O Cedro é gratuito (5 documentos), o Jacarandá tem 50 documentos por mês e o Ipê tem documentos ilimitados para equipes. O Mogno atende operações corporativas, com API, integrações e condições sob contrato.",
      },
      {
        q: "Como funciona o plano gratuito Cedro?",
        a: "O Cedro é gratuito e inclui 5 documentos no total (não são renovados a cada mês), 1 usuário, assinatura eletrônica e suporte por e-mail. Quando precisar de mais, é só escolher um plano pago.",
      },
    ],
  },
  finalCta: {
    title: "Menos papel. Mais agilidade para o seu negócio.",
    text: "Envie seu primeiro documento e conheça o MDSign.",
  },
  footer: {
    solutionBy: "O MDSign é uma solução da Mundo Digital Tech.",
    productTitle: "Produto",
    product: ["Funcionalidades", "Segurança", "Planos", "Integrações", "API"],
    companyTitle: "Empresa",
    company: ["Quem somos", "Blog", "Contato", "Suporte"],
    terms: "Termos de uso",
    privacy: "Política de privacidade",
    cookies: "Preferências de cookies",
    dataRights: "Seus dados (LGPD)",
    validate: "Validar documento",
    rights: "Todos os direitos reservados.",
  },
  lead: {
    specialistTitle: "Fale com um especialista",
    planTitle: "Plano {plan}",
    description:
      "Deixe seus dados e a equipe MDSign entra em contato para ativar sua conta ou tirar suas dúvidas.",
    name: "Nome",
    email: "E-mail",
    phone: "Telefone / WhatsApp",
    company: "Empresa",
    plan: "Plano de interesse",
    planUnknown: "Não sei ainda",
    message: "Mensagem",
    privacy: "Usaremos seus dados apenas para responder a este contato, conforme a LGPD.",
    send: "Enviar",
    error: "Não foi possível enviar agora. Tente novamente ou escreva para {email}.",
    successTitle: "Recebemos seu contato!",
    successText: "Nossa equipe vai falar com você em breve. Se preferir, escreva para {email}.",
    close: "Fechar",
  },
  developers: {
    metaTitle: "Desenvolvedores — API MDSign",
    metaDescription:
      "Integre a assinatura eletrônica do MDSign aos seus sistemas com API REST e webhooks.",
    eyebrow: "Desenvolvedores",
    title: "API REST e webhooks do MDSign",
    intro:
      "Integre a assinatura eletrônica aos seus próprios processos. A API é REST, recebe e devolve JSON e é autenticada por chave de aplicação enviada no cabeçalho {header}.",
    keyWarning:
      "A chave deve ficar no seu servidor. Nunca a coloque no código que roda no navegador ou em aplicativos.",
    resources: [
      {
        title: "Documentos",
        text: "Crie um ou vários documentos, consulte o status, baixe as versões assinadas, cancele ou mova para pastas.",
      },
      {
        title: "Fluxos de assinatura",
        text: "Defina signatários e aprovadores, a ordem de cada etapa e as formas de autenticação. Salve fluxos para reutilizar.",
      },
      {
        title: "Uploads",
        text: "Envie o arquivo (multipart ou Base64) e use o identificador retornado para criar o documento.",
      },
      {
        title: "Pastas e organização",
        text: "Crie pastas, organize documentos em lote e gerencie os usuários da organização.",
      },
      {
        title: "Validação",
        text: "Valide as assinaturas de um documento pelo código de verificação ou enviando o arquivo assinado.",
      },
      {
        title: "Notificações",
        text: "Envie lembretes para os participantes que ainda têm ações pendentes.",
      },
    ],
    webhooksTitle: "Webhooks",
    webhooksText:
      "Em vez de consultar a API repetidamente, cadastre uma URL e receba um aviso (POST) a cada evento:",
  },
  login: {
    metaTitle: "Entrar — MDSign",
    eyebrow: "Acesso",
    title: "A nova área do cliente MDSign está chegando",
    text: "Em breve você vai acessar sua conta por aqui. Se já é cliente e precisa de ajuda, fale com a nossa equipe pelo e-mail {email}.",
  },
};

export type Messages = typeof pt;
export default pt;
