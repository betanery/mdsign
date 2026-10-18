#!/usr/bin/env bash
# Gera um novo segredo para o aviso de descadastro ("SAIR") do BotConversa para o MDSign,
# grava nos segredos das funções do Supabase e mostra UMA vez, para colar no BotConversa.
# O segredo anterior deixa de valer. Não fica no repositório nem no histórico do terminal.
# Uso: bash scripts/whatsapp-webhook-secret.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SECRET=$(openssl rand -hex 32)
npx supabase secrets set WHATSAPP_WEBHOOK_SECRET="$SECRET" >/dev/null
REF="vrksxqbopteeyeovdwpu"

echo
echo "Segredo novo gravado. Configure no BotConversa (fluxo da palavra-chave SAIR → bloco de requisição HTTP):"
echo
echo "  Método:    POST"
echo "  URL:       https://${REF}.supabase.co/functions/v1/whatsapp-webhook"
echo "  Cabeçalho: x-mdsign-whatsapp-secret: ${SECRET}"
echo "  Corpo:     {\"phone\": \"<campo do telefone do contato>\", \"keyword\": \"SAIR\"}"
echo
echo "Este segredo não será mostrado de novo. Feche este terminal depois de colar."
unset SECRET
