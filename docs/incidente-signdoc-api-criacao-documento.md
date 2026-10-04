# Incidente: criação de documento pela API do SignDoc retorna erro 500

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

## O que precisamos

1. **Stack trace** de qualquer um dos códigos acima nos logs da aplicação (ex.: `E7E211`).
2. Confirmar se as integrações existentes (Conectenvios, Novaweb/Asaas, Formulário de Assinatura)
   **criam documentos hoje**. Se não, é incidente de produção.
3. Verificar Hangfire (System Admin → Hangfire) por jobs com falha no horário dos testes.
4. Verificar o estado dos serviços em System Admin → Servidores.

## Contexto adicional

- Aplicações envolvidas: "MDSign Backend" (MDSign Plataforma), "MDSign Teste" (TESTE
  XUPETINHA), "MDSIGN Landing" (Admin; responde `OrganizationRequired`, esperado).
- Nenhum documento foi criado pelos testes; a pasta de diagnóstico criada foi excluída.
- Após a análise, a aplicação temporária "MDSign Teste" pode ser excluída.
