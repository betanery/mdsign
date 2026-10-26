#!/usr/bin/env bash
# Grava o segredo de assinatura do webhook do Resend (avisos de e-mail entregue/aberto) nos
# segredos das funções do Supabase. O segredo é digitado sem aparecer na tela e não fica no
# repositório nem no histórico do terminal.
# Antes: no Resend → Webhooks → Add endpoint, use a URL abaixo e marque os eventos
#   email.delivered, email.opened, email.clicked, email.bounced e email.complained;
#   depois copie o "Signing secret" (começa com whsec_).
# Uso: bash scripts/resend-webhook-secret.sh
set -euo pipefail
cd "$(dirname "$0")/.."

REF="vrksxqbopteeyeovdwpu"
echo "URL do webhook no Resend: https://${REF}.supabase.co/functions/v1/resend-webhook"
echo
read -r -s -p "Cole o Signing secret do Resend (whsec_...) e tecle Enter: " SECRET
echo
if [[ "$SECRET" != whsec_* ]]; then
  echo "O segredo precisa começar com whsec_. Nada foi gravado."
  exit 1
fi
npx supabase secrets set RESEND_WEBHOOK_SECRET="$SECRET" >/dev/null
unset SECRET
echo "Segredo gravado. O Resend já pode enviar os avisos."
