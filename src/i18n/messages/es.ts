import type { Messages } from "./pt";

/**
 * Español. Traducción editorial de pt.ts — los nombres de los planes, la marca
 * MDSign y los precios en BRL no cambian (PRD sección 27.4).
 */
const es: Messages = {
  meta: {
    title: "MDSign — Firma digital para empresas",
    description:
      "Envía, firma, gestiona y almacena tus documentos de forma simple, segura y 100% digital. Firma electrónica con evidencias y validez jurídica.",
    slogan: "¡No uses papel, planta un árbol!",
  },
  a11y: {
    skipToContent: "Ir al contenido",
    home: "MDSign — página de inicio",
    mainNav: "Principal",
    mobileNav: "Principal (móvil)",
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
    language: "Idioma",
    mockup:
      "Pantalla de documentos de MDSign en el portátil y en el móvil, con documentos de ejemplo",
  },
  nav: ["Producto", "Soluciones", "Planes", "Integraciones", "Seguridad", "Ayuda"],
  cta: {
    free: "Empieza gratis",
    plans: "Conoce los planes",
    platform: "Conoce la plataforma",
    subscribe: "Contratar plan",
    specialist: "Habla con un especialista",
    api: "Documentación de la API",
    login: "Iniciar sesión",
  },
  hero: {
    eyebrow: "Firma digital para empresas",
    titleLine1: "Documentos firmados hoy.",
    titleLine2: "Un mañana más sostenible.",
    text: "Envía, firma, gestiona y almacena tus documentos de forma simple, segura y 100% digital. Menos papel, más productividad y un futuro con más árboles.",
  },
  trust: {
    label: "Ventajas",
    items: [
      "Validez jurídica (MP 2.200-2 y Ley 14.063)",
      "Firma electrónica con registro de evidencias",
      "Accede desde cualquier dispositivo",
      "Cumplimiento de la LGPD",
      "Alertas en tiempo real",
    ],
  },
  platform: {
    eyebrow: "Más agilidad en tu día a día",
    title: "Firma, gestiona y sigue todos tus documentos en un solo lugar.",
    text: "Crea flujos de firma, define responsables, sigue el estado de cada documento e intégralo con tus sistemas mediante nuestra API.",
    features: [
      "Múltiples firmantes",
      "Flujos personalizados",
      "Plantillas de documentos",
      "Carpetas y organización",
      "Informes y auditoría",
      "Integración vía API",
    ],
    demo: {
      request: "Solicitud de firma",
      to: "Para",
      message: "Mensaje",
      messageText: "Te envío el documento para tu firma. ¡Gracias!",
      send: "Enviar documento",
      signers: "Firmantes del documento",
      signed: "Firmado",
      waiting: "Pendiente",
    },
  },
  how: {
    eyebrow: "Cómo funciona",
    title: "Firmar no debería ser complicado.",
    subtitle: "En pocos pasos, tus documentos firmados y bajo control.",
    steps: [
      { title: "Envía", text: "Sube el documento e indica quién debe participar." },
      { title: "Configura", text: "Define los firmantes, el orden y la forma de autenticación." },
      { title: "Firma", text: "Cada participante recibe el acceso para revisar y firmar." },
      {
        title: "Sigue",
        text: "Consulta el avance y recibe las actualizaciones del proceso en tiempo real.",
      },
    ],
  },
  integrations: {
    eyebrow: "Integraciones",
    titleRest: "dentro de tu sistema.",
    text: "Usa MDSign como plataforma o integra la firma electrónica en tus propios procesos con nuestra API REST.",
    capabilities: [
      "API REST",
      "Webhooks",
      "Automatización de documentos",
      "Seguimiento de eventos",
    ],
    exampleLabel: "Ejemplo de la API",
    request: "Solicitud",
    response: "Respuesta",
    webhooksTitle: "Webhooks para el seguimiento de eventos",
    events: [
      "Documento creado",
      "Documento firmado",
      "Documento aprobado",
      "Documento rechazado",
      "Documento concluido",
      "Documento cancelado",
      "Documento vencido",
    ],
  },
  plans: {
    eyebrow: "Planes",
    title: "Elige el árbol que acompaña el crecimiento de tu empresa.",
    subtitle: "Empiece gratis y cambie de plan cuando lo necesite.",
    listLabel: "Planes MDSign",
    swipeHint: "Desliza para ver todos los planes →",
    perMonth: "/mes",
    storageNote: "El almacenamiento de los documentos sigue las reglas de cada plan.",
    photoOf: "Foto del árbol",
    items: {
      cedro: {
        audience: "Pruébelo gratis",
        priceLabel: "Gratis",
        priceNote: "",
        features: [
          "5 documentos gratis (una única vez)",
          "1 usuario",
          "Firme y envíe para firma",
          "Aprobación y firma en orden",
        ],
      },
      jacaranda: {
        audience: "Para profesionales",
        priceLabel: "",
        priceNote: "",
        features: [
          "50 documentos por mes",
          "1 usuario",
          "Plantillas reutilizables",
          "Aprobaciones en varias etapas",
        ],
      },
      ipe: {
        audience: "Para empresas y equipos",
        priceLabel: "",
        priceNote: "",
        features: [
          "Documentos ilimitados",
          "Hasta 4 usuarios",
          "Trabaje en equipo con permisos",
          "Informes de gestión",
        ],
      },
      mogno: {
        audience: "Para operaciones corporativas",
        priceLabel: "Corporativo",
        priceNote: "Bajo consulta",
        features: [
          "Usuarios y documentos según contrato",
          "Integre sus sistemas (API y Webhooks)",
          "Envío masivo e informes avanzados",
          "Soporte personalizado",
        ],
      },
    },
    featured: "Para empresas",
    compare: {
      toggle: "Comparar todas las funciones",
      hide: "Ocultar comparación",
      caption: "Funciones de cada plan",
      feature: "Función",
      yes: "Incluido",
      no: "No incluido",
      soon: "Próximamente",
      basic: "Básicos",
      advanced: "Avanzados",
      contract: "Según contrato",
      rows: {
        esign: "Firma electrónica",
        history: "Historial y evidencias",
        order: "Firma en orden",
        approval: "Aprobación sin firma",
        returnFix: "Devolución para corrección",
        reject: "Rechazo definitivo",
        templates: "Plantillas reutilizables",
        certificate: "Firma con certificado digital",
        multiApproval: "Aprobación en varias etapas",
        team: "Varios usuarios y permisos",
        reports: "Informes",
        bulk: "Envío masivo",
        api: "API y Webhooks",
        support: "Soporte personalizado",
      },
    },
  },
  sustainability: {
    title: "¡No uses papel, planta un árbol!",
    text: "Cada documento firmado digitalmente es un paso hacia un futuro más sostenible.",
    items: [
      { title: "Menos papel", text: "Más árboles" },
      { title: "Procesos digitales", text: "Más eficiencia" },
      { title: "Un futuro", text: "más sostenible" },
    ],
  },
  testimonials: {
    eyebrow: "Lo que dicen nuestros clientes",
    title: "Empresas que confían y crecen con nosotros.",
    items: [
      {
        role: "Directora Administrativa",
        quote:
          "MDSign aportó más agilidad a nuestra rutina de contratos. Eliminamos el papel, ganamos tiempo y mucha más seguridad en el proceso.",
      },
      {
        role: "Directora Ejecutiva",
        quote:
          "La plataforma es simple e intuitiva. Nuestros proveedores firman desde cualquier lugar y el seguimiento en tiempo real facilitó mucho nuestra gestión.",
      },
    ],
  },
  security: {
    eyebrow: "Seguridad y validez",
    title: "Firmas con validez jurídica y un proceso trazable.",
    subtitle:
      "Elige el tipo de firma adecuado para cada documento y conserva el registro de cada etapa.",
    items: [
      {
        title: "Validez jurídica",
        text: "La firma electrónica tiene validez jurídica en Brasil, según la Medida Provisional 2.200-2/2001 y la Ley 14.063/2020, en los niveles simple, avanzado y cualificado.",
      },
      {
        title: "Certificado digital ICP-Brasil (próximamente)",
        text: "La firma con certificado ICP-Brasil (e-CPF y e-CNPJ) está en homologación y aún no está disponible.",
      },
      {
        title: "Electrónica o con certificado",
        text: "En la firma electrónica, el firmante se identifica mediante los factores de autenticación del proceso. La firma con certificado digital llegará pronto, tras la homologación.",
      },
      {
        title: "Autenticación del firmante",
        text: "Al enviar, define cómo cada participante confirma su identidad: correo electrónico, SMS, WhatsApp, aplicación de autenticación o selfie, entre otros factores disponibles.",
      },
      {
        title: "Trazabilidad",
        text: "Cada etapa queda registrada: creación, firma, aprobación, rechazo, cancelación y conclusión, con los detalles de cada firma.",
      },
      {
        title: "Validación del documento",
        text: "Cualquier persona puede verificar las firmas de un documento con su código de verificación o subiendo el archivo firmado.",
      },
      {
        title: "LGPD",
        text: "Tratamiento de datos personales conforme a la Ley General de Protección de Datos de Brasil (LGPD).",
      },
    ],
  },
  faq: {
    eyebrow: "Preguntas frecuentes",
    title: "¿Todavía tienes dudas?",
    subtitle:
      "Reunimos las preguntas más comunes para ayudarte. Si lo prefieres, habla con nuestro equipo.",
    items: [
      {
        q: "¿La firma electrónica tiene validez jurídica?",
        a: "Sí. La Medida Provisional 2.200-2/2001 y la Ley 14.063/2020 de Brasil reconocen la firma electrónica como válida para acreditar la autoría y la integridad de los documentos. La firma cualificada (ICP-Brasil) aún está en homologación en MDSign.",
      },
      {
        q: "¿El firmante necesita crear una cuenta?",
        a: "No. Cada participante recibe por correo electrónico el enlace para revisar y firmar el documento, sin contratar un plan ni instalar nada. Se pueden enviar recordatorios a quien aún no haya firmado.",
      },
      {
        q: "¿Puedo firmar con certificado digital?",
        a: "Todavía no. La firma con certificado ICP-Brasil (e-CPF y e-CNPJ) está en homologación y aparece como \"Próximamente\" en los planes. Hoy MDSign ofrece firma electrónica con evidencias.",
      },
      {
        q: "¿Puedo tener varios usuarios en la empresa?",
        a: "Sí. El número de usuarios depende del plan: 1 en Cedro y Jacarandá y hasta 4 en Ipê. En Mogno, la cantidad se define por contrato.",
      },
      {
        q: "¿Puedo ver quién ya firmó?",
        a: "Sí. Ves el estado de cada participante, sabes quién ya firmó y quién está pendiente, y recibes las actualizaciones del proceso en tiempo real.",
      },
      {
        q: "¿Puedo definir el orden de las firmas?",
        a: "Sí. Defines el orden de los firmantes y aprobadores. Cada participante recibe el documento en su turno y el flujo avanza automáticamente hasta concluir.",
      },
      {
        q: "¿Puedo integrar MDSign con mi sistema?",
        a: "Sí. Con la API REST envías documentos, defines el flujo de firma y descargas los archivos firmados. Con los webhooks, tu sistema recibe un aviso cuando un documento se firma, se rechaza, se concluye o vence.",
      },
      {
        q: "¿Cómo funciona el almacenamiento de los documentos?",
        a: "Los documentos se guardan en MDSign y pueden organizarse en carpetas. El almacenamiento sigue las reglas de cada plan. Habla con un especialista para conocer las condiciones del plan que quieres contratar.",
      },
      {
        q: "¿Cuál es la diferencia entre los planes?",
        a: "Los planes varían en la cantidad de documentos, el número de usuarios y las funciones. Cedro es gratis (5 documentos), Jacarandá tiene 50 documentos por mes e Ipê tiene documentos ilimitados para equipos. Mogno atiende operaciones corporativas, con API, integraciones y condiciones según contrato.",
      },
      {
        q: "¿Cómo funciona el plan gratuito Cedro?",
        a: "Cedro es gratuito e incluye 5 documentos en total (no se renuevan cada mes), 1 usuario, firma electrónica y soporte por correo electrónico. Cuando necesites más, solo tienes que elegir un plan de pago.",
      },
    ],
  },
  finalCta: {
    title: "Menos papel. Más agilidad para tu negocio.",
    text: "Envía tu primer documento y conoce MDSign.",
  },
  footer: {
    solutionBy: "MDSign es una solución de Mundo Digital Tech.",
    productTitle: "Producto",
    product: ["Funcionalidades", "Seguridad", "Planes", "Integraciones", "API"],
    companyTitle: "Empresa",
    company: ["Quiénes somos", "Blog", "Contacto", "Soporte"],
    terms: "Términos de uso",
    privacy: "Política de privacidad",
    cookies: "Preferencias de cookies",
    dataRights: "Sus datos (LGPD)",
    validate: "Validar documento",
    rights: "Todos los derechos reservados.",
  },
  lead: {
    specialistTitle: "Habla con un especialista",
    planTitle: "Plan {plan}",
    description:
      "Déjanos tus datos y el equipo de MDSign se pondrá en contacto para activar tu cuenta o resolver tus dudas.",
    name: "Nombre",
    email: "Correo electrónico",
    phone: "Teléfono / WhatsApp",
    company: "Empresa",
    plan: "Plan de interés",
    planUnknown: "Todavía no lo sé",
    message: "Mensaje",
    privacy:
      "Usaremos tus datos solo para responder a este contacto, conforme a la LGPD de Brasil.",
    send: "Enviar",
    error: "No pudimos enviarlo ahora. Inténtalo de nuevo o escribe a {email}.",
    successTitle: "¡Recibimos tu mensaje!",
    successText: "Nuestro equipo se pondrá en contacto pronto. Si lo prefieres, escribe a {email}.",
    close: "Cerrar",
  },
  developers: {
    metaTitle: "Desarrolladores — API de MDSign",
    metaDescription:
      "Integra la firma electrónica de MDSign en tus sistemas con una API REST y webhooks.",
    eyebrow: "Desarrolladores",
    title: "API REST y webhooks de MDSign",
    intro:
      "Integra la firma electrónica en tus propios procesos. La API es REST, recibe y devuelve JSON y se autentica con una clave de aplicación enviada en el encabezado {header}.",
    keyWarning:
      "La clave debe quedarse en tu servidor. Nunca la incluyas en código que se ejecute en el navegador o en aplicaciones móviles.",
    resources: [
      {
        title: "Documentos",
        text: "Crea uno o varios documentos, consulta su estado, descarga las versiones firmadas, cancélalos o muévelos a carpetas.",
      },
      {
        title: "Flujos de firma",
        text: "Define firmantes y aprobadores, el orden de cada etapa y las formas de autenticación. Guarda flujos para reutilizarlos.",
      },
      {
        title: "Cargas",
        text: "Sube el archivo (multipart o Base64) y usa el identificador devuelto para crear el documento.",
      },
      {
        title: "Carpetas y organización",
        text: "Crea carpetas, organiza documentos en lote y gestiona los usuarios de la organización.",
      },
      {
        title: "Validación",
        text: "Valida las firmas de un documento con su código de verificación o subiendo el archivo firmado.",
      },
      {
        title: "Notificaciones",
        text: "Envía recordatorios a los participantes que aún tienen acciones pendientes.",
      },
    ],
    webhooksTitle: "Webhooks",
    webhooksText:
      "En lugar de consultar la API repetidamente, registra una URL y recibe un aviso (POST) en cada evento:",
  },
  login: {
    metaTitle: "Iniciar sesión — MDSign",
    eyebrow: "Acceso",
    title: "La nueva área de clientes de MDSign está por llegar",
    text: "Pronto podrás acceder a tu cuenta desde aquí. Si ya eres cliente y necesitas ayuda, escribe a nuestro equipo a {email}.",
  },
};

export default es;
