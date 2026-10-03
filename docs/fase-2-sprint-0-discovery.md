# MDSign Fase 2 — Sprint 0: discovery SignDoc/Lacuna

Levantamento técnico exigido pelo PRD Fase 2 (§4 e §58). Fontes: documentação oficial da Lacuna
(docs.lacunasoftware.com/articles/signer), Swagger da instância (`sign.signdocmd.com.br/swagger`,
versão informada 2.9.0) e telas do System Admin da instância MDTech.

Legenda: ✅ confirmado na documentação · ⚠️ confirmado com ressalva · ❓ falta validar na
instância ou com a Lacuna.

## 1. Chaves de API e multi-tenant

- ✅ A chave pertence a uma **aplicação**, criada no painel (Aplicações → Chaves), formato
  `nome-da-aplicação|chave`, exibida **uma única vez**.
- ✅ "O escopo da chave é restrito à organização em que foi criada: ela só vê e cria documentos
  daquela organização." A API pública não tem parâmetro para escolher outra organização.
- ✅ Existe **API administrativa** (chave de aplicação na organização `Sys Admin`):
  `POST/GET /api/admin/organizations`, `GET/POST /api/organizations/{id}/users`,
  `DELETE /api/admin/organizations/{id}/users/{userId}`, `POST /api/organizations/{orgId}/webhooks`.
- ⚠️ **Não há API documentada para criar aplicações nem chaves.** Uma organização nova pode ser
  criada por API, mas a chave dela precisa ser gerada no painel.

### Testado na instância (03/10/2026, somente leitura)

- ✅ A chave administrativa (aplicação na organização Admin/Sys Admin) lista as organizações:
  `GET /api/admin/organizations` → 32 organizações, com os campos `id`, `name`, `identifier`
  e `owner`.
- ✅ A mesma chave **não opera documentos**: `/api/documents`, `/api/folders`,
  `/api/document-flows` e `/api/organizations/users` respondem `422 SubscriptionRequired`.
  A organização Sys Admin não tem assinatura. Para documentos é preciso uma aplicação dentro de
  uma organização com assinatura, o que confirma o modelo abaixo.

### Decisão proposta

| Modelo | Uso | Como funciona |
|---|---|---|
| **A. Organização-motor única** | Lançamento: Cedro, PME, autosserviço | Uma organização "MDSign Plataforma" no motor, uma aplicação com papéis mínimos. Tenants isolados no Supabase (RLS) e por pasta no motor. Cadastro 100% automático. |
| **B. Organização dedicada** | Mogno/enterprise, sob demanda | Organização própria no motor (criada pela API admin), aplicação e chave geradas pela operação MDTech no painel e guardadas por tenant no backend. Webhook criado por API. |

O backend abstrai os dois modelos: cada tenant aponta para uma "conexão de motor" (organização +
chave). No modelo A, todos os tenants compartilham a mesma conexão.

### Segurança das chaves

- Chave da aplicação de documentos: papéis **Básico + Criador de documentos** (menor privilégio).
- Chave admin (`Sys Admin`): só se e quando o modelo B for automatizado; nunca na mesma função
  que atende usuários.
- Chaves só em segredos do Supabase (`SIGNDOC_API_KEY`), nunca no navegador nem no repositório.
- A aplicação "MDSIGN Landing" (organização Admin) tem papéis amplos e a chave "MDSign_Lovable"
  expira só em 2126: usar apenas para configuração/administração (segredo separado,
  `SIGNDOC_ADMIN_API_KEY`), nunca como chave do dia a dia; definir validade menor ao renovar.

## 2. Assinatura embutida (sem frontend legado)

- ✅ Componente `LacunaSignerWidget` (JS): `POST /api/documents/{id}/action-url` devolve `url` e
  `embedUrl`; `widget.render(embedUrl, elementId)` exibe a cerimônia em iframe na página do MDSign.
- ✅ Eventos `documentSigned` e `documentApproved`. **Sempre confirmar no backend** (a doc avisa que
  callbacks podem ser forjados por outros scripts).
- ✅ Certificado em nuvem no modo embutido (1.76.0), liveness no embutido (1.76.0), tela de
  posicionamento de assinaturas embutível (1.70.0, sessão de 1 h).
- ⚠️ O uso da URL fica registrado nas evidências como **autenticação por aplicação**, e alguns
  requisitos (ex.: SMS) não são exigidos quando o usuário foi autenticado pela aplicação.
  **Validar com o jurídico** quais níveis de autenticação do PRD §10 dependem disso.
- ❓ **Licença do Web PKI precisa incluir o domínio do MDSign** ("O Signer deve ser configurado com
  uma licença do Web PKI que tenha o domínio no qual o componente será carregado"). Pedir à Lacuna
  a inclusão de `mdsign.lovable.app` e do domínio final.
- ✅ Opções do widget: idioma (`culture`), tema, ocultar prévia, notificações. Exemplo mobile
  (Flutter) disponível.

## 3. Webhooks

- ✅ Por organização (painel ou `POST /api/organizations/{orgId}/webhooks`), até 5 por organização
  (`MaxWebhooksPerOrganization`). Não disponíveis em organizações pessoais.
- ✅ Eventos: DocumentsCreated, DocumentSigned, DocumentApproved, DocumentRefused,
  DocumentConcluded, DocumentCanceled, DocumentExpired, DocumentDeleted (+ InvoiceClosed, da
  instância). Corpo `{ "type": ..., "data": ... }`.
- ✅ **Autenticação:** o Signer envia um token que nós definimos, em `Authorization: Bearer`,
  `Basic` ou `X-Api-Key`. (Correção: antes eu tinha dito que não havia como autenticar. Não há
  assinatura do corpo, mas há token no cabeçalho.)
- ✅ Entrega assíncrona, até 10 tentativas, **sem garantia de ordem**, DocumentConcluded com
  atraso padrão de 60 s.
- Regras de implementação: responder 200 imediatamente, validar o token, registrar o evento,
  deduplicar por `tipo + documentId + flowActionId`, e **reconsultar o documento na API** antes de
  mudar o estado (o webhook é notificação, não fonte da verdade).

## 4. Acompanhamento e ciclo de vida

- ✅ `GET /api/documents/{id}`: status `Pending`, `FlowConcluded`, `Concluded`, `Refused`,
  `Canceled`, `Expired`; cada `flowAction` com `Created`, `Pending`, `Completed`, `Refused`.
  Permite o status humano do PRD §26 ("Aguardando assinatura de João Silva").
- ✅ Lembrete: `POST /api/notifications/flow-action-reminder`. Cancelar, recusar, nova versão
  (reinicia o fluxo) e excluir.
- ❌ Não há eventos de e-mail entregue, aberto ou documento visualizado: a timeline não os exibe
  (PRD §27).

## 5. Autenticação do signatário e ICP-Brasil

Cada método depende de **contrato e configuração da instância**:

| Método | Requisito na instância |
|---|---|
| E-mail | nativo |
| SMS | fornecedor (`SMS__Type`: Twilio, Zenvia, TotalVoice…) + `EnableSmsAuthentication` |
| WhatsApp | conta Meta/Zenvia + `EnableWhatsappAuthentication` (WhatsApp + Selfie na 2.21.0) |
| Selfie Datavalid | credenciais SERPRO + `EnableDatavalidAuthentication` |
| Pix | conta Gerencianet + `EnablePixAuthentication` |
| Liveness / documento | RestPki/FaceTec + `EnableLivenessAuthentication` / `EnableIdScanAuthentication` |
| Certificado A1/A3 | Web PKI (licença por domínio) |
| Certificado em nuvem | `TrustServices__Enabled` (BirdID, SafeID, NeoID, VIDaaS); e-CNPJ em nuvem (1.68.0) |
| HSM | `Hsm__Enabled` |

PRD §10: "Não prometer método não confirmado/licenciado". ❓ Levantar quais estão ativos na
instância MDTech.

Assinatura em lote existe e recebeu correções para HSM/nuvem na 2.22.0.

## 6. Idiomas

- ✅ Widget com `culture`; notificações em Pt, En e Es; e-mails respeitam o idioma do destinatário
  (2.13.0); idioma da notificação de conclusão por destinatário (2.22.0).

## 7. Marca, domínio e textos

- ✅ Nível instância (equipe de implantação da Lacuna, não é autosserviço): `SiteName`,
  `ShortSiteName` (usado em SMS), logos, tema de cores, `HidePoweredBy`, textos de e-mail,
  SMTP próprio e **domínio próprio**.
- ✅ Nível organização (admin da organização): logo e cores do e-mail, logo da versão para
  impressão, carimbo de validação e imagem da representação visual da assinatura.
- ❓ Pedir à Lacuna: trocar a marca da instância de SignDoc para MDSign (ou manter SignDoc como
  motor invisível) e definir domínio/SMTP.

## 8. Consumo, armazenamento e limites

- ✅ Totais por período: `POST /api/documents/date` (documentos e envelopes) e relatório Excel
  `POST /api/reports/documents/date`, com aplicação `Sys Admin` + papel **Monitor**.
- O MDSign medirá o próprio consumo (PRD §41); o motor serve de conferência.
- Arquivos ficam no blob do motor; o MDSign guarda referências e baixa sob demanda (ticket),
  sem duplicar (PRD §46). ❓ Retenção e limite de storage da instância.
- ⚠️ Há throttling configurável (`DocumentKeyThrottling`), sem limites públicos. ❓ Confirmar
  limites para envio em massa.
- `FlowActionTicketValidityMinutes` = 1440 (link de assinatura vale 24 h por padrão).

## 9. Versão da instância

- ⚠️ O Swagger da instância informa **2.9.0**; a versão atual do Signer é **2.22.0**
  (2026-09-10). Itens úteis para a Fase 2 depois da 2.9: idioma da notificação por destinatário,
  WhatsApp + Selfie, correções de lote com HSM/nuvem. ❓ Confirmar versão e planejar atualização.

## 10. Pendências de infraestrutura (instância operada pela MDTech)

A instância é on-premises e operada pela própria MDTech: configurações, marca, versão e
autenticações são ajustadas internamente. Só a licença do Web PKI é produto da Lacuna.

1. Existe API para criar aplicações e chaves (para automatizar o modelo B)? Verificar no Swagger
   administrativo da instância.
2. Incluir os domínios do MDSign na licença do Web PKI (licença emitida pela Lacuna).
3. Quais métodos de autenticação estão contratados e ativos (seção Electronic Signature e
   integrações das configurações).
4. Marca da instância (SiteName, logos, e-mails, domínio, SMTP).
5. Limites de requisição (`Throttling`) para envio em massa.
6. Versão atual da instância e atualização para a 2.22.
7. Ambiente de homologação (segunda instância ou organização de testes).

## 11. Próximos passos técnicos

1. Criar no painel a organização "MDSign Plataforma" e a aplicação "MDSign Backend"
   (Básico + Criador de documentos); cadastrar a chave como segredo `SIGNDOC_API_KEY`.
2. Teste de fumaça pelo backend: upload → documento → `action-url` → widget embutido → webhook
   autenticado → reconsulta do status.
3. Fechar com o jurídico o uso do modo embutido por nível de autenticação.
4. Iniciar o Bloco 1 (auth, tenants, papéis, design system do app, i18n, backend).
