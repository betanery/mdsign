# Incidente: criação de documento pela API do SignDoc retorna erro 500

> **Situação em 03/10/2026, 22:11 (-03:00): normalizado sem mudança do lado cliente.**
> Última falha: 22:02:17 (`ADCAD6`). Primeiro sucesso: 22:11:41, com a biblioteca oficial
> `signer-node-client` 1.1.0 (cenário `createDocumentWithOneSignerScenario` do SignerSamples).
> Em seguida, **o mesmo pedido que falhava** passou a funcionar: os dois PDFs, os dois
> signatários, com e sem `step`, com e sem `allowElectronicSignature` (8 combinações, todas
> 200). `action-url` devolveu `url` e `embedUrl`. Os documentos de teste foram cancelados.
> Como nada mudou no pedido, a causa foi uma mudança/recuperação na instância entre 22:02 e
> 22:11. **Pendente:** confirmar com quem administra o servidor o que mudou nesse intervalo
> (reinício, faturamento reativado com efeito após cache, correção) e ainda analisar os stack
> traces, para evitar recorrência.

**Instância:** https://sign.signdocmd.com.br (Signer on-premises, Swagger versão 2.9.0)
**Data dos testes:** 03/10/2026, entre 21h e 23h
**Endpoint afetado:** `POST /api/documents`

## Sintoma

Toda criação de documento feita por **aplicação** (chave `X-Api-Key`) responde:

```
HTTP 500
{"message":"Ocorreu um erro inesperado. Por favor entre em contato com o suporte técnico e informe o código XXXXXX.","exceptionCode":"XXXXXX"}
```

Criar documento **pelo painel** (usuário logado), na mesma organização, funciona.

## Teste mínimo oficial (Get Started da Lacuna) — encerra a investigação do lado cliente

`POST /api/uploads/bytes` → 200 (`5248de2d-e87a-4601-a892-81561fe56afe`), às 2026-10-03T21:55:18-03:00
`POST /api/documents` → **500 `17FF36`**, às **2026-10-03T21:55:19-03:00**

```json
{
  "files": [{ "displayName": "Teste API", "id": "<UPLOAD_ID>", "name": "teste.pdf", "contentType": "application/pdf" }],
  "flowActions": [{ "type": "Signer", "step": 1,
    "user": { "name": "John Wick", "identifier": "81976153069", "email": "john.wick@mailinator.com" },
    "allowElectronicSignature": true }]
}
```

Repetição literal do guia (4 passos, mesmo corpo e nomes de arquivo), às 2026-10-03T22:00:36–37-03:00:
`GET /api/documents` → 200 · `POST /api/uploads/bytes` → 200 (`6f2c81ac-bb06-4f0f-90cf-f7271aaa209c`) ·
`POST /api/documents` → **500 `2F77FB`** (22:00:37).

Organização: MDSign Plataforma (`01620f89-b1c8-45fc-a4f1-08df1268a801`). Aplicação: MDSign Backend
(ID visível em System Admin → Aplicações). A documentação oficial afirma que a chave de uma
organização deve criar documentos nela: não é comportamento esperado.

## Códigos de exceção para buscar nos logs

| Código | Contexto |
|---|---|
| `E7E211` | Corpo idêntico ao exemplo do Swagger, `Content-Type: application/json-patch+json` |
| `D788B3` | Signatário fictício (CPF válido gerado, e-mail mailinator) |
| `5ABF5B` | Aplicação "MDSign Teste", organização TESTE XUPETINHA, faturamento reativado |
| `84AAED` | Aplicação "MDSign Backend", organização MDSign Plataforma, faturamento reativado |
| `9DE798`, `0194A7`, `AD4F18`, `E5B69E`, `09798E` | Variações (aprovador, contentType, upload por bytes, pasta nova, notificações desligadas) |
| `43CA04`, `7E25AD`, `65503F`, `D63E18`, `332543`, `CFCA21`, `99B237`, `DD8CAB`, `FBD910`, `77483E` | Tentativas anteriores |
| `3EF69D`, `457F70` | `POST /api/uploads` falhando de forma intermitente (passou nas tentativas seguintes) |
| `4BB15E` | Painel: tela de plano/faturamento de qualquer organização |

## Pedido usado (exemplo do Swagger)

```json
{
  "files": [{ "displayName": "Contrato Swagger", "id": "<id do upload>", "name": "Contrato.pdf", "contentType": "application/pdf" }],
  "flowActions": [{ "type": "Signer", "step": 1,
    "user": { "name": "John Wick", "identifier": "81976153069", "email": "john.wick@mailinator.com" } }]
}
```

## O que funciona e o que falha

| Operação | Resultado |
|---|---|
| `POST /api/uploads` e `/api/uploads/bytes` | ✅ (com falhas intermitentes) |
| `POST /api/documents/validate-signatures` com o arquivo enviado | ✅ servidor lê e analisa o PDF |
| `POST /api/folders` (gravação no banco) | ✅ |
| `POST /api/marks-sessions/documents` com **o mesmo corpo** da criação | ✅ devolve `embedUrl` |
| Erros de validação (sem CPF, envelope com 1 arquivo, `signatureType`) | ✅ retornam 400/422 com o motivo |
| **`POST /api/documents`** | ❌ **500 em todas as tentativas** |
| Criar documento pelo painel (usuário) | ✅ |

## Hipóteses já descartadas

- Formato do pedido, chave e endereço (conferidos no Swagger da instância).
- Arquivo (inclusive o mesmo PDF que funciona pelo painel).
- Notificações ligadas ou desligadas.
- Signatário real ou fictício.
- Papéis da aplicação (Básico + Criador de documentos; depois + Administrador).
- Organização nova (MDSign Plataforma) vs. antiga (TESTE XUPETINHA).
- Faturamento da instância desabilitado vs. reativado.

## Conclusão

A falha ocorre **depois da validação**, na **efetivação do documento quando o agente é uma
aplicação**: gravação do documento/agente, lançamento de consumo, enfileiramento de tarefas
(Hangfire) ou disparo de webhooks. O mesmo pedido é processado sem erro em
`marks-sessions/documents`, que não efetiva o documento.

## O que precisamos (servidor)

1. **Stack trace** de qualquer um dos códigos acima nos logs da aplicação (ex.: `E7E211`).
2. Confirmar se as integrações existentes (Conectenvios, Novaweb/Asaas, Formulário de Assinatura)
   **criam documentos hoje**. Se não, é incidente de produção.
3. Verificar Hangfire (System Admin → Hangfire) por jobs com falha no horário dos testes.
4. Verificar o estado dos serviços em System Admin → Servidores.
5. Para cada código, obter **Exception Type, Message, InnerException e StackTrace**. Começar por
   `2F77FB`, `17FF36` e `E7E211`; depois `D788B3`, `5ABF5B`, `84AAED`. Se apontarem para o mesmo método,
   o diagnóstico fecha.
6. Teste A/B no mesmo minuto: (A) criar pelo painel na MDSign Plataforma e (B) pela API com o
   mesmo PDF e participante. Anotar horário exato, Organization ID, Application ID, User ID (A) e
   exceptionCode (B) para comparar as duas requisições nos logs.
7. Desabilitar temporariamente os webhooks da organização de teste e repetir (B).
8. Conferir se binários e banco estão alinhados com a 2.9.0 (todas as migrations executadas),
   especialmente se houve atualização recente.

## Ordem de probabilidade

1. Contexto do agente `Application` na criação (código esperando dados de usuário).
2. Consumo/faturamento no momento da efetivação (configuração inconsistente no banco).
3. Job Hangfire disparado na criação (notificação, processamento) recebendo `Application`.
4. Webhook/integração da organização (menos provável: falha em organizações diferentes).
5. Defeito da 2.9.0 ou desalinhamento entre aplicação e schema do banco.

Não usar `marks-sessions/documents` como substituto: ele não efetiva o documento. A arquitetura
do MDSign segue o caminho oficial `POST /api/documents` → `action-url`/`embedUrl`.

## Contexto adicional

- Aplicações envolvidas: "MDSign Backend" (MDSign Plataforma), "MDSign Teste" (TESTE
  XUPETINHA), "MDSIGN Landing" (Admin; responde `OrganizationRequired`, esperado).
- Nenhum documento foi criado pelos testes; a pasta de diagnóstico criada foi excluída.
- Após a análise, a aplicação temporária "MDSign Teste" pode ser excluída.
