#!/usr/bin/env bash
# Troca a chave da aplicação do SignDoc usada pelo MDSign (SIGNDOC_API_KEY).
# Antes de gravar, testa a chave nova lendo um documento conhecido da organização MDSign
# Plataforma: se não ler, nada muda. A chave não aparece na tela nem fica no histórico.
# Uso: bash scripts/signdoc-key.sh
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="https://sign.signdocmd.com.br"
# Documento concluído da organização (só leitura, para provar que a chave é da mesma organização).
PROBE="b9357215-600f-4566-abbd-c0b507020f26"

read -r -s -p "Chave da API da aplicação nova do SignDoc: " KEY
echo
if [ -z "$KEY" ]; then echo "Chave vazia. Nada foi gravado."; exit 1; fi

# A chave vai para o curl pela entrada padrão (não aparece na lista de processos).
CODE=$(printf 'header = "X-Api-Key: %s"\n' "$KEY" |
  curl -s -o /dev/null -w "%{http_code}" --max-time 20 -K - "$BASE/api/documents/$PROBE")
if [ "$CODE" != "200" ]; then
  unset KEY
  echo "Teste falhou (HTTP $CODE): a chave não leu o documento da organização. Nada foi gravado."
  echo "Confira se a aplicação foi criada na organização MDSign Plataforma, com os mesmos papéis."
  exit 1
fi
echo "Teste ok: a chave lê documentos da organização."

ENV_FILE="$(mktemp)"
chmod 600 "$ENV_FILE"
trap 'rm -f "$ENV_FILE"' EXIT
printf 'SIGNDOC_API_KEY=%s\n' "$KEY" > "$ENV_FILE"
unset KEY
npx supabase secrets set --env-file "$ENV_FILE" >/dev/null
echo "Chave nova gravada nos segredos do Supabase (vale para as funções na próxima chamada)."
