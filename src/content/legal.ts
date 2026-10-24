// Termos de Uso, Política de Privacidade e Condições do plano Cedro do MDSign.
//
// Texto das minutas enviadas pela Roberta em 14/10/2026 (MDSign_Termos_de_Uso_v3_Revisao_Retencao,
// MDSign_Politica_de_Privacidade_Revisao_Retencao e MDSign_Condicoes_Cedro_Revisao_Retencao),
// sem as notas internas de homologação. Ajuste combinado: a franquia do Cedro vale por pessoa.
// MINUTA: enquanto LEGAL_DRAFT for true, as páginas mostram o aviso e ficam fora dos buscadores.
// A versão oficial é a em português; en/es mostram o mesmo texto com um aviso.

import type { Locale } from "@/i18n";

export const LEGAL_DRAFT = true;
/** Mesma versão gravada no aceite do cadastro (src/routes/app/signup.tsx). */
export const LEGAL_VERSION = "2026-10";

export type LegalSection = { title: string; paragraphs: string[] };
export type LegalDoc = {
  title: string;
  metaDescription: string;
  version: string;
  sections: LegalSection[];
};
export type LegalKind = "terms" | "privacy" | "cedro";

export const legalUi: Record<
  Locale,
  { draftNotice: string; versionLabel: string; ptOnly: string | null }
> = {
  pt: {
    draftNotice:
      "Minuta em revisão jurídica. O texto final pode mudar; em caso de dúvida, fale com contato@mundodigitaltech.com.br.",
    versionLabel: "Versão",
    ptOnly: null,
  },
  en: {
    draftNotice:
      "Draft under legal review. The final text may change; if in doubt, contact contato@mundodigitaltech.com.br.",
    versionLabel: "Version",
    ptOnly:
      "This document is available in Portuguese only. The Portuguese version is the official one.",
  },
  es: {
    draftNotice:
      "Borrador en revisión jurídica. El texto final puede cambiar; ante dudas, escriba a contato@mundodigitaltech.com.br.",
    versionLabel: "Versión",
    ptOnly:
      "Este documento está disponible solo en portugués. La versión en portugués es la oficial.",
  },
};

const COMPANY = "Mundo Digital Tecnologia da Informação Ltda. — CNPJ 32.650.036/0001-07";

const terms: LegalDoc = {
  title: "Termos de Uso",
  metaDescription: "Termos de Uso da plataforma de assinatura eletrônica MDSign.",
  version: "3.0 — minuta de 07/10/2026",
  sections: [
    {
      title: "1. Identificação, alcance e aceite",
      paragraphs: [
        `O MDSign é uma plataforma de gestão e assinatura eletrônica de documentos oferecida por ${COMPANY} (“MDTech”, “nós”). O nome comercial SignDoc passa a ser MDSign. Estes Termos disciplinam o acesso e uso da plataforma, inclusive por clientes, administradores, usuários convidados e signatários externos, naquilo que lhes for aplicável.`,
        "O cliente manifesta aceite por ação afirmativa no cadastro ou contratação. Signatários externos recebem informações e condições próprias do fluxo de assinatura, sem obrigação de criar conta quando a funcionalidade permitir. A plataforma registra a versão aceita, data, horário e identificação técnica adequada.",
        "O uso da plataforma está sujeito também à Política de Privacidade, às condições do plano contratado e, quando aplicável, a instrumento empresarial específico. Em conflito, condições específicas expressamente negociadas prevalecem apenas quanto ao seu objeto.",
      ],
    },
    {
      title: "2. Definições",
      paragraphs: [
        "Cliente: pessoa física ou jurídica titular de uma conta ou organização. Usuário autorizado: pessoa habilitada pelo cliente com permissões definidas. Signatário: destinatário convidado para assinar ou participar de um fluxo. Documento: arquivo enviado, gerado ou processado na plataforma. Operação consumível: evento contabilizado conforme as regras do plano e sua implementação vigente.",
        "Organização: ambiente lógico de usuários e documentos sob administração do cliente. Plano: conjunto de recursos, limites, condições de pagamento e retenção aplicáveis. Evidências de assinatura: registros técnicos associados à operação, conforme a modalidade utilizada.",
      ],
    },
    {
      title: "3. Serviços e disponibilidade",
      paragraphs: [
        "O MDSign pode oferecer criação, envio, recebimento, assinatura eletrônica, modelos, formulários, fluxos, acompanhamento, gestão e armazenamento de documentos, conforme o plano e a disponibilidade efetiva de cada recurso. Recursos de integração, API, automações, envio em massa e modalidades específicas podem depender de contratação ou habilitação adicional.",
        "A MDTech empregará medidas técnicas e organizacionais proporcionais para operação e manutenção. Interrupções programadas, emergenciais ou decorrentes de terceiros poderão ocorrer; compromissos de nível de serviço somente existirão quando expressamente previstos em contratação específica.",
        "O limite técnico para envio individual é de 20 MB por PDF; o processamento em lote admite até 1.000 destinatários/linhas, conforme a funcionalidade habilitada. Recursos e limites podem variar por plano.",
      ],
    },
    {
      title: "4. Cadastro, elegibilidade e credenciais",
      paragraphs: [
        "O titular deve fornecer informações verdadeiras, atualizadas e necessárias à operação. A criação de conta é destinada a pessoas com capacidade legal para contratar ou devidamente representadas. O cliente deve proteger credenciais, controlar permissões e comunicar suspeitas de uso indevido.",
        "A MDTech pode adotar mecanismos proporcionais de verificação, segurança, prevenção de abuso e autenticação. A criação de múltiplas contas com finalidade de contornar limites gratuitos constitui uso indevido, sujeita a apuração e medidas proporcionais.",
      ],
    },
    {
      title: "5. Organizações e usuários",
      paragraphs: [
        "O administrador designado pelo cliente gerencia convites, acessos e permissões nos limites do plano. O cliente responde pela autorização e legitimidade do acesso concedido a colaboradores e terceiros, sem prejuízo das responsabilidades legais próprias da MDTech.",
        "A segregação lógica de dados entre organizações e as permissões de acesso devem observar os controles efetivamente implementados.",
      ],
    },
    {
      title: "6. Assinaturas eletrônicas e validade",
      paragraphs: [
        "O MDSign prevê assinaturas eletrônicas simples, avançadas e qualificadas (ICP-Brasil), conforme a modalidade contratada e os recursos efetivamente habilitados. Podem ser utilizados links autenticados, fatores adicionais como OTP, verificações de identidade e certificados digitais, conforme disponibilidade e homologação de cada fluxo. A escolha da modalidade deve observar a legislação e a natureza do documento.",
        "Cabe ao cliente avaliar a modalidade exigida por lei, contrato, órgão destinatário ou natureza do ato. A MDTech não é parte, testemunha ou garantidora do negócio jurídico documentado, salvo ajuste expresso em contrário. Não se promete aceitação universal de toda modalidade por qualquer destinatário.",
      ],
    },
    {
      title: "7. Documentos, evidências, armazenamento e retenção",
      paragraphs: [
        "O cliente é responsável pela licitude, exatidão e autorização para tratamento do conteúdo enviado, inclusive dados de terceiros. A MDTech executa as operações técnicas contratadas e adota medidas de proteção adequadas.",
        "Após o cancelamento da conta, haverá prazo de 30 (trinta) dias para exportação dos documentos pelos meios efetivamente disponibilizados. A exclusão dos documentos nos ambientes operacionais está prevista até o 60º (sexagésimo) dia contado do cancelamento, ressalvados dados e evidências cuja conservação seja necessária por obrigação legal, exercício regular de direitos ou outra base legal aplicável.",
        "A disponibilidade de documentos criados no plano Cedro termina 6 (seis) meses após sua criação, independentemente de exclusão física.",
        "O encerramento da assinatura ou do plano não implica, por si só, destruição imediata de documentos ou evidências sujeitos a obrigações legais, exercício regular de direitos ou políticas de retenção legitimamente aplicáveis. Evidências essenciais de assinatura seguem a diretriz inicial de conservação por 5 (cinco) anos após a conclusão do procedimento, sujeita a validação jurídica e a exceções por tipo documental; dados biométricos brutos não estão automaticamente abrangidos.",
      ],
    },
    {
      title: "8. Planos e franquias",
      paragraphs: [
        "Cedro: gratuito, 1 usuário, franquia total de 5 documentos por pessoa (somando as organizações no plano gratuito), não renovada mensalmente e sem exigência de cartão de crédito. Os demais planos são Jacarandá (R$ 39,90/mês; 50 documentos/mês; 1 usuário), Ipê (R$ 99,97/mês; documentos ilimitados; até 4 usuários) e Mogno (sob proposta e contrato).",
        "“Ilimitado” refere-se à franquia de documentos, sem afastar regras de uso aceitável e limites técnicos razoáveis. Para planos sujeitos a franquia, cada documento consome uma unidade no momento da criação; cancelamento, recusa ou exclusão posterior não restituem essa unidade. Falhas técnicas que impeçam a criação do documento não consomem a franquia.",
        "Valores e ofertas vigentes devem ser exibidos antes da contratação, com impostos e condições aplicáveis, sem prejuízo das condições de contratos empresariais já firmados.",
      ],
    },
    {
      title: "9. Contratação, pagamento e renovação",
      paragraphs: [
        "Os planos pagos renovam-se automaticamente a cada mês, com vencimento no dia correspondente à contratação, observadas as regras de calendário e as condições informadas no checkout. As formas de pagamento previstas são cartão e Pix recorrente, quando efetivamente habilitadas.",
        "Em caso de inadimplência, haverá tolerância de 7 (sete) dias corridos após o vencimento antes de eventual suspensão de funcionalidades, observadas as comunicações cabíveis. Em seguida poderão ser bloqueadas novas operações, preservando-se o acesso aos documentos conforme as regras aplicáveis.",
      ],
    },
    {
      title: "10. Alteração de plano, suspensão e cancelamento",
      paragraphs: [
        "Nos planos pagos, o cancelamento solicitado pelo cliente impede a próxima renovação automática e mantém o acesso às funcionalidades contratadas até o término do período já pago, ressalvadas suspensões justificadas por fraude, segurança ou determinação legal. Não há reembolso contratual voluntário de períodos pagos, ressalvados direito de arrependimento, estornos e demais direitos previstos em lei. O cancelamento da conta inicia a janela de 30 dias para recuperação dos documentos, conforme a seção 7.",
        "O cliente poderá solicitar alteração ou cancelamento pelos canais disponibilizados. Efeitos financeiros, eventual proporcionalidade, data de mudança e política de reembolso devem ser informados antes da contratação e observar a legislação aplicável, inclusive direitos do consumidor quando incidentes.",
        "Na inadimplência, poderá haver restrição proporcional de novas operações, após comunicações cabíveis, preservados os direitos legais e a política de acesso/exportação. Não haverá exclusão automática de documentos exclusivamente por atraso no pagamento.",
        "A MDTech poderá restringir ou suspender o acesso diante de fraude, risco de segurança, violação grave destes Termos ou determinação legal, observando proporcionalidade e possibilidade de correção quando cabível.",
      ],
    },
    {
      title: "11. Uso aceitável",
      paragraphs: [
        "É proibido usar a plataforma para atos ilícitos, violação de direitos de terceiros, fraude, envio abusivo de mensagens, tentativa de acesso não autorizado, malware, engenharia de contorno de franquias ou automação não autorizada.",
        "O cliente deverá assegurar base legítima para compartilhar dados de signatários e evitar comunicações não solicitadas.",
      ],
    },
    {
      title: "12. Responsabilidades e limitações",
      paragraphs: [
        "A MDTech responde pelas obrigações que lhe cabem nos termos da lei e do contrato, inclusive quanto à prestação do serviço e segurança sob seu controle. O cliente responde pela origem, conteúdo, destinatários, autorizações e adequação jurídica dos documentos que submete.",
        "Nenhuma cláusula exclui responsabilidade que não possa ser afastada pela legislação aplicável, nem direitos irrenunciáveis de consumidores ou titulares de dados. A MDTech não responde por fatos exclusivamente atribuíveis ao cliente ou a terceiros quando comprovados os pressupostos legais pertinentes.",
      ],
    },
    {
      title: "13. Proteção de dados e confidencialidade",
      paragraphs: [
        "O tratamento de dados pessoais observará a LGPD e a Política de Privacidade MDSign. Os papéis de controlador e operador serão definidos conforme a finalidade concreta: a MDTech pode atuar como controladora de dados cadastrais, faturamento e segurança e como operadora em operações documentais realizadas sob instrução do cliente, sem prejuízo de situações específicas.",
        "Dados e documentos serão tratados com confidencialidade, observadas autorizações legítimas, obrigações legais, segurança, suporte autorizado e exercício regular de direitos.",
      ],
    },
    {
      title: "14. Propriedade intelectual e integrações",
      paragraphs: [
        "A plataforma, sua interface, código, marcas e materiais são protegidos por direitos de propriedade intelectual da MDTech ou de licenciantes. O cliente mantém os direitos que possua sobre seus documentos e concede as autorizações técnicas necessárias à prestação do serviço.",
        "Integrações de terceiros poderão estar sujeitas a condições adicionais divulgadas previamente.",
      ],
    },
    {
      title: "15. Suporte e comunicações",
      paragraphs: [
        "Canal de privacidade e suporte: contato@mundodigitaltech.com.br. Endereço institucional: SCS, Quadra 01, Bloco K, Sala 1103, Asa Sul, Brasília/DF, Brasil. Horários e canais adicionais serão divulgados na plataforma.",
        "Avisos relevantes poderão ser encaminhados ao e-mail cadastrado ou exibidos na plataforma. O cliente deve manter contatos atualizados.",
      ],
    },
    {
      title: "16. Alterações dos termos",
      paragraphs: [
        "Alterações contratuais relevantes serão comunicadas, como regra, com antecedência de 30 (trinta) dias, ressalvadas medidas urgentes de segurança, determinações legais e hipóteses justificadas. Versões e datas de vigência serão identificadas; novo aceite será solicitado quando necessário.",
      ],
    },
    {
      title: "17. Disposições finais e solução de conflitos",
      paragraphs: [
        "Aplica-se a legislação brasileira. A solução de controvérsias buscará inicialmente canais de atendimento e mecanismos consensuais, sem restringir direitos legais de acesso ao Judiciário, competência territorial ou proteção do consumidor.",
        "A nulidade de uma disposição não invalida as demais. Esta versão substitui o texto legado apenas após aprovação, publicação e procedimentos de comunicação aplicáveis.",
      ],
    },
  ],
};

const privacy: LegalDoc = {
  title: "Política de Privacidade",
  metaDescription:
    "Como o MDSign trata dados pessoais de clientes, signatários e visitantes, conforme a LGPD.",
  version: "1.0 — minuta de 07/10/2026",
  sections: [
    {
      title: "1. Quem somos",
      paragraphs: [
        `Esta Política explica como ${COMPANY.replace(" — ", ", ")}, responsável pela marca MDSign, trata dados pessoais relacionados à plataforma. Endereço institucional: SCS, Quadra 01, Bloco K, Sala 1103, Asa Sul, Brasília/DF, Brasil. Contato de privacidade: contato@mundodigitaltech.com.br.`,
      ],
    },
    {
      title: "2. Categorias de titulares",
      paragraphs: [
        "Clientes e representantes de organizações; usuários autorizados; signatários externos; visitantes do site; leads de campanhas; contatos de suporte e fornecedores, conforme a relação concreta.",
      ],
    },
    {
      title: "3. Dados tratados",
      paragraphs: [
        "Cadastro e conta: nome, e-mail, telefone, CPF quando necessário, organização, credenciais protegidas e preferências.",
        "Assinaturas e documentos: dados incluídos nos arquivos, identificação de participantes, registros de autenticação, eventos, horários e evidências técnicas pertinentes.",
        "Dados técnicos e de segurança: IP, dispositivo, navegador, logs, identificadores de sessão e sinais proporcionais de prevenção a fraude.",
        "Dados comerciais: plano, consumo, histórico de contratação, pagamentos e informações financeiras necessárias, conforme o meio de cobrança efetivamente utilizado.",
        "Marketing e aquisição: origem de campanha, parâmetros UTM, interações na landing, preferências e autorizações de comunicação.",
        "O conteúdo de documentos pode conter dados sensíveis inseridos pelo cliente. O MDSign não deve solicitar dados além dos necessários à finalidade concreta.",
      ],
    },
    {
      title: "4. Finalidades e bases legais",
      paragraphs: [
        "Criar e manter contas; executar fluxos documentais; autenticar signatários; fornecer suporte; cumprir obrigações legais; prevenir fraudes; proteger sistemas; realizar cobranças; mensurar desempenho e melhorar a experiência; enviar comunicações comerciais quando houver base legal adequada.",
        "As bases legais variam conforme a operação, podendo incluir execução de contrato, cumprimento de obrigação legal/regulatória, exercício regular de direitos, legítimo interesse sujeito a avaliação aplicável e consentimento quando necessário. Não se presume que todo tratamento depende de consentimento.",
      ],
    },
    {
      title: "5. Papéis de controlador e operador",
      paragraphs: [
        "A MDTech geralmente atua como controladora dos dados necessários à administração de contas, segurança, faturamento e relacionamento comercial. Em fluxos documentais iniciados por clientes organizacionais, pode atuar como operadora dos dados tratados sob instruções do cliente, que determina as finalidades do documento.",
        "A qualificação concreta depende das decisões efetivas sobre finalidade e meios essenciais, podendo exigir acordo de tratamento de dados específico com clientes empresariais.",
      ],
    },
    {
      title: "6. Compartilhamento e operadores",
      paragraphs: [
        "O MDSign utiliza Lovable/Cloudflare Workers para aplicação e distribuição; Supabase (PostgreSQL, Auth, Storage e Edge Functions) para dados e backend; o motor SignDoc (Lacuna Software) para fluxos de assinatura; e o Asaas para processamento financeiro, quando a integração for ativada em produção. Outros fornecedores de mensageria, identidade e biometria serão identificados conforme seu uso efetivo.",
      ],
    },
    {
      title: "7. Cookies, analytics e campanhas",
      paragraphs: [
        "A aplicação utiliza o cookie funcional mdsign_lang para o idioma; armazenamento local para a sessão de acesso; sessionStorage para parâmetros UTM e para um código anônimo de sessão usado na contagem de visitas; e eventos próprios enviados à camada dataLayer. Há integração condicional com Google Tag Manager (GTM), cujo contêiner pode carregar outras tags conforme configuração. Tags não essenciais (análise e marketing) só são carregadas depois do consentimento, dado no aviso de cookies; o Google Consent Mode começa negado. As preferências podem ser revistas a qualquer momento em “Preferências de cookies”, no rodapé do site. Cada escolha é registrada de forma anônima (um código aleatório do navegador, a opção escolhida e a data), como comprovante do consentimento.",
        "Não serão enviados a plataformas publicitárias CPF, conteúdo documental, dados sensíveis ou informações pessoais desnecessárias.",
      ],
    },
    {
      title: "8. Marketing e preferências",
      paragraphs: [
        "Comunicações operacionais necessárias à prestação do serviço são distintas de publicidade. O recebimento de campanhas e ofertas será baseado em fundamento jurídico apropriado, com informação clara e opção de descadastro ou oposição conforme aplicável. O aceite dos Termos não equivale a aceite de marketing.",
      ],
    },
    {
      title: "9. Armazenamento, segurança e incidentes",
      paragraphs: [
        "Adotamos controles técnicos e organizacionais compatíveis com os riscos, como gestão de acessos, segregação de ambientes, registros de auditoria e proteção de dados, conforme implementação efetiva. Nenhum ambiente é absolutamente imune a riscos.",
        "Incidentes serão avaliados e comunicados aos titulares e à ANPD quando legalmente exigível, considerando a legislação e regulamentação vigente.",
      ],
    },
    {
      title: "10. Retenção e eliminação",
      paragraphs: [
        "Os dados são conservados pelo período necessário às finalidades declaradas, obrigações legais, preservação de evidências e exercício regular de direitos. Após esse período, serão eliminados ou anonimizados quando cabível.",
        "No plano Cedro, o acesso aos documentos encerra-se 6 (seis) meses após cada criação, sem que isso represente necessariamente eliminação física. Após cancelamento da conta, o titular terá 30 (trinta) dias para exportação, com exclusão operacional programada até o 60º dia, ressalvadas hipóteses legítimas de retenção.",
        "Evidências essenciais de assinatura: diretriz interna inicial de 5 (cinco) anos após a conclusão do procedimento, sujeita à validação jurídica por categoria documental e eventual preservação por obrigação legal ou litígio. Dados biométricos brutos e selfies terão prazos específicos definidos por necessidade e finalidade, não sendo automaticamente abrangidos pelos cinco anos. Dados fiscais, financeiros, logs e backups obedecerão à matriz própria de retenção e expurgo.",
      ],
    },
    {
      title: "11. Transferência internacional",
      paragraphs: [
        "O uso de infraestrutura global Cloudflare e Supabase/AWS pode envolver processamento e transferência internacional de dados. As transferências observarão os mecanismos legalmente aplicáveis da LGPD (art. 33) e da regulamentação da ANPD, inclusive cláusulas-padrão quando pertinentes e efetivamente adotadas.",
      ],
    },
    {
      title: "12. Direitos dos titulares",
      paragraphs: [
        "O titular poderá solicitar confirmação de tratamento, acesso, correção, anonimização, bloqueio ou eliminação quando cabíveis, portabilidade, informação sobre compartilhamento e demais direitos previstos na LGPD. Pedidos poderão exigir verificação de identidade.",
        "Quando a MDTech atuar como operadora, poderá encaminhar a solicitação ao cliente controlador e cooperar com sua resposta, conforme obrigações aplicáveis.",
      ],
    },
    {
      title: "13. Menores de idade",
      paragraphs: [
        "O uso da conta deverá observar capacidade legal e regras de representação. Eventuais dados de crianças e adolescentes incluídos em documentos serão tratados conforme a legislação e o melhor interesse aplicável.",
      ],
    },
    {
      title: "14. Contato e atualizações",
      paragraphs: [
        "Para exercer direitos relacionados a dados pessoais, use o formulário “Seus dados (LGPD)”, no rodapé do site (endereço /pt/titular), que gera um protocolo com prazo de resposta, ou escreva para contato@mundodigitaltech.com.br. Esta Política poderá ser atualizada, com indicação de versão e data e comunicação quando necessária.",
      ],
    },
  ],
};

const cedro: LegalDoc = {
  title: "Condições do plano Cedro",
  metaDescription:
    "Regras do plano gratuito Cedro do MDSign: 5 documentos no total, sem cartão de crédito.",
  version: "1.0 — minuta de 07/10/2026",
  sections: [
    {
      title: "O que está incluído",
      paragraphs: [
        `O Cedro é o plano gratuito de entrada do MDSign, disponibilizado pela ${COMPANY.replace(" — CNPJ ", " (CNPJ ")}).`,
        "Preço: R$ 0. Franquia: 5 documentos no total por pessoa, somando as organizações no plano gratuito; não se renova a cada mês. Usuários incluídos: 1. Não exige cartão de crédito para criação da conta. Recursos disponíveis conforme a configuração efetiva do Cedro no MDSign.",
      ],
    },
    {
      title: "Quando um documento é consumido",
      paragraphs: [
        "Cada documento criado consome uma unidade da franquia no momento de sua criação. Documentos posteriormente cancelados, recusados ou excluídos continuam contabilizados e não restituem a unidade utilizada. Tentativas que não chegam a gerar o documento, por falha técnica, não consomem a franquia.",
        "A exclusão de documento não recupera a franquia consumida.",
      ],
    },
    {
      title: "Ao utilizar os cinco documentos",
      paragraphs: [
        "Ao atingir a franquia, novas operações consumíveis ficam indisponíveis no Cedro. O usuário poderá avaliar a contratação de um plano pago para continuar.",
        "Cada documento criado no Cedro permanece disponível para consulta e exportação por 6 (seis) meses a partir de sua criação, com a data indicada no painel. Encerrado esse prazo, termina a disponibilidade ao usuário, sem implicar eliminação física imediata nem afastar a conservação legítima de evidências de assinatura. Se a organização passar para um plano pago, o acesso aos documentos é restabelecido. Se a conta for cancelada antes desse prazo, aplica-se a janela de 30 dias para exportação e a exclusão operacional prevista até 60 dias após o cancelamento, ressalvadas exceções legais e técnicas.",
        "O encerramento da disponibilidade aos seis meses não renova a franquia de cinco documentos, nem altera a regra de consumo no momento da criação.",
      ],
    },
    {
      title: "Uso responsável",
      paragraphs: [
        "O benefício é destinado ao uso legítimo da plataforma. É vedada a criação abusiva de contas ou outros mecanismos destinados a contornar a franquia. A MDTech poderá aplicar controles antifraude proporcionais, sem discriminação indevida e conforme a legislação.",
      ],
    },
    {
      title: "Privacidade e comunicação",
      paragraphs: [
        "Os dados necessários à conta e às assinaturas são tratados conforme a Política de Privacidade MDSign. Receber ofertas e novidades é opcional quando depender de consentimento, e a escolha não altera o direito ao plano gratuito.",
      ],
    },
  ],
};

export const legalDocs: Record<LegalKind, LegalDoc> = { terms, privacy, cedro };
/** Caminho de cada página (sem o idioma). */
export const legalPaths: Record<LegalKind, string> = {
  terms: "/termos",
  privacy: "/privacidade",
  cedro: "/condicoes-cedro",
};
