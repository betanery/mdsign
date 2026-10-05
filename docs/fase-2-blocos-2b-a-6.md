# MDSign Fase 2 — Blocos 2B a 6

Continuação de [fase-2-bloco-2.md](fase-2-bloco-2.md). Tudo segue a mesma arquitetura: o
navegador lê com RLS, toda escrita que envolve o motor passa pelas Edge Functions, e o status
vem sempre do SignDoc (`syncDocument`).

## O que foi entregue

| Bloco | Tela / recurso | Rotas | Funções |
|---|---|---|---|
| 2B | Enviar para assinatura (Documento → Participantes → Fluxo → Configurações → Revisão) | `/app/send` | `documents-send`, `app-config` |
| 2C | Webhooks do motor; lembretes automáticos de hora em hora | — | `signdoc-webhook`, `reminders-run` |
| 3 | Contatos (salvos automaticamente ao enviar; autocompletar no envio); painel com indicadores e "Precisa da sua atenção" | `/app/contacts`, `/app` | — |
| 4 | Modelos: biblioteca MDSign, da organização e pessoais; editor com `{{campos}}`; preencher, prévia em PDF, Só eu assino ou enviar | `/app/templates`, `/app/templates/new`, `/app/templates/edit/$id`, `/app/templates/$id` | `documents-from-template` |
| 4 | Formulários / links públicos: a pessoa preenche e assina sem conta | `/app/forms`, `/f/$token` | `public-form` |
| 5 | Envio em massa: CSV/XLSX lido no navegador, mapeamento automático de colunas, conferência com correção na tabela, envio teste, progresso e erros por linha | `/app/bulk`, `/app/bulk/new`, `/app/bulk/$id` | `bulk-jobs` |
| 6 | Planos e consumo ("X de 5 documentos"), alerta de 80%, bloqueio no limite; Super Admin com plano, cobrança e políticas por organização | `/app/organization` (aba Plano), `/admin` | — (RPCs no banco) |

Processos, Integrações e Relatórios continuam como "em breve" (próximas fases).

## Regras importantes

- **Consumo**: cada documento criado consome 1 do plano **antes** de ir ao motor
  (`consume_document`); se a criação falhar, devolve (`refund_document`). O código consulta
  entitlements, nunca o nome do plano. O percentual de alerta vem da política `usage_alert`.
- **Participantes**: CPF validado; estrangeiro sem CPF só quando a instância permite
  (`SIGNDOC_IDENTIFIER_OPTIONAL=true`, depende de `General.CountryIdentifierMode=Nullable` no
  SignDoc). Os níveis oferecidos vêm de `SIGNDOC_AUTH_METHODS` (hoje
  `sms,whatsapp,selfie,datavalid`; acrescentar `liveness` libera a prova de vida, que já está
  pronta no código). Opções: e-mail, código por SMS, código por WhatsApp (ambos exigem
  celular), selfie, Datavalid (exige CPF), prova de vida e certificado ICP-Brasil.
- **Modelos**: texto com `# título`, `## subtítulo`, `- lista`, `**negrito**` e `{{campos}}`;
  o PDF é gerado na função (pdf-lib, Helvetica). A biblioteca MDSign é só leitura (duplicar para
  adaptar) e deve ser revisada pelo jurídico antes do uso.
- **Link público**: token aleatório de 32 hex, validade e máximo de respostas com reserva
  atômica (`claim_form_slot`), 5 envios por IP/hora (IP guardado só como hash), honeypot,
  validação de todos os campos no servidor. Os valores fixos são preenchidos por quem cria o link.
- **Massa**: até 1.000 linhas por lote; o servidor revalida todas as linhas antes de criar o
  lote. O processamento é feito em pequenos lotes enquanto a tela está aberta e continua pelo
  agendador se a tela for fechada (`claim_bulk_items` evita enviar a mesma linha duas vezes).
  Sem saldo no plano, as linhas restantes são marcadas com `plan_limit_reached`.
- **Webhook**: token no cabeçalho (`Authorization: Bearer` ou `X-Api-Key`), comparação em
  tempo constante, deduplicação (o Signer reenvia até 10 vezes) e sincronização pela API.

## Banco (migrações)

- `20261005120000_bloco2b_3_envio_contatos.sql` — participantes (celular, sem CPF, autenticação,
  lembretes), mensagem/lembretes no documento, contatos.
- `20261005130000_bloco6_planos_consumo.sql` — planos, entitlements, assinatura, consumo, políticas.
- `20261005140000_bloco4_5_modelos_formularios_massa.sql` — modelos (+4 da biblioteca), links,
  respostas, lotes e itens.
- `20261005150000_formularios_massa_rpc.sql` — valores fixos do link e reservas atômicas.
- `20261005160000_agendador_lembretes.sql` — pg_cron chama `reminders-run` a cada hora (minuto 7);
  o segredo fica no Vault (`mdsign_cron_secret`), fora das migrações.
- `20261005170000_super_admin.sql` — `admin_overview`, `admin_set_plan`, `admin_set_policy`.

Testes: `bash scripts/test-rls.sh` (RLS, planos, modelos, links, lotes e Super Admin).

## Pendências para ativar em produção

1. **Registrar o webhook** na organização "MDSign Plataforma" do SignDoc:
   URL `https://vrksxqbopteeyeovdwpu.supabase.co/functions/v1/signdoc-webhook`, autenticação por
   cabeçalho `X-Api-Key` com o valor de `SIGNDOC_WEBHOOK_TOKEN` (está no `.env.local`; não colar
   em chat). Sem o webhook, o status é atualizado ao abrir o documento e pelo agendador.
2. **Estrangeiros**: ligar `General.CountryIdentifierMode = Nullable` no SignDoc e então
   `SIGNDOC_IDENTIFIER_OPTIONAL=true` nas funções.
3. **Prova de vida**: quando contratada, acrescentar `liveness` em `SIGNDOC_AUTH_METHODS`.
4. **SMTP próprio** no Supabase (e-mails de conta); GTM; domínio de produção.
5. O plano Cedro tem 5 documentos no total — para testes maiores, trocar o plano da organização
   no Super Admin.
