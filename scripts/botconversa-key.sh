#!/usr/bin/env bash
# Grava a chave da API do BotConversa (WhatsApp do MDSign) nos segredos das funções do Supabase.
# A chave é digitada sem aparecer na tela, é conferida no BotConversa antes de gravar e não fica
# no histórico nem no repositório. Nenhuma mensagem é enviada.
# Uso: bash scripts/botconversa-key.sh
set -euo pipefail
cd "$(dirname "$0")/.."

read -r -s -p "Chave da API do BotConversa: " KEY
echo
if [ -z "$KEY" ]; then echo "Chave vazia. Nada foi gravado."; exit 1; fi

# Consulta um número inexistente: 404 = chave aceita; 401/403 = chave recusada.
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "API-KEY: $KEY" \
  "https://backend.botconversa.com.br/api/v1/webhook/subscriber/get_by_phone/5500000000000/")
case "$STATUS" in
  200 | 404) ;;
  401 | 403) echo "O BotConversa recusou a chave (HTTP $STATUS). Nada foi gravado."; exit 1 ;;
  *) echo "Não foi possível conferir a chave (HTTP $STATUS). Nada foi gravado."; exit 1 ;;
esac

npx supabase secrets set BOTCONVERSA_API_KEY="$KEY" >/dev/null
unset KEY
echo "Chave do BotConversa conferida e gravada nos segredos do Supabase."
