// Termos de uso e Política de privacidade do MDSign.
//
// RASCUNHO PARA REVISÃO JURÍDICA: o texto descreve o que o sistema faz hoje (dados tratados,
// fornecedores, retenção), mas precisa ser revisado e aprovado pelo jurídico da Mundo Digital
// Tech antes de valer como versão final. Enquanto LEGAL_DRAFT for true, as páginas mostram o
// aviso de versão preliminar e ficam fora dos buscadores (noindex).
// Itens entre [colchetes] são informações a completar.

import type { Locale } from "@/i18n";

export const LEGAL_DRAFT = true;
/** Mesma versão gravada no aceite do cadastro (src/routes/app/signup.tsx). */
export const LEGAL_VERSION = "2026-10";

export type LegalSection = { title: string; paragraphs: string[] };
export type LegalDoc = {
  title: string;
  metaDescription: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
};

type LegalCopy = {
  draftNotice: string;
  updatedLabel: string;
  terms: LegalDoc;
  privacy: LegalDoc;
};

const pt: LegalCopy = {
  draftNotice:
    "Versão preliminar, em revisão jurídica. O texto final pode mudar; em caso de dúvida, fale com contato@mundodigitaltech.com.br.",
  updatedLabel: "Última atualização",
  terms: {
    title: "Termos de uso",
    metaDescription: "Termos de uso da plataforma de assinatura eletrônica MDSign.",
    updated: "Outubro de 2026",
    intro:
      "Estes Termos regulam o uso do MDSign, plataforma de assinatura eletrônica de documentos oferecida pela Mundo Digital Tech ([razão social], CNPJ [00.000.000/0000-00]), com sede no SCS QD 01 Bl K Sala 1103, Asa Sul, Brasília/DF. Ao criar uma conta ou usar o MDSign, você declara que leu e aceita estes Termos e a Política de privacidade.",
    sections: [
      {
        title: "1. O que é o MDSign",
        paragraphs: [
          "O MDSign permite enviar documentos em PDF para assinatura eletrônica, assinar os próprios documentos, acompanhar cada etapa, usar modelos, formulários públicos, envio em massa, processos e integrações, conforme o plano contratado.",
          "As assinaturas são realizadas por um motor de assinatura especializado, que registra as evidências da assinatura (como data, hora, endereço IP e método de autenticação) na trilha de auditoria do documento, nos termos da Lei nº 14.063/2020 e da Medida Provisória nº 2.200-2/2001.",
        ],
      },
      {
        title: "2. Conta e responsabilidades",
        paragraphs: [
          "Para usar o MDSign é preciso criar uma conta com dados verdadeiros e atualizados. O CPF é exigido para identificar quem assina, conforme o fluxo brasileiro de assinatura.",
          "Você é responsável por manter sua senha em sigilo e por todas as ações feitas com sua conta. Avise-nos imediatamente se suspeitar de uso indevido.",
          "Cada organização tem um proprietário, que gerencia os membros, as permissões e o plano. As ações dos membros dentro da organização são de responsabilidade da organização.",
        ],
      },
      {
        title: "3. Uso permitido",
        paragraphs: [
          "Você se compromete a usar o MDSign apenas para fins lícitos e a enviar somente documentos e dados de pessoas que você tem o direito de tratar.",
          "É proibido: falsificar identidade ou assinaturas; enviar conteúdo ilícito, fraudulento ou que viole direitos de terceiros; tentar acessar dados de outras organizações; sobrecarregar, testar falhas ou contornar limites e controles da plataforma; criar contas em série para obter benefícios gratuitos indevidamente.",
        ],
      },
      {
        title: "4. Planos, plano gratuito e pagamentos",
        paragraphs: [
          "O plano gratuito Cedro oferece até 5 documentos no total, por pessoa, sem cartão de crédito. Criar a conta não consome documentos.",
          "Os planos pagos (Jacarandá, Angico, Aroeira, Ipê e Mogno) têm os preços, limites e recursos informados na página de planos no momento da contratação. A cobrança é recorrente e processada pelo parceiro de pagamentos.",
          "Ao atingir o limite do plano, novas operações que consomem documentos ficam bloqueadas até a mudança de plano. A consulta e o download dos documentos já existentes continuam disponíveis.",
          "Você pode cancelar a assinatura a qualquer momento em Organização → Plano e cobrança. O plano vale até o fim do período já pago; depois, a organização volta ao Cedro. Não há reembolso proporcional, salvo quando a lei exigir. [Revisar regras de arrependimento, reajuste e inadimplência.]",
        ],
      },
      {
        title: "5. Documentos e conteúdo",
        paragraphs: [
          "Os documentos e os dados inseridos continuam sendo seus. Você nos autoriza a armazená-los e processá-los apenas para prestar o serviço.",
          "Você é responsável pelo conteúdo dos documentos, pela escolha dos signatários e pela verificação de que o tipo de assinatura escolhido é adequado ao seu caso.",
        ],
      },
      {
        title: "6. Disponibilidade e suporte",
        paragraphs: [
          "Trabalhamos para manter o MDSign disponível e seguro, mas podem ocorrer interrupções para manutenção ou por falhas de terceiros (como o motor de assinatura, provedores de nuvem ou de e-mail).",
          "O suporte é prestado pelos canais informados no site. [Definir prazos de atendimento por plano, se houver.]",
        ],
      },
      {
        title: "7. Limitação de responsabilidade",
        paragraphs: [
          "Na extensão permitida pela lei, a Mundo Digital Tech não responde por danos indiretos, lucros cessantes ou perdas decorrentes de uso indevido da conta, de conteúdo enviado pelo usuário ou de indisponibilidade de serviços de terceiros. [Revisar limites e exceções com o jurídico.]",
        ],
      },
      {
        title: "8. Suspensão e encerramento",
        paragraphs: [
          "Podemos suspender ou encerrar contas que violem estes Termos ou a lei, ou em caso de inadimplência, com aviso prévio sempre que possível.",
          "Você pode encerrar sua conta a qualquer momento pelo e-mail contato@mundodigitaltech.com.br. Alguns registros são mantidos pelo prazo exigido em lei, como a trilha de auditoria das assinaturas.",
        ],
      },
      {
        title: "9. Alterações",
        paragraphs: [
          "Podemos atualizar estes Termos. Mudanças relevantes serão comunicadas com antecedência pelo e-mail cadastrado ou dentro da plataforma.",
        ],
      },
      {
        title: "10. Lei e foro",
        paragraphs: [
          "Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro de [Brasília/DF], salvo quando a lei garantir ao consumidor o foro do seu domicílio.",
        ],
      },
    ],
  },
  privacy: {
    title: "Política de privacidade",
    metaDescription: "Como o MDSign trata dados pessoais, conforme a LGPD.",
    updated: "Outubro de 2026",
    intro:
      "Esta Política explica como a Mundo Digital Tech ([razão social], CNPJ [00.000.000/0000-00]) trata dados pessoais no MDSign, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).",
    sections: [
      {
        title: "1. Papéis no tratamento",
        paragraphs: [
          "Para os dados da sua conta, do seu cadastro e da cobrança, a Mundo Digital Tech é a controladora.",
          "Para os documentos e os dados de signatários que a sua organização insere no MDSign, a sua organização é a controladora e a Mundo Digital Tech atua como operadora, tratando esses dados apenas para prestar o serviço, conforme as instruções da organização.",
        ],
      },
      {
        title: "2. Dados que tratamos",
        paragraphs: [
          "Conta e perfil: nome, e-mail, CPF, celular (opcional), idioma e senha (guardada de forma criptografada pelo provedor de autenticação).",
          "Organização: nome, CNPJ (opcional), membros, permissões, plano e consumo.",
          "Documentos e signatários: os arquivos enviados e os dados de quem assina, aprova ou acompanha (nome, e-mail, CPF, celular), além do histórico de cada documento.",
          "Evidências da assinatura: data, hora, endereço IP, método de autenticação e demais registros da trilha de auditoria, gerados pelo motor de assinatura.",
          "Cobrança: dados de faturamento (nome, CPF ou CNPJ, telefone e endereço de cobrança). Os dados do cartão são informados diretamente ao parceiro de pagamentos; o MDSign não os recebe nem armazena.",
          "Origem do cadastro e uso do produto: a campanha e a página por onde você chegou (parâmetros UTM e página de origem) e marcos de uso (por exemplo, primeiro documento concluído), sem conteúdo dos documentos. Visitas à página de cadastro grátis são contadas com um código anônimo de sessão, sem cookie.",
          "Consentimentos: o aceite destes termos e a sua escolha sobre comunicações de marketing.",
        ],
      },
      {
        title: "3. Para que usamos os dados",
        paragraphs: [
          "Prestar o serviço (execução de contrato): criar a conta, gerar, enviar e assinar documentos, enviar convites e lembretes, guardar a trilha de auditoria.",
          "Cumprir obrigações legais e regulatórias, como a guarda de registros de acesso e de evidências das assinaturas.",
          "Cobrança e prevenção de fraude (legítimo interesse e execução de contrato), inclusive o limite do plano gratuito por pessoa.",
          "Melhorar o produto e entender quais canais trazem usuários (legítimo interesse), com dados mínimos e sem conteúdo dos documentos.",
          "Enviar novidades e ofertas apenas se você consentir. Você pode retirar o consentimento a qualquer momento, sem afetar o uso da conta.",
        ],
      },
      {
        title: "4. Com quem compartilhamos",
        paragraphs: [
          "Com fornecedores necessários ao serviço, que tratam os dados conforme nossas instruções: motor de assinatura eletrônica (Lacuna Software — SignDoc), infraestrutura de nuvem e banco de dados (Supabase), parceiro de pagamentos (Asaas), envio de mensagens de WhatsApp, quando a organização ativar esse canal (BotConversa), e consulta de endereço por CEP (ViaCEP, apenas o CEP informado). [Confirmar a lista final de fornecedores e as hospedagens.]",
          "Com autoridades, quando houver obrigação legal ou ordem judicial.",
          "Não vendemos dados pessoais.",
        ],
      },
      {
        title: "5. Transferência internacional",
        paragraphs: [
          "Alguns fornecedores podem armazenar ou processar dados fora do Brasil. Nesses casos, adotamos as salvaguardas previstas na LGPD, como cláusulas contratuais. [Indicar países e salvaguardas após revisão dos contratos.]",
        ],
      },
      {
        title: "6. Por quanto tempo guardamos",
        paragraphs: [
          "Os dados da conta ficam enquanto ela estiver ativa. Documentos e trilhas de auditoria ficam pelo tempo necessário ao serviço e às obrigações legais. Arquivos temporários (como partes de um envio em massa e rascunhos não enviados) são apagados automaticamente em poucos dias. [Definir prazos de guarda após o encerramento da conta.]",
        ],
      },
      {
        title: "7. Segurança",
        paragraphs: [
          "Usamos conexão criptografada, controle de acesso por organização no banco de dados, permissões por papel, registros de auditoria e armazenamento privado de arquivos. Nenhuma medida é infalível; em caso de incidente relevante, comunicaremos os titulares e a ANPD conforme a lei.",
        ],
      },
      {
        title: "8. Cookies e armazenamento no navegador",
        paragraphs: [
          "O MDSign usa apenas o armazenamento necessário para funcionar, como manter você conectado, lembrar o idioma e a organização escolhida. A contagem de visitas usa um código anônimo que é apagado ao fechar a aba. Se ferramentas de análise de terceiros forem ativadas no futuro, esta Política será atualizada e, quando necessário, pediremos seu consentimento.",
        ],
      },
      {
        title: "9. Seus direitos",
        paragraphs: [
          "Você pode pedir confirmação do tratamento, acesso, correção, anonimização, portabilidade, eliminação dos dados tratados com consentimento, informação sobre compartilhamentos e revisão de decisões automatizadas, além de revogar consentimentos.",
          "Para documentos de uma organização, os pedidos são encaminhados à organização responsável, que é a controladora desses dados.",
          "Fale com o encarregado de dados (DPO): [nome do encarregado], pelo e-mail [privacidade@mundodigitaltech.com.br]. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).",
        ],
      },
      {
        title: "10. Alterações",
        paragraphs: [
          "Podemos atualizar esta Política. A data da última atualização fica no topo da página, e mudanças relevantes serão comunicadas.",
        ],
      },
    ],
  },
};

const en: LegalCopy = {
  draftNotice:
    "Preliminary version under legal review. The final text may change; if in doubt, contact contato@mundodigitaltech.com.br. The Portuguese version prevails.",
  updatedLabel: "Last updated",
  terms: {
    title: "Terms of use",
    metaDescription: "Terms of use of the MDSign electronic signature platform.",
    updated: "October 2026",
    intro:
      "These Terms govern the use of MDSign, an electronic document signature platform provided by Mundo Digital Tech ([legal name], CNPJ [00.000.000/0000-00]), headquartered at SCS QD 01 Bl K Sala 1103, Asa Sul, Brasília/DF, Brazil. By creating an account or using MDSign, you declare that you have read and accept these Terms and the Privacy policy.",
    sections: [
      {
        title: "1. What MDSign is",
        paragraphs: [
          "MDSign lets you send PDF documents for electronic signature, sign your own documents, track each step and use templates, public forms, bulk sending, processes and integrations, according to your plan.",
          "Signatures are performed by a specialized signature engine, which records the signature evidence (such as date, time, IP address and authentication method) in the document's audit trail, under Brazilian Law 14.063/2020 and Provisional Measure 2.200-2/2001.",
        ],
      },
      {
        title: "2. Account and responsibilities",
        paragraphs: [
          "To use MDSign you must create an account with true and up-to-date information. The CPF (Brazilian taxpayer ID) is required to identify signers, as required by the Brazilian signature flow.",
          "You are responsible for keeping your password secret and for all actions taken with your account. Notify us immediately if you suspect misuse.",
          "Each organization has an owner who manages members, permissions and the plan. Members' actions within the organization are the organization's responsibility.",
        ],
      },
      {
        title: "3. Permitted use",
        paragraphs: [
          "You agree to use MDSign only for lawful purposes and to send only documents and data of people you have the right to process.",
          "It is forbidden to: forge identities or signatures; send unlawful, fraudulent or rights-infringing content; try to access other organizations' data; overload, probe or bypass the platform's limits and controls; create accounts in series to obtain free benefits improperly.",
        ],
      },
      {
        title: "4. Plans, free plan and payments",
        paragraphs: [
          "The free Cedro plan offers up to 5 documents in total, per person, with no credit card. Creating the account uses no documents.",
          "Paid plans (Jacarandá, Angico, Aroeira, Ipê and Mogno) have the prices, limits and features shown on the plans page at the time of purchase. Billing is recurring and processed by our payment partner.",
          "When the plan limit is reached, new operations that use documents are blocked until the plan changes. Viewing and downloading existing documents remain available.",
          "You may cancel at any time in Organization → Plan and billing. The plan remains valid until the end of the paid period; afterwards the organization returns to Cedro. There is no pro-rata refund, except where required by law. [Review withdrawal, price adjustment and default rules.]",
        ],
      },
      {
        title: "5. Documents and content",
        paragraphs: [
          "Documents and the data you enter remain yours. You authorize us to store and process them only to provide the service.",
          "You are responsible for the content of the documents, the choice of signers and for checking that the chosen signature type suits your case.",
        ],
      },
      {
        title: "6. Availability and support",
        paragraphs: [
          "We work to keep MDSign available and secure, but interruptions may occur for maintenance or due to third-party failures (such as the signature engine, cloud or email providers).",
          "Support is provided through the channels listed on the website. [Define response times per plan, if any.]",
        ],
      },
      {
        title: "7. Limitation of liability",
        paragraphs: [
          "To the extent permitted by law, Mundo Digital Tech is not liable for indirect damages, lost profits or losses arising from account misuse, user-submitted content or unavailability of third-party services. [Review limits and exceptions with legal counsel.]",
        ],
      },
      {
        title: "8. Suspension and termination",
        paragraphs: [
          "We may suspend or terminate accounts that violate these Terms or the law, or in case of non-payment, with prior notice whenever possible.",
          "You may close your account at any time by emailing contato@mundodigitaltech.com.br. Some records are kept for the period required by law, such as the signatures' audit trail.",
        ],
      },
      {
        title: "9. Changes",
        paragraphs: [
          "We may update these Terms. Relevant changes will be communicated in advance by email or within the platform.",
        ],
      },
      {
        title: "10. Governing law",
        paragraphs: [
          "These Terms are governed by Brazilian law. The courts of [Brasília/DF] are elected, except where the law grants consumers the courts of their domicile.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy policy",
    metaDescription: "How MDSign processes personal data, under the Brazilian LGPD.",
    updated: "October 2026",
    intro:
      "This Policy explains how Mundo Digital Tech ([legal name], CNPJ [00.000.000/0000-00]) processes personal data in MDSign, under the Brazilian General Data Protection Law (Law 13.709/2018 — LGPD).",
    sections: [
      {
        title: "1. Roles in processing",
        paragraphs: [
          "For your account, sign-up and billing data, Mundo Digital Tech is the controller.",
          "For documents and signer data that your organization enters in MDSign, your organization is the controller and Mundo Digital Tech acts as processor, handling this data only to provide the service, according to the organization's instructions.",
        ],
      },
      {
        title: "2. Data we process",
        paragraphs: [
          "Account and profile: name, email, CPF, mobile phone (optional), language and password (stored encrypted by the authentication provider).",
          "Organization: name, CNPJ (optional), members, permissions, plan and usage.",
          "Documents and signers: uploaded files and the data of those who sign, approve or observe (name, email, CPF, mobile phone), plus each document's history.",
          "Signature evidence: date, time, IP address, authentication method and other audit-trail records generated by the signature engine.",
          "Billing: billing data (name, CPF or CNPJ, phone and billing address). Card data is entered directly with the payment partner; MDSign neither receives nor stores it.",
          "Sign-up origin and product usage: the campaign and page you came from (UTM parameters and landing page) and usage milestones (e.g., first document completed), without document content. Visits to the free sign-up page are counted with an anonymous session code, without cookies.",
          "Consents: acceptance of these terms and your choice about marketing communications.",
        ],
      },
      {
        title: "3. Why we use data",
        paragraphs: [
          "To provide the service (contract performance): create the account, generate, send and sign documents, send invitations and reminders, keep the audit trail.",
          "To comply with legal and regulatory obligations, such as keeping access logs and signature evidence.",
          "Billing and fraud prevention (legitimate interest and contract performance), including the per-person free plan limit.",
          "To improve the product and understand which channels bring users (legitimate interest), with minimal data and no document content.",
          "To send news and offers only if you consent. You may withdraw consent at any time without affecting your account.",
        ],
      },
      {
        title: "4. Who we share with",
        paragraphs: [
          "With providers needed for the service, who process data under our instructions: electronic signature engine (Lacuna Software — SignDoc), cloud infrastructure and database (Supabase), payment partner (Asaas), WhatsApp messaging when the organization enables that channel (BotConversa), and address lookup by postal code (ViaCEP, only the code entered). [Confirm the final provider list and hosting locations.]",
          "With authorities, when there is a legal obligation or court order.",
          "We do not sell personal data.",
        ],
      },
      {
        title: "5. International transfer",
        paragraphs: [
          "Some providers may store or process data outside Brazil. In such cases we adopt the safeguards provided by the LGPD, such as contractual clauses. [List countries and safeguards after contract review.]",
        ],
      },
      {
        title: "6. How long we keep data",
        paragraphs: [
          "Account data is kept while the account is active. Documents and audit trails are kept as long as needed for the service and legal obligations. Temporary files (such as parts of a bulk send and unsent drafts) are deleted automatically within a few days. [Define retention periods after account closure.]",
        ],
      },
      {
        title: "7. Security",
        paragraphs: [
          "We use encrypted connections, per-organization access control in the database, role-based permissions, audit logs and private file storage. No measure is infallible; in case of a relevant incident we will notify data subjects and the ANPD as required by law.",
        ],
      },
      {
        title: "8. Cookies and browser storage",
        paragraphs: [
          "MDSign uses only the storage needed to work, such as keeping you signed in and remembering your language and selected organization. Visit counting uses an anonymous code deleted when the tab is closed. If third-party analytics tools are enabled in the future, this Policy will be updated and, where required, we will ask for your consent.",
        ],
      },
      {
        title: "9. Your rights",
        paragraphs: [
          "You may request confirmation of processing, access, correction, anonymization, portability, deletion of data processed with consent, information about sharing and review of automated decisions, and you may withdraw consent.",
          "For an organization's documents, requests are forwarded to the responsible organization, which is the controller of that data.",
          "Contact the data protection officer (DPO): [DPO name], at [privacidade@mundodigitaltech.com.br]. You may also file a complaint with the Brazilian National Data Protection Authority (ANPD).",
        ],
      },
      {
        title: "10. Changes",
        paragraphs: [
          "We may update this Policy. The last update date is at the top of the page, and relevant changes will be communicated.",
        ],
      },
    ],
  },
};

const es: LegalCopy = {
  draftNotice:
    "Versión preliminar en revisión jurídica. El texto final puede cambiar; ante cualquier duda, escriba a contato@mundodigitaltech.com.br. Prevalece la versión en portugués.",
  updatedLabel: "Última actualización",
  terms: {
    title: "Términos de uso",
    metaDescription: "Términos de uso de la plataforma de firma electrónica MDSign.",
    updated: "Octubre de 2026",
    intro:
      "Estos Términos regulan el uso de MDSign, plataforma de firma electrónica de documentos ofrecida por Mundo Digital Tech ([razón social], CNPJ [00.000.000/0000-00]), con sede en SCS QD 01 Bl K Sala 1103, Asa Sul, Brasília/DF, Brasil. Al crear una cuenta o usar MDSign, usted declara que leyó y acepta estos Términos y la Política de privacidad.",
    sections: [
      {
        title: "1. Qué es MDSign",
        paragraphs: [
          "MDSign permite enviar documentos PDF a firma electrónica, firmar sus propios documentos, seguir cada etapa y usar plantillas, formularios públicos, envío masivo, procesos e integraciones, según el plan contratado.",
          "Las firmas las realiza un motor de firma especializado, que registra las evidencias de la firma (como fecha, hora, dirección IP y método de autenticación) en el registro de auditoría del documento, conforme a la Ley brasileña 14.063/2020 y la Medida Provisional 2.200-2/2001.",
        ],
      },
      {
        title: "2. Cuenta y responsabilidades",
        paragraphs: [
          "Para usar MDSign es necesario crear una cuenta con datos verdaderos y actualizados. El CPF (registro fiscal brasileño) se exige para identificar a quien firma, según el flujo brasileño de firma.",
          "Usted es responsable de mantener su contraseña en secreto y de todas las acciones realizadas con su cuenta. Avísenos de inmediato si sospecha de un uso indebido.",
          "Cada organización tiene un propietario, que gestiona los miembros, los permisos y el plan. Las acciones de los miembros dentro de la organización son responsabilidad de la organización.",
        ],
      },
      {
        title: "3. Uso permitido",
        paragraphs: [
          "Usted se compromete a usar MDSign solo con fines lícitos y a enviar solo documentos y datos de personas que tiene derecho a tratar.",
          "Está prohibido: falsificar identidades o firmas; enviar contenido ilícito, fraudulento o que viole derechos de terceros; intentar acceder a datos de otras organizaciones; sobrecargar, probar fallas o eludir los límites y controles de la plataforma; crear cuentas en serie para obtener beneficios gratuitos de forma indebida.",
        ],
      },
      {
        title: "4. Planes, plan gratuito y pagos",
        paragraphs: [
          "El plan gratuito Cedro ofrece hasta 5 documentos en total, por persona, sin tarjeta de crédito. Crear la cuenta no consume documentos.",
          "Los planes de pago (Jacarandá, Angico, Aroeira, Ipê y Mogno) tienen los precios, límites y recursos informados en la página de planes al momento de la contratación. El cobro es recurrente y lo procesa nuestro socio de pagos.",
          "Al alcanzar el límite del plan, las nuevas operaciones que consumen documentos quedan bloqueadas hasta el cambio de plan. La consulta y la descarga de los documentos existentes siguen disponibles.",
          "Puede cancelar en cualquier momento en Organización → Plan y cobro. El plan vale hasta el final del período pagado; después, la organización vuelve a Cedro. No hay reembolso proporcional, salvo cuando la ley lo exija. [Revisar reglas de desistimiento, reajuste e impago.]",
        ],
      },
      {
        title: "5. Documentos y contenido",
        paragraphs: [
          "Los documentos y los datos ingresados siguen siendo suyos. Usted nos autoriza a almacenarlos y procesarlos solo para prestar el servicio.",
          "Usted es responsable del contenido de los documentos, de la elección de los firmantes y de verificar que el tipo de firma elegido sea adecuado para su caso.",
        ],
      },
      {
        title: "6. Disponibilidad y soporte",
        paragraphs: [
          "Trabajamos para mantener MDSign disponible y seguro, pero pueden ocurrir interrupciones por mantenimiento o por fallas de terceros (como el motor de firma o los proveedores de nube o correo).",
          "El soporte se presta por los canales informados en el sitio. [Definir plazos de atención por plan, si los hay.]",
        ],
      },
      {
        title: "7. Limitación de responsabilidad",
        paragraphs: [
          "En la medida permitida por la ley, Mundo Digital Tech no responde por daños indirectos, lucro cesante ni pérdidas derivadas del uso indebido de la cuenta, del contenido enviado por el usuario o de la indisponibilidad de servicios de terceros. [Revisar límites y excepciones con el área jurídica.]",
        ],
      },
      {
        title: "8. Suspensión y cierre",
        paragraphs: [
          "Podemos suspender o cerrar cuentas que violen estos Términos o la ley, o en caso de impago, con aviso previo siempre que sea posible.",
          "Usted puede cerrar su cuenta en cualquier momento escribiendo a contato@mundodigitaltech.com.br. Algunos registros se conservan durante el plazo exigido por ley, como el registro de auditoría de las firmas.",
        ],
      },
      {
        title: "9. Cambios",
        paragraphs: [
          "Podemos actualizar estos Términos. Los cambios relevantes se comunicarán con antelación por correo electrónico o dentro de la plataforma.",
        ],
      },
      {
        title: "10. Ley y jurisdicción",
        paragraphs: [
          "Estos Términos se rigen por las leyes brasileñas. Se elige la jurisdicción de [Brasília/DF], salvo cuando la ley garantice al consumidor la de su domicilio.",
        ],
      },
    ],
  },
  privacy: {
    title: "Política de privacidad",
    metaDescription: "Cómo MDSign trata datos personales, conforme a la LGPD brasileña.",
    updated: "Octubre de 2026",
    intro:
      "Esta Política explica cómo Mundo Digital Tech ([razón social], CNPJ [00.000.000/0000-00]) trata datos personales en MDSign, conforme a la Ley General de Protección de Datos de Brasil (Ley 13.709/2018 — LGPD).",
    sections: [
      {
        title: "1. Roles en el tratamiento",
        paragraphs: [
          "Para los datos de su cuenta, registro y cobro, Mundo Digital Tech es la responsable (controladora).",
          "Para los documentos y los datos de firmantes que su organización ingresa en MDSign, su organización es la responsable y Mundo Digital Tech actúa como encargada, tratando esos datos solo para prestar el servicio, según las instrucciones de la organización.",
        ],
      },
      {
        title: "2. Datos que tratamos",
        paragraphs: [
          "Cuenta y perfil: nombre, correo, CPF, celular (opcional), idioma y contraseña (guardada cifrada por el proveedor de autenticación).",
          "Organización: nombre, CNPJ (opcional), miembros, permisos, plan y consumo.",
          "Documentos y firmantes: los archivos enviados y los datos de quienes firman, aprueban u observan (nombre, correo, CPF, celular), además del historial de cada documento.",
          "Evidencias de la firma: fecha, hora, dirección IP, método de autenticación y demás registros de auditoría, generados por el motor de firma.",
          "Cobro: datos de facturación (nombre, CPF o CNPJ, teléfono y dirección de cobro). Los datos de la tarjeta se ingresan directamente con el socio de pagos; MDSign no los recibe ni almacena.",
          "Origen del registro y uso del producto: la campaña y la página por la que llegó (parámetros UTM y página de origen) y los hitos de uso (por ejemplo, primer documento concluido), sin contenido de los documentos. Las visitas a la página de registro gratuito se cuentan con un código anónimo de sesión, sin cookies.",
          "Consentimientos: la aceptación de estos términos y su elección sobre comunicaciones de marketing.",
        ],
      },
      {
        title: "3. Para qué usamos los datos",
        paragraphs: [
          "Prestar el servicio (ejecución del contrato): crear la cuenta, generar, enviar y firmar documentos, enviar invitaciones y recordatorios, conservar el registro de auditoría.",
          "Cumplir obligaciones legales y regulatorias, como la conservación de registros de acceso y de evidencias de las firmas.",
          "Cobro y prevención de fraude (interés legítimo y ejecución del contrato), incluido el límite del plan gratuito por persona.",
          "Mejorar el producto y entender qué canales traen usuarios (interés legítimo), con datos mínimos y sin contenido de los documentos.",
          "Enviar novedades y ofertas solo si usted consiente. Puede retirar el consentimiento en cualquier momento sin afectar el uso de la cuenta.",
        ],
      },
      {
        title: "4. Con quién compartimos",
        paragraphs: [
          "Con proveedores necesarios para el servicio, que tratan los datos según nuestras instrucciones: motor de firma electrónica (Lacuna Software — SignDoc), infraestructura de nube y base de datos (Supabase), socio de pagos (Asaas), envío de mensajes de WhatsApp cuando la organización active ese canal (BotConversa) y consulta de dirección por código postal (ViaCEP, solo el código ingresado). [Confirmar la lista final de proveedores y los alojamientos.]",
          "Con autoridades, cuando exista obligación legal u orden judicial.",
          "No vendemos datos personales.",
        ],
      },
      {
        title: "5. Transferencia internacional",
        paragraphs: [
          "Algunos proveedores pueden almacenar o procesar datos fuera de Brasil. En esos casos adoptamos las salvaguardas previstas en la LGPD, como cláusulas contractuales. [Indicar países y salvaguardas tras revisar los contratos.]",
        ],
      },
      {
        title: "6. Por cuánto tiempo guardamos",
        paragraphs: [
          "Los datos de la cuenta se conservan mientras esté activa. Los documentos y registros de auditoría se conservan el tiempo necesario para el servicio y las obligaciones legales. Los archivos temporales (como partes de un envío masivo y borradores no enviados) se eliminan automáticamente en pocos días. [Definir plazos de conservación tras el cierre de la cuenta.]",
        ],
      },
      {
        title: "7. Seguridad",
        paragraphs: [
          "Usamos conexión cifrada, control de acceso por organización en la base de datos, permisos por rol, registros de auditoría y almacenamiento privado de archivos. Ninguna medida es infalible; ante un incidente relevante, comunicaremos a los titulares y a la ANPD según la ley.",
        ],
      },
      {
        title: "8. Cookies y almacenamiento en el navegador",
        paragraphs: [
          "MDSign usa solo el almacenamiento necesario para funcionar, como mantener su sesión iniciada y recordar el idioma y la organización elegida. El conteo de visitas usa un código anónimo que se borra al cerrar la pestaña. Si en el futuro se activan herramientas de análisis de terceros, esta Política se actualizará y, cuando sea necesario, pediremos su consentimiento.",
        ],
      },
      {
        title: "9. Sus derechos",
        paragraphs: [
          "Puede solicitar confirmación del tratamiento, acceso, corrección, anonimización, portabilidad, eliminación de los datos tratados con consentimiento, información sobre compartición y revisión de decisiones automatizadas, además de revocar consentimientos.",
          "Para los documentos de una organización, las solicitudes se remiten a la organización responsable, que es la controladora de esos datos.",
          "Contacte al encargado de protección de datos (DPO): [nombre del encargado], en [privacidade@mundodigitaltech.com.br]. También puede presentar una reclamación ante la Autoridad Nacional de Protección de Datos de Brasil (ANPD).",
        ],
      },
      {
        title: "10. Cambios",
        paragraphs: [
          "Podemos actualizar esta Política. La fecha de la última actualización figura al inicio de la página, y los cambios relevantes se comunicarán.",
        ],
      },
    ],
  },
};

export const legal: Record<Locale, LegalCopy> = { pt, en, es };
