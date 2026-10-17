#!/usr/bin/env bash
# Grava a chave do Resend (e-mail próprio do MDSign) nos segredos das funções do Supabase.
# A chave é digitada sem aparecer na tela e não fica no histórico nem no repositório.
# Uso: bash scripts/resend-key.sh
set -euo pipefail
cd "$(dirname "$0")/.."

read -r -s -p "Chave da API do Resend (começa com re_): " KEY
echo
case "$KEY" in
  re_*) ;;
  *) echo "A chave do Resend começa com re_. Nada foi gravado."; exit 1 ;;
esac
read -r -p "Remetente (ex.: MDSign <nao-responda@mdsign.com.br>): " FROM
if [ -z "$FROM" ]; then echo "Remetente vazio. Nada foi gravado."; exit 1; fi

npx supabase secrets set RESEND_API_KEY="$KEY" EMAIL_FROM="$FROM" >/dev/null
unset KEY
echo "Chave do Resend e remetente gravados nos segredos do Supabase."
