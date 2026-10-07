# Asaas — motor financeiro (Sandbox) e futura ativação de produção

> **Situação atual: SOMENTE SANDBOX.** Produção está desligada no código
> (`PRODUCTION_ENABLED = false` em `supabase/functions/_shared/asaas.ts`) e nenhuma
> credencial de produção está cadastrada. A conclusão da homologação no Sandbox **não**
> autoriza produção: a ativação depende de autorização explícita.

## Responsabilidades

| Asaas | MDSign |
|---|---|
| Cliente financeiro, Checkout, cobrança, assinatura recorrente, Pix, cartão, eventos | Planos, entitlements, limites, consumo, usuários, permissões, motor de políticas, suspensão, regras comerciais |

Fluxo: **navegador → função `billing` (Supabase) → API do Asaas**. O navegador nunca fala
com o Asaas com credencial; a chave existe só nos segredos das funções.

## Peças

- **Banco** (`20261006090000_asaas_billing.sql`): colunas do Asaas em `subscriptions`;
  `billing_checkouts` (plano pendente até o pagamento), `billing_payments` (histórico, sem
  dados de cartão), `billing_events` (idempotência pelo `id` do evento); `org_billing()`
  (tela) e `admin_billing()` (Super Admin); política `billing_grace` (dias de tolerância).
- **Integrações só no Mogno** (`20261006091000_integracoes_mogno.sql`): entitlement
  `integrations_access`; API MDSign, tela de Integrações e webhooks de saída conferem.
- **Funções**: `billing` (checkout, cancelamento, sincronização, status, configurar webhook),
  `asaas-webhook` (eventos financeiros), `reminders-run` (de hora em hora: reprocessa eventos,
  suspende após a tolerância e encerra cancelamentos no fim do período pago).

## Regras de negócio implementadas

- **Cedro** não usa o Asaas (sem cliente, checkout ou assinatura). Mogno: contratação comercial.
- **Cliente Asaas** criado uma vez por organização (`externalReference` = id da organização);
  reaproveitado em todo checkout, renovação e troca de plano.
- **Checkout hospedado**, recorrente mensal, Pix ou cartão. O retorno (`successUrl`) só mostra
  "processando": **o plano muda apenas com `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`** processado
  pelo servidor, ligado ao checkout pelo `checkoutSession` da assinatura.
- **Idempotência**: evento repetido é ignorado (`billing_events.id`); cada efeito confere o
  estado (reativar a mesma assinatura não muda nada; checkout já usado não reativa plano antigo).
- **Inadimplência**: `PAYMENT_OVERDUE` → `past_due`; após `billing_grace.days` → `suspended`
  (o `consume_document` bloqueia novas operações). Nada é apagado. Pagamento → `active`.
- **Troca de plano** (upgrade/downgrade): novo checkout; ao confirmar, o plano muda e a
  assinatura anterior é removida no Asaas. Sem proporcionalidade (não há no Asaas).
  Downgrade acima dos limites: aviso de pendência, ninguém e nada é removido.
- **Cancelamento**: remove a assinatura no Asaas; o plano vale até o próximo vencimento e
  depois a organização volta ao Cedro. Documentos, histórico e usuários são preservados.

## Segredos (Supabase → Edge Functions → Secrets)

| Nome | Sandbox (atual) | Observação |
|---|---|---|
| `ASAAS_ENV` | `sandbox` | Qualquer outro valor falha com segurança. Sem fallback. |
| `ASAAS_API_KEY` | chave do Sandbox (`$aact_hmlg_…`) | Chave `$aact_prod_` é recusada no Sandbox. |
| `ASAAS_WEBHOOK_TOKEN` | gerado aleatório (64 hex) | Enviado pelo Asaas no cabeçalho `asaas-access-token`. |

## Checklist para a FUTURA ativação de produção (não executar sem autorização)

1. Autorização explícita da direção para produção.
2. Conta Asaas de produção aprovada; domínio de produção do MDSign definido
   (`ALLOWED_ORIGINS`) — o `successUrl` usa essa origem.
3. Revisão de código: trocar `PRODUCTION_ENABLED` para `true` (único ponto) em PR revisado.
4. Gerar novo `ASAAS_WEBHOOK_TOKEN` para produção; cadastrar `ASAAS_API_KEY` de produção
   pelo terminal (nunca no chat/código); `ASAAS_ENV=production`.
5. Super Admin → "Configurar webhook" (cria o webhook na conta de produção).
6. Teste controlado com valor real mínimo, conferir histórico e auditoria; plano de reversão:
   voltar `ASAAS_ENV=sandbox` desliga as cobranças novas pelo MDSign.
