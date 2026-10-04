#!/usr/bin/env bash
# Aplica as migrações pendentes + os testes de RLS numa transação e desfaz tudo no final.
# Uso: bash scripts/test-rls.sh [migração-pendente.sql ...]
# Requer o projeto ligado (npx supabase link). Nada é gravado no banco.
set -euo pipefail
cd "$(dirname "$0")/.."

sql="$(mktemp)"
trap 'rm -f "$sql"' EXIT
{
  echo "begin;"
  for migration in "$@"; do cat "$migration"; echo; done
  cat supabase/tests/rls.sql
  echo "rollback;"
} > "$sql"

npx supabase db query --linked -f "$sql"
