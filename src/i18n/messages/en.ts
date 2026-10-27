import type { Messages } from "./pt";

/**
 * English. Editorial translation of pt.ts — plan names, the MDSign brand and
 * BRL prices stay unchanged (PRD section 27.4).
 */
const en: Messages = {
  meta: {
    title: "MDSign — Digital signatures for business",
    description:
      "Send, sign, manage and store your documents in a simple, secure and 100% digital way. Electronic signatures with evidence and legal validity.",
    slogan: "Go paperless, plant a tree!",
  },
  a11y: {
    skipToContent: "Skip to content",
    home: "MDSign — home page",
    mainNav: "Main",
    mobileNav: "Main (mobile)",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    language: "Language",
    mockup: "MDSign documents screen on a laptop and a phone, with sample documents",
  },
  nav: ["Product", "Solutions", "Plans", "Integrations", "Security", "Help"],
  cta: {
    free: "Start for free",
    plans: "See the plans",
    platform: "Explore the platform",
    subscribe: "Choose plan",
    specialist: "Talk to a specialist",
    api: "API documentation",
    login: "Sign in",
  },
  hero: {
    eyebrow: "Digital signatures for business",
    titleLine1: "Documents signed today.",
    titleLine2: "A more sustainable tomorrow.",
    text: "Send, sign, manage and store your documents in a simple, secure and 100% digital way. Less paper, more productivity and a future with more trees.",
  },
  trust: {
    label: "Highlights",
    items: [
      "Legally valid (MP 2.200-2 and Law 14.063)",
      "Electronic signatures with an evidence trail",
      "Access from any device",
      "LGPD compliant",
      "Real-time alerts",
    ],
  },
  platform: {
    eyebrow: "More agility for your day-to-day",
    title: "Sign, manage and track all your documents in one place.",
    text: "Create signature flows, assign who is responsible, follow the status of each document and connect it to your systems through our API.",
    features: [
      "Multiple signers",
      "Custom flows",
      "Document templates",
      "Folders and organization",
      "Reports and audit trail",
      "API integration",
    ],
    demo: {
      request: "Signature request",
      to: "To",
      message: "Message",
      messageText: "Please find the document attached for your signature. Thank you!",
      send: "Send document",
      signers: "Document signers",
      signed: "Signed",
      waiting: "Pending",
    },
  },
  how: {
    eyebrow: "How it works",
    title: "Signing shouldn't be hard work.",
    subtitle: "In just a few steps, your documents are signed and under control.",
    steps: [
      { title: "Send", text: "Upload the document and add everyone who needs to take part." },
      { title: "Set up", text: "Choose the signers, their order and how they authenticate." },
      { title: "Sign", text: "Each participant gets access to review and sign." },
      { title: "Track", text: "Follow the progress and get process updates in real time." },
    ],
  },
  integrations: {
    eyebrow: "Integrations",
    titleRest: "inside your system.",
    text: "Use MDSign as a platform or build electronic signatures into your own processes with our REST API.",
    capabilities: ["REST API", "Webhooks", "Document automation", "Event tracking"],
    exampleLabel: "API example",
    request: "Request",
    response: "Response",
    webhooksTitle: "Webhooks for event tracking",
    events: [
      "Document created",
      "Document signed",
      "Document approved",
      "Document refused",
      "Document completed",
      "Document canceled",
      "Document expired",
    ],
  },
  plans: {
    eyebrow: "Plans",
    title: "Choose the tree that grows with your business.",
    subtitle: "Start free and change plans whenever you need.",
    listLabel: "MDSign plans",
    swipeHint: "Swipe to see all plans →",
    perMonth: "/month",
    storageNote: "Document storage follows the rules of each plan.",
    photoOf: "Photo of the tree",
    items: {
      cedro: {
        audience: "Try it for free",
        priceLabel: "Free",
        priceNote: "",
        features: [
          "5 free documents (one time)",
          "1 user",
          "Sign and send for signature",
          "Approval and signing in order",
        ],
      },
      jacaranda: {
        audience: "For professionals",
        priceLabel: "",
        priceNote: "",
        features: [
          "50 documents per month",
          "1 user",
          "Reusable templates",
          "Multi-step approvals",
        ],
      },
      ipe: {
        audience: "For companies and teams",
        priceLabel: "",
        priceNote: "",
        features: [
          "Unlimited documents",
          "Up to 4 users",
          "Work as a team with permissions",
          "Management reports",
        ],
      },
      mogno: {
        audience: "For corporate operations",
        priceLabel: "Corporate",
        priceNote: "Contact us",
        features: [
          "Users and documents under contract",
          "Integrate your systems (API and Webhooks)",
          "Bulk sending and advanced reports",
          "Dedicated support",
        ],
      },
    },
    featured: "For companies",
    compare: {
      toggle: "Compare all features",
      hide: "Hide comparison",
      caption: "Features in each plan",
      feature: "Feature",
      yes: "Included",
      no: "Not included",
      soon: "Coming soon",
      basic: "Basic",
      advanced: "Advanced",
      contract: "Under contract",
      rows: {
        esign: "Electronic signature",
        history: "History and evidence",
        order: "Signing in order",
        approval: "Approval without signing",
        returnFix: "Return for correction",
        reject: "Final rejection",
        templates: "Reusable templates",
        certificate: "Digital certificate signature",
        multiApproval: "Multi-step approval",
        team: "Multiple users and permissions",
        reports: "Reports",
        bulk: "Bulk sending",
        api: "API and Webhooks",
        support: "Dedicated support",
      },
    },
  },
  sustainability: {
    title: "Go paperless, plant a tree!",
    text: "Every digitally signed document is a step toward a more sustainable future.",
    items: [
      { title: "Less paper", text: "More trees" },
      { title: "Digital processes", text: "More efficiency" },
      { title: "A more", text: "sustainable future" },
    ],
  },
  testimonials: {
    eyebrow: "What our customers say",
    title: "Companies that trust us and grow with us.",
    items: [
      {
        role: "Administrative Director",
        quote:
          "MDSign made our contract routine faster. We got rid of paper, saved time and gained much more security in the process.",
      },
      {
        role: "Executive Director",
        quote:
          "The platform is simple and intuitive. Our suppliers sign from anywhere, and real-time tracking has made our management much easier.",
      },
    ],
  },
  security: {
    eyebrow: "Security and legal validity",
    title: "Legally valid signatures and a traceable process.",
    subtitle:
      "Choose the right type of signature for each document and keep a record of every step.",
    items: [
      {
        title: "Legal validity",
        text: "Electronic signatures are legally valid in Brazil under Provisional Measure 2.200-2/2001 and Law 14.063/2020, at the simple, advanced and qualified levels.",
      },
      {
        title: "ICP-Brasil digital certificate (coming soon)",
        text: "Signing with an ICP-Brasil certificate (e-CPF and e-CNPJ) is under certification and not available yet.",
      },
      {
        title: "Electronic or certificate-based",
        text: "With an electronic signature, the signer is identified by the authentication factors of the process. Digital certificate signatures are coming soon, after certification.",
      },
      {
        title: "Signer authentication",
        text: "When sending, choose how each participant confirms their identity: email, SMS, WhatsApp, authenticator app or selfie, among other available factors.",
      },
      {
        title: "Traceability",
        text: "Every step is recorded: creation, signature, approval, refusal, cancellation and completion, with the details of each signature.",
      },
      {
        title: "Document validation",
        text: "Anyone can check a document's signatures using its verification code or by uploading the signed file.",
      },
      {
        title: "LGPD",
        text: "Personal data is processed in compliance with Brazil's General Data Protection Law (LGPD).",
      },
    ],
  },
  faq: {
    eyebrow: "Frequently asked questions",
    title: "Still have questions?",
    subtitle: "Here are the most common questions. If you prefer, talk to our team.",
    items: [
      {
        q: "Is an electronic signature legally valid?",
        a: "Yes. Brazilian Provisional Measure 2.200-2/2001 and Law 14.063/2020 recognize electronic signatures as valid proof of a document's authorship and integrity. Qualified (ICP-Brasil) signatures are still under certification in MDSign.",
      },
      {
        q: "Does the signer need to create an account?",
        a: "No. Each participant receives an email link to review and sign the document, with no plan to purchase and nothing to install. Reminders can be sent to anyone who hasn't signed yet.",
      },
      {
        q: "Can I sign with a digital certificate?",
        a: "Not yet. ICP-Brasil certificate signatures (e-CPF and e-CNPJ) are under certification and shown as \"Coming soon\" in the plans. Today MDSign offers electronic signatures with evidence.",
      },
      {
        q: "Can I have several users in my company?",
        a: "Yes. The number of users depends on the plan: 1 on Cedro and Jacarandá and up to 4 on Ipê. On Mogno, the number is defined by contract.",
      },
      {
        q: "Can I see who has already signed?",
        a: "Yes. You see the status of each participant, know who has signed and who is still pending, and get process updates in real time.",
      },
      {
        q: "Can I set the signing order?",
        a: "Yes. You define the order of signers and approvers. Each participant receives the document in turn, and the flow moves on automatically until it is completed.",
      },
      {
        q: "Can I integrate MDSign with my system?",
        a: "Yes. With the REST API you send documents, define the signature flow and download the signed files. With webhooks, your system is notified when a document is signed, refused, completed or expires.",
      },
      {
        q: "How does document storage work?",
        a: "Documents are stored in MDSign and can be organized into folders. Storage follows the rules of each plan. Talk to a specialist to learn the conditions of the plan you intend to choose.",
      },
      {
        q: "What is the difference between the plans?",
        a: "Plans differ in the number of documents, the number of users and the features. Cedro is free (5 documents), Jacarandá has 50 documents per month and Ipê has unlimited documents for teams. Mogno serves corporate operations, with API, integrations and contract terms.",
      },
      {
        q: "How does the free Cedro plan work?",
        a: "Cedro is free and includes 5 documents in total (they are not renewed every month), 1 user, electronic signature and email support. When you need more, simply choose a paid plan.",
      },
    ],
  },
  finalCta: {
    title: "Less paper. More agility for your business.",
    text: "Send your first document and get to know MDSign.",
  },
  footer: {
    solutionBy: "MDSign is a Mundo Digital Tech solution.",
    productTitle: "Product",
    product: ["Features", "Security", "Plans", "Integrations", "API"],
    companyTitle: "Company",
    company: ["About us", "Blog", "Contact", "Support"],
    terms: "Terms of use",
    privacy: "Privacy policy",
    cookies: "Cookie preferences",
    dataRights: "Your data (LGPD)",
    validate: "Validate a document",
    rights: "All rights reserved.",
  },
  lead: {
    specialistTitle: "Talk to a specialist",
    planTitle: "{plan} plan",
    description:
      "Leave your details and the MDSign team will contact you to activate your account or answer your questions.",
    name: "Name",
    email: "Email",
    phone: "Phone / WhatsApp",
    company: "Company",
    plan: "Plan of interest",
    planUnknown: "Not sure yet",
    message: "Message",
    privacy:
      "We will only use your data to reply to this request, in accordance with Brazil's LGPD.",
    send: "Send",
    error: "We couldn't send it right now. Please try again or email {email}.",
    successTitle: "We've received your message!",
    successText: "Our team will be in touch soon. If you prefer, email {email}.",
    close: "Close",
  },
  developers: {
    metaTitle: "Developers — MDSign API",
    metaDescription:
      "Build MDSign electronic signatures into your systems with a REST API and webhooks.",
    eyebrow: "Developers",
    title: "MDSign REST API and webhooks",
    intro:
      "Build electronic signatures into your own processes. The API is REST, accepts and returns JSON and is authenticated with an application key sent in the {header} header.",
    keyWarning:
      "Keep the key on your server. Never put it in code that runs in the browser or in mobile apps.",
    resources: [
      {
        title: "Documents",
        text: "Create one or many documents, check their status, download signed versions, cancel them or move them to folders.",
      },
      {
        title: "Signature flows",
        text: "Define signers and approvers, the order of each step and the authentication methods. Save flows to reuse them.",
      },
      {
        title: "Uploads",
        text: "Upload the file (multipart or Base64) and use the returned ID to create the document.",
      },
      {
        title: "Folders and organization",
        text: "Create folders, organize documents in bulk and manage your organization's users.",
      },
      {
        title: "Validation",
        text: "Validate a document's signatures using its verification code or by uploading the signed file.",
      },
      {
        title: "Notifications",
        text: "Send reminders to participants who still have pending actions.",
      },
    ],
    webhooksTitle: "Webhooks",
    webhooksText:
      "Instead of polling the API, register a URL and receive a notification (POST) for each event:",
  },
  login: {
    metaTitle: "Sign in — MDSign",
    eyebrow: "Access",
    title: "The new MDSign customer area is coming soon",
    text: "Soon you'll be able to access your account here. If you're already a customer and need help, contact our team at {email}.",
  },
};

export default en;
