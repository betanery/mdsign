# Plano de migração do banco para São Paulo (sa-east-1)

Decisão de 16/10/2026: ao colocar o MDSign em produção, o banco sai de `us-east-1` (EUA) e vai
para `sa-east-1` (São Paulo), resolvendo o risco P0-01 da auditoria (transferência internacional
de dados pessoais). O projeto atual (`vrksxqbopteeyeovdwpu`) passa a ser o ambiente de
**homologação**.

> Este plano **não foi executado**. Cada etapa marcada com ⚠️ precisa de aprovação antes.

## 1. O que existe hoje (inventário)

| Item | Onde está | O que fazer |
|---|---|---|
| Esquema do banco | `supabase/migrations/*.sql` (versionado) | Aplicar no projeto novo com `supabase db push` |
| Dados | Postgres do projeto atual (46 tabelas `public`, `auth`, `storage`, `vault`) | Copiar com `pg_dump`/`pg_restore` na janela de migração |
| Usuários e senhas, MFA | Esquema `auth` (inclui `mfa_factors`) | Vêm no dump do `auth`; senhas e fatores TOTP continuam valendo |
| Arquivos | Buckets privados `templates` e `bulk-sources` | Copiar objeto a objeto (script com a API do Storage) |
| Funções do servidor | `supabase/functions` (22 funções) | `supabase functions deploy` no projeto novo |
| Segredos das funções | ALLOWED_ORIGINS, ASAAS_API_KEY, ASAAS_ENV, ASAAS_WEBHOOK_TOKEN, CRON_SECRET, SIGNDOC_ADMIN_API_KEY, SIGNDOC_API_KEY, SIGNDOC_AUTH_METHODS, SIGNDOC_WEBHOOK_TOKEN, WHATSAPP_WEBHOOK_SECRET (+ BOTCONVERSA_API_KEY quando existir) | Gravar no projeto novo pelos scripts `read -s` (nunca no chat) |
| Segredos no Vault | `mdsign_cron_secret` e `mdsign_functions_url` (usados pelas rotinas) | Recriar no Vault do projeto novo, com o endereço do projeto novo |
| Rotinas agendadas | `mdsign-reminders-run` (de hora em hora), `mdsign-webhooks-run` (a cada minuto) | Criadas pelas migrações; leem o endereço do Vault (seção 2) |
| Webhook do SignDoc | Cadastrado no motor apontando para `…/functions/v1/signdoc-webhook` | ⚠️ Repontar para o projeto novo |
| Webhook do Asaas (Sandbox) | Cadastrado no Asaas apontando para `…/functions/v1/asaas-webhook` | Repontar (Super Admin → Cobrança → Configurar webhook) |
| Front (Lovable) | `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (com valores padrão no código) | Trocar as variáveis no Lovable e os valores padrão no código |
| Configuração do Auth | URLs de redirecionamento, confirmação de e-mail, modelos de e-mail, MFA TOTP | Reproduzir no painel do projeto novo |

## 2. Correções antes de migrar (no código, sem efeito na produção atual)

1. ✅ **Rotinas agendadas com endereço fixo** (feito em 16/10/2026, migração
   `20261016180000_rotinas_endereco_no_cofre.sql`). As rotinas leem a URL base do Vault
   (`mdsign_functions_url`, ex.: `https://<projeto>.supabase.co/functions/v1`). No projeto novo,
   gravar esse segredo e o `mdsign_cron_secret` antes de ligar as rotinas; sem o segredo, a
   chamada não acontece.
2. **Valores padrão do projeto no front**: `src/lib/supabase.ts`, `src/config/site.ts`
   (`leadEndpoint`) e `src/lib/security-headers.ts` caem no projeto atual quando a variável não
   existe. Passar a exigir as variáveis em produção (ou trocar os padrões no dia da migração).
3. **Script de cópia do Storage** (`scripts/copy-storage.ts`): lista e copia os objetos dos dois
   buckets entre projetos, conferindo quantidade e tamanho.

## 3. Ensaio (num projeto de teste em São Paulo) ⚠️ gera custo

1. Criar o projeto `mdsign-ensaio` em `sa-east-1`.
2. `supabase link` no projeto de ensaio → `supabase db push` (esquema).
3. Rodar `bash scripts/test-rls.sh` contra ele (bateria completa de segurança).
4. Dump do projeto atual e restauração no ensaio; cópia do Storage.
5. Publicar as funções, gravar segredos de teste, apontar um front local para o ensaio.
6. Executar a matriz de testes da auditoria (T-01 a T-25) no ensaio.
7. Medir a duração de cada passo (define a janela da migração real) e apagar o projeto de ensaio.

## 4. Migração real (janela curta, fora do horário comercial) ⚠️

1. Avisar os clientes da janela (ex.: 30 a 60 min).
2. Criar o projeto `mdsign` em `sa-east-1`; aplicar o esquema; gravar segredos e Vault.
3. **Congelar escrita**: Lovable em página de manutenção; desligar as duas rotinas no projeto antigo.
4. Dump final do projeto antigo → restauração no novo; cópia do Storage.
5. Conferência: contagem de linhas por tabela e de arquivos por bucket iguais nos dois projetos.
6. Publicar as funções no novo; recriar as rotinas (seção 2.1) e ligá-las.
7. Repontar o webhook do SignDoc e do Asaas para o projeto novo.
8. Trocar as variáveis do Lovable e publicar.
9. Testes de fumaça: login com MFA, Só eu assino, envio, webhook do motor chegando, download,
   Super Admin.
10. Reabrir. Manter o projeto antigo só leitura por 7 dias; depois vira homologação (dados de teste).

## 5. Critérios para voltar atrás (rollback)

- Contagens divergentes que não se expliquem.
- Falha nos testes de fumaça de login, criação de documento ou webhook do motor.
- Ação: voltar as variáveis do Lovable para o projeto antigo, religar as rotinas dele e repontar
  os webhooks. Como a escrita estava congelada, nada se perde.

## 6. Depois da migração

- Atualizar a Política de Privacidade (seção 11) com o local de armazenamento no Brasil.
- Atualizar `docs/asaas-producao.md` e a memória do projeto com o novo `project ref`.
- Confirmar com a Lacuna onde o SignDoc guarda os documentos (fora do escopo desta migração).
