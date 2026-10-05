# MDSign — Integrações (API, webhooks e registro)

PRD §31 (P0): orquestração segura, webhooks, credenciais e logs. Tela em
**Integrações** (`/app/integrations`), para quem tem a permissão `integrations.manage`
(proprietário e administrador).

## Chaves de API
- Criadas na tela. A chave completa (`mds_<8 hex>_<48 hex>`) aparece **uma única vez**. O
  banco guarda só o SHA-256 (`api_keys.key_hash`), que nem o navegador consegue ler.
- Revogar desativa na hora.
- Limite de 120 chamadas por minuto por chave.
- Criação e revogação ficam na auditoria (`integration.key_created/revoked`).

## API MDSign (`/functions/v1/api/v1`)
`Authorization: Bearer mds_...` (ou `X-Api-Key`).

| Método | Rota | O que faz |
|---|---|---|
| GET | `/documents?status=&limit=&before=` | lista |
| GET | `/documents/{id}` | detalhe: participantes, observadores e timeline (sincroniza com o SignDoc) |
| POST | `/documents` | cria e envia: PDF (`file.base64`) ou modelo (`templateId`, `values`, `roles`/`participants`); aceita testemunhas, observadores, posições (`marks`), prazo, mensagem e lembretes |
| POST | `/documents/{id}/cancel` | cancela |
| POST | `/documents/{id}/remind` | lembra um participante |
| GET | `/documents/{id}/download?version=signed\|original\|printable` | link temporário |
| GET | `/templates` | modelos disponíveis (com campos e papéis) |
| GET | `/usage` | plano e consumo |

Documentos criados pela API consomem o plano normalmente (`origin: "api"`). Toda chamada vai
para `api_requests` (aba **Registro**).

## Webhooks de saída
- Destinos HTTPS públicos. Endereços internos ou privados são recusados (proteção contra SSRF).
- Eventos: `document.created`, `document.sent`, `participant.signed`,
  `participant.approved`, `participant.refused`, `participant.added`, `participant.removed`,
  `document.version_added`, `document.concluded`, `document.refused`, `document.canceled`,
  `document.expired` (ou todos).
- Cada aviso é um `POST` JSON `{ id, type, occurredAt, data: { documentId, documentName,
  documentStatus, participantName, details } }` com os cabeçalhos:
  - `X-MDSign-Event`;
  - `X-MDSign-Delivery`;
  - `X-MDSign-Signature: t=<unix>,v1=<HMAC-SHA256(segredo, "t.corpo")>`.
- O segredo de assinatura (`whsec_...`) aparece uma vez. "Trocar segredo" gera outro.
- **Entrega**:
  - tentativa imediata após o evento;
  - se falhar, novas tentativas com espera de 1, 5, 15, 60, 180, 360, 720 e 1440 minutos
    (8 tentativas);
  - o agendador `mdsign-webhooks-run` roda a cada minuto, só quando há algo vencido;
  - "Reenviar" recoloca uma entrega que falhou.
- Os eventos vêm da timeline (gatilho `enqueue_webhooks`), sempre a partir de status
  confirmado pelo SignDoc.
- A sincronização registra cada mudança de status uma única vez, mesmo com o aviso do SignDoc
  e uma ação do MDSign chegando ao mesmo tempo.

## Testado (2026-10-05)
- Endereço interno recusado.
- Teste sem segredo no destino: falhou e foi reenviado automaticamente pelo agendador.
- Com segredo: entregue (200), com a assinatura HMAC conferida pelo receptor.
- Pela API: chave inválida recusada, listagem, modelos, consumo, criar → consultar →
  download → cancelar.
- Webhooks `document.sent` e `document.canceled` entregues, sem duplicidade.
- Chave revogada é recusada na hora.
- O receptor de teste foi removido.
