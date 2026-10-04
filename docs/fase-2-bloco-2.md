# MDSign Fase 2 — Bloco 2 (documentos e assinatura)

PRD Fase 2 §58, Bloco 2: Só eu assino, envio, participantes, assinatura, documentos e timeline.
Entregue em etapas:

| Etapa | Conteúdo | Situação |
|---|---|---|
| **2A** | Só eu assino de ponta a ponta, lista e detalhe de documentos, timeline | ✅ pronta para teste |
| 2B | Enviar para assinatura: participantes (com CPF ou estrangeiros), ordem, autenticação, revisão | ✅ ver [fase-2-blocos-2b-a-6.md](fase-2-blocos-2b-a-6.md) |
| 2C | Webhooks do motor (status em tempo real), lembretes automáticos | ✅ ver [fase-2-blocos-2b-a-6.md](fase-2-blocos-2b-a-6.md) |

## Arquitetura (PRD §4)

```text
Navegador (app MDSign)  ──token do usuário──▶  Edge Functions  ──X-Api-Key──▶  SignDoc
        │ lê (RLS)                                    │ grava (service role)
        └──────────── Supabase: documents, document_participants, document_events
```

- A chave `SIGNDOC_API_KEY` existe só nas Edge Functions.
- O navegador **lê** documentos com RLS (quem tem `documents.view` na organização ou participa
  do documento) e **não grava** nada direto: toda escrita passa pelas funções, que conferem a
  permissão do usuário no banco.
- O status vem sempre do motor (`syncDocument`): o evento do componente de assinatura é só um
  aviso (a documentação da Lacuna pede para confirmar no backend).
- A timeline só registra eventos confirmados (PRD §27).

## Funções

| Função | O que faz |
|---|---|
| `documents-self-sign` | Recebe o PDF (somente PDF, até 20 MB, assinatura `%PDF-` conferida), cria o documento com o próprio usuário como signatário (`allowElectronicSignature: true`, sem e-mails) e devolve o `embedUrl` |
| `documents-action` | `sign-url` (assinar), `sync` (atualizar status), `download` (assinado, original ou para impressão), `cancel` e `remind` |

## Telas

- `/app/sign` — Só eu assino: escolher PDF → revisar e assinar no componente oficial
  `LacunaSignerWidget` 0.8.0 (CDN da Lacuna, com verificação de integridade) → concluído com
  download.
- `/app/documents` — abas Todos, Aguardando, Para mim, Concluídos; status em linguagem humana.
- `/app/documents/:id` — participantes, timeline e ações (assinar, baixar, atualizar, cancelar,
  lembrar).

## Estrangeiros sem CPF (decisão: Bloco 2)

O motor 2.9.0 exige `identifier` (CPF) por padrão. Para aceitar participantes sem CPF, a MDTech
precisa configurar na instância **`General.CountryIdentifierMode = Nullable`** (na 2.11+ o
equivalente é `IdentifierScope.IdentifierModes`). O banco já tem `profiles.no_cpf` e os
participantes aceitam CPF nulo; a opção aparece nas telas na etapa 2B.

## Pendências

- Web PKI: a documentação da Lacuna pede a licença com o domínio onde o componente carrega.
  Necessária para assinatura com certificado; validar no primeiro teste se a assinatura
  eletrônica funciona sem ela.
- Consumo e limite do Cedro (5 documentos) entram no Bloco 6 (entitlements).
