// Testes da lógica do servidor (Deno), sem rede e sem banco: participantes, quórum, opções de
// envio, bloqueio de PDF, máscara de dados pessoais, assinatura de webhooks, e-mail próprio e
// documento excluído no motor. Rodam no CI (job "servidor").
//
// Localmente, NUNCA na raiz do repositório (o Deno mexe no node_modules): copie a pasta
// supabase para um diretório temporário e rode lá:
//   cp -R supabase /tmp/mdsign-deno && cd /tmp/mdsign-deno && \
//   SUPABASE_URL=http://127.0.0.1:9 SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_ANON_KEY=x \
//   npx -y deno test -A tests/
import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { PDFDocument, PDFName, PDFString } from "npm:pdf-lib@1.17.1";
import { AppError } from "../functions/_shared/http.ts";
import {
  availableAuthLevels,
  brPhoneVariants,
  cleanParticipants,
  isValidCpf,
  normalizePhone,
  toFlowActions,
  reservedEmailDomain,
} from "../functions/_shared/participants.ts";
import {
  cleanExpiration,
  cleanReminders,
  cleanMessage,
  cleanLocale,
} from "../functions/_shared/options.ts";
import { assertSafePdf, findActiveContent } from "../functions/_shared/pdf.ts";
import { maskPersonal, safeEqual } from "../functions/_shared/net.ts";
import { signPayload, newSecret } from "../functions/_shared/webhooks.ts";
import { signatureEmail } from "../functions/_shared/email.ts";
import { isDeletedInEngine } from "../functions/_shared/documents.ts";
import {
  attachmentType,
  MAX_ATTACHMENT_BYTES,
  readAttachments,
} from "../functions/_shared/create.ts";
import { cleanKey, looksLikePdf, publicSigners } from "../functions/_shared/validation.ts";
import { recentWhatsApp, WHATSAPP_REPEAT_MINUTES } from "../functions/_shared/notifications.ts";

const CPF = "529.982.247-25";
const CPF2 = "111.444.777-35";
const CPF3 = "935.411.347-80";
const p = (o: Record<string, unknown> = {}) => ({
  name: "Ana Souza",
  email: "ana@empresa.com.br",
  cpf: CPF,
  ...o,
});
const code = (fn: () => unknown) => {
  try {
    fn();
    return "ok";
  } catch (e) {
    return e instanceof AppError ? `${e.code}:${JSON.stringify(e.details)}` : String(e);
  }
};

Deno.test("CPF, telefone e domínios reservados", () => {
  assert(isValidCpf(CPF));
  assert(!isValidCpf("111.111.111-11"));
  assert(!isValidCpf("123"));
  assertEquals(normalizePhone("(61) 99167-0611"), "+55 61 99167-0611");
  assertEquals(normalizePhone("061991670611"), "+55 61 99167-0611");
  assertEquals(normalizePhone("123"), null);
  assert(reservedEmailDomain("x@example.com"));
  assert(!reservedEmailDomain("x@empresa.com.br"));
});

Deno.test("participantes: obrigatórios, limite, duplicado, CPF inválido", () => {
  assert(code(() => cleanParticipants([], true)).startsWith("participants_required"));
  assert(
    code(() =>
      cleanParticipants(
        Array.from({ length: 31 }, (_, i) => p({ email: `a${i}@x.com.br` })),
        true,
      ),
    ).startsWith("too_many_participants"),
  );
  const r = code(() => cleanParticipants([p(), p()], true));
  assert(r.includes("duplicate"), r);
  assert(code(() => cleanParticipants([p({ cpf: "111.111.111-11" })], true)).includes("cpf"));
  assert(
    code(() => cleanParticipants([p({ email: "x@example.com" })], true)).includes("email_domain"),
  );
});

Deno.test("participantes: etapas em ordem e em paralelo", () => {
  const list = [p(), p({ email: "b@x.com.br", cpf: CPF2 }), p({ email: "c@x.com.br", cpf: CPF3 })];
  assertEquals(
    cleanParticipants(list, true).map((x) => x.step),
    [1, 2, 3],
  );
  assertEquals(
    cleanParticipants(list, false).map((x) => x.step),
    [1, 1, 1],
  );
});

Deno.test("quórum: grupo válido vira uma etapa e uma regra no motor", () => {
  const rule = { key: "g1", name: "Jurídico", required: 2 };
  const list = [
    p({ rule }),
    p({ email: "b@x.com.br", cpf: CPF2, rule }),
    p({ email: "c@x.com.br", cpf: CPF3, rule }),
    p({ email: "d@x.com.br", cpf: "153.509.460-56" }),
  ];
  const clean = cleanParticipants(list, true);
  assertEquals(
    clean.map((x) => x.step),
    [1, 1, 1, 2],
  );
  const { actions, actionOf } = toFlowActions(clean, "pt");
  assertEquals(actions.length, 2);
  assertEquals(actions[0]!["type"], "SignRule");
  assertEquals(actions[0]!["numberRequiredActions"], 2);
  assertEquals((actions[0]!["ruleUsers"] as unknown[]).length, 3);
  assertEquals(actionOf, [0, 0, 0, 1]);
});

Deno.test("quórum: regras inválidas são recusadas", () => {
  const r = (o: Record<string, unknown>) => ({ key: "g", name: "G", required: 2, ...o });
  // exigido maior que o grupo
  assert(
    code(() =>
      cleanParticipants(
        [
          p({ rule: r({ required: 3 }) }),
          p({ email: "b@x.com.br", cpf: CPF2, rule: r({ required: 3 }) }),
        ],
        true,
      ),
    ).includes("rule"),
  );
  // grupo de 1
  assert(code(() => cleanParticipants([p({ rule: r({ required: 1 }) })], true)).includes("rule"));
  // testemunha
  assert(
    code(() =>
      cleanParticipants(
        [
          p({ role: "witness", rule: r({}) }),
          p({ role: "witness", email: "b@x.com.br", cpf: CPF2, rule: r({}) }),
        ],
        true,
      ),
    ).includes("rule"),
  );
  // não contíguo
  assert(
    code(() =>
      cleanParticipants(
        [
          p({ rule: r({}) }),
          p({ email: "x@x.com.br", cpf: CPF3 }),
          p({ email: "b@x.com.br", cpf: CPF2, rule: r({}) }),
        ],
        true,
      ),
    ).includes("rule"),
  );
  // papéis diferentes
  assert(
    code(() =>
      cleanParticipants(
        [p({ rule: r({}) }), p({ role: "approver", email: "b@x.com.br", cpf: CPF2, rule: r({}) })],
        true,
      ),
    ).includes("rule"),
  );
});

Deno.test("opções de envio: prazo no passado, lembretes e mensagem", () => {
  assertThrows(() => cleanExpiration("2020-01-01"), AppError);
  assertEquals(cleanExpiration(null), null);
  assertEquals(cleanReminders({ enabled: true, firstDays: 0, everyDays: 99, max: 50 }), {
    enabled: true,
    firstDays: 1,
    everyDays: 30,
    max: 10,
  });
  assertEquals(cleanMessage("x".repeat(3000))!.length, 2000);
  assertEquals(cleanLocale("de", "pt"), "pt");
});

async function pdfWith(mut?: (d: PDFDocument) => void) {
  const d = await PDFDocument.create();
  d.addPage();
  mut?.(d);
  return await d.save();
}

Deno.test("PDF: limpo passa; com JavaScript ou anexo é bloqueado", async () => {
  await assertSafePdf(await pdfWith());
  const js = await pdfWith((d) => {
    const action = d.context.obj({
      Type: "Action",
      S: "JavaScript",
      JS: PDFString.of("app.alert(1)"),
    });
    d.catalog.set(PDFName.of("OpenAction"), d.context.register(action));
  });
  const err = await assertRejects(() => assertSafePdf(js), AppError);
  assertEquals((err as AppError).code, "pdf_active_content");
  const att = await pdfWith(async (d) => {
    await d.attach(new Uint8Array([1, 2, 3]), "x.txt", { mimeType: "text/plain" });
  });
  const doc = await PDFDocument.load(att);
  assert(findActiveContent(doc).includes("attachment"));
  await assertRejects(() => assertSafePdf(new Uint8Array([1, 2, 3])), AppError, "pdf_unreadable");
});

Deno.test("logs sem dados pessoais e comparação de segredo", () => {
  const m = maskPersonal(
    "CPF 529.982.247-25, e-mail ana@x.com.br, cel (61) 99999-1234, CNPJ 32.650.036/0001-07",
  );
  assert(
    !/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(m) &&
      !m.includes("@") &&
      !m.includes("99999") &&
      !m.includes("0001"),
    m,
  );
  assert(safeEqual("abc", "abc"));
  assert(!safeEqual("abc", "abd"));
  assert(!safeEqual("", ""));
});

Deno.test("webhooks de saída: assinatura HMAC muda com o corpo e o segredo", async () => {
  const s = newSecret();
  assert(s.startsWith("whsec_") && s.length === 70);
  const a = await signPayload(s, 1, "{}");
  const b = await signPayload(s, 1, '{"x":1}');
  const c = await signPayload(newSecret(), 1, "{}");
  assertEquals(a.length, 64);
  assert(a !== b && a !== c);
  assertEquals(a, await signPayload(s, 1, "{}"));
});

Deno.test("e-mail próprio: escape de HTML e remetente", () => {
  const m = signatureEmail({
    kind: "signature_requested",
    locale: "pt",
    role: "signer",
    name: "Ana",
    senderName: "",
    orgName: "<b>Org</b>",
    docName: "Doc",
    message: "<img src=x onerror=1>",
    link: "https://x/s/abc",
  });
  assert(!m.html.includes("<img") && !m.html.includes("<b>Org</b>"));
  assert(m.subject.startsWith("<b>Org</b> enviou")); // assunto é texto puro
});

Deno.test("documento excluído no motor é reconhecido", () => {
  assert(isDeletedInEngine(new AppError("engine_rejected", 422, { code: "DocumentIsDeleted" })));
  assert(!isDeletedInEngine(new AppError("engine_rejected", 422, { code: "X" })));
});

Deno.test(
  "autenticação: sem métodos liberados, só e-mail (certificado também precisa ser liberado)",
  () => {
    // O teste roda sem SIGNDOC_AUTH_METHODS.
    assertEquals(availableAuthLevels(), ["basic"]);
    assert(
      code(() => cleanParticipants([p({ authLevel: "qualified" })], true)).includes("authLevel"),
    );
    assert(
      code(() => cleanParticipants([p({ authLevel: "reinforced" })], true)).includes("authLevel"),
    );
    assertEquals(
      code(() => cleanParticipants([p({ authLevel: "basic" })], true)),
      "ok",
    );
  },
);

Deno.test(
  "consumo: falha devolve; sem resposta do motor ou já criado fica para conferência",
  async () => {
    const { chargeOutcome, requestKey } = await import("../functions/_shared/create.ts");
    const net = (c: string) => new AppError("engine_unavailable", 502, { code: c });
    assertEquals(
      chargeOutcome(new AppError("engine_rejected", 422, { code: "X" }), true, null),
      "release",
    );
    assertEquals(chargeOutcome(net("timeout"), false, null), "release"); // falhou antes de criar (upload)
    assertEquals(chargeOutcome(net("timeout"), true, null), "unknown");
    assertEquals(chargeOutcome(net("network"), true, null), "unknown");
    assertEquals(chargeOutcome(net("ABC123"), true, null), "release"); // 500 com resposta: não criou
    assertEquals(chargeOutcome(new Error("db"), false, "e1"), "unknown"); // já existe no motor
    assertEquals(requestKey("send", "u1", "abcdef12-3456"), "send:u1:abcdef12-3456");
    assertEquals(requestKey("send", "u1", "x"), undefined);
    assertEquals(requestKey("send", "u1", "../etc"), undefined);
  },
);

Deno.test("WhatsApp: SAIR reconhece o celular com e sem o 9 da frente", () => {
  assertEquals(brPhoneVariants(normalizePhone("5561991670611")), [
    "+55 61 99167-0611",
    "+55 61 9167-0611",
  ]);
  assertEquals(brPhoneVariants(normalizePhone("556191670611")), [
    "+55 61 9167-0611",
    "+55 61 99167-0611",
  ]);
  // Fixo (começa com 2–5) não ganha 9; número inválido não gera nada.
  assertEquals(brPhoneVariants(normalizePhone("6132345678")), ["+55 61 3234-5678"]);
  assertEquals(brPhoneVariants(normalizePhone("123")), []);
});

Deno.test("WhatsApp: reenvio logo depois não duplica a mensagem", async () => {
  const calls: [string, unknown][] = [];
  const builder = {
    select: (c: string) => (calls.push(["select", c]), builder),
    eq: (c: string, v: unknown) => (calls.push([`eq:${c}`, v]), builder),
    in: (c: string, v: unknown) => (calls.push([`in:${c}`, v]), builder),
    gte: (c: string, v: unknown) => (
      calls.push([`gte:${c}`, v]),
      Promise.resolve({ data: [{ participant_id: "p1" }] })
    ),
  };
  const db = { from: (t: string) => (calls.push(["from", t]), builder) } as never;
  const now = new Date("2026-10-18T14:50:46Z");
  const recent = await recentWhatsApp(["p1", "p2"], now, db);
  assertEquals([...recent], ["p1"]);
  const filters = Object.fromEntries(calls);
  assertEquals(filters["from"], "notifications");
  assertEquals(filters["eq:channel"], "whatsapp");
  assertEquals(filters["in:participant_id"], ["p1", "p2"]);
  assertEquals(filters["in:status"], ["pending", "sent", "delivered"]);
  assertEquals(
    filters["gte:created_at"],
    new Date(now.getTime() - WHATSAPP_REPEAT_MINUTES * 60_000).toISOString(),
  );
  // Sem participantes, nem consulta o banco.
  assertEquals((await recentWhatsApp([], now, db)).size, 0);
});

Deno.test("validação pública: só nome, quando, como e se é válida", () => {
  const out = publicSigners([
    {
      subjectName: "Fulana de Tal",
      identifier: "12345678909",
      emailAddress: "fulana@exemplo.com",
      isElectronic: false,
      signingTime: "2026-10-17T13:31:00Z",
      validationResults: { isValid: true },
      // campos que não podem sair
      ...({ certificateThumbprint: "abc", evidences: { ip: "1.2.3.4" } } as object),
    },
    { subjectName: "Sicrano", identifier: null, isElectronic: true, validationResults: null },
  ]);
  assertEquals(out, [
    {
      name: "Fulana de Tal",
      cpf: "***.456.789-**",
      signedAt: "2026-10-17T13:31:00Z",
      kind: "certificate",
      valid: true,
    },
    { name: "Sicrano", cpf: null, signedAt: null, kind: "electronic", valid: null },
  ]);
  const text = JSON.stringify(out);
  assert(!text.includes("@") && !text.includes("12345678909") && !text.includes("abc"));
});

Deno.test("validação pública: código digitado e arquivo recebido", () => {
  assertEquals(cleanKey(" abcd-1234.efgh "), "ABCD-1234EFGH");
  assertEquals(cleanKey("x"), null);
  assertEquals(cleanKey("<script>"), null);
  assertEquals(looksLikePdf(new TextEncoder().encode("%PDF-1.7 ...")), true);
  assertEquals(looksLikePdf(new TextEncoder().encode("GIF89a")), false);
  assertEquals(looksLikePdf(new Uint8Array(11 * 1024 * 1024).fill(0x25)), false);
});

Deno.test("anexos: tipo pelo conteúdo, limite de quantidade e de tamanho", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]);
  assertEquals(attachmentType(png), "image/png");
  assertEquals(attachmentType(jpg), "image/jpeg");
  assertEquals(attachmentType(new TextEncoder().encode("MZ executável")), null);
  const ok = await readAttachments([new File([png], "foto.png"), new File([jpg], "../x/rg.jpg")]);
  assertEquals(
    ok.map((a) => [a.name, a.contentType]),
    [
      ["foto.png", "image/png"],
      ["..xrg.jpg", "image/jpeg"],
    ],
  );
  await assertRejects(
    () => readAttachments(Array.from({ length: 6 }, (_, i) => new File([png], `${i}.png`))),
    AppError,
    "too_many_attachments",
  );
  await assertRejects(
    () => readAttachments([new File([new TextEncoder().encode("MZ")], "a.exe")]),
    AppError,
    "attachment_type",
  );
  await assertRejects(
    () => readAttachments([new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], "grande.pdf")]),
    AppError,
    "attachment_too_large",
  );
});
