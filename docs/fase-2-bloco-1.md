# MDSign Fase 2 — Bloco 1 (fundação do app)

PRD Fase 2 §58, Bloco 1: Auth, tenant, organização, perfis, permissões, design system, i18n e backend.

## O que existe

| Área | Onde |
|---|---|
| Banco: perfis, organizações, unidades, membros, papéis, permissões, convites, auditoria, Super Admin | `supabase/migrations/20261004090000_bloco1_tenancy.sql` |
| Testes de isolamento (RLS) e permissões | `supabase/tests/rls.sql` · rodar com `bash scripts/test-rls.sh` |
| Cliente Supabase (chave publishable) | `src/lib/supabase.ts` |
| Sessão, organização atual e permissões | `src/app/auth.tsx`, `src/app/org.tsx` |
| Idiomas do app (pt, en, es) | `src/i18n/app/*.ts`, `src/app/i18n.tsx` |
| Moldura do app (menu desktop, barra mobile com "+", jornadas) | `src/app/components/app-shell.tsx` |
| Telas | `src/routes/app/*` e `src/routes/admin.tsx` |

### Rotas

| Rota | Tela |
|---|---|
| `/app/login`, `/app/signup`, `/app/forgot-password`, `/app/reset-password` | Acesso |
| `/app/invite/:token` | Aceitar convite |
| `/app` | Início: 4 jornadas, "Precisa da sua atenção", primeiros passos. Primeiro acesso cria a organização |
| `/app/organization` | Membros (convidar, papel, unidade, suspender, remover), unidades, auditoria, dados |
| `/app/settings` | Perfil (nome, CPF, celular), idioma, sair |
| `/app/documents`, `/templates`, `/processes`, `/bulk`, `/forms`, `/contacts`, `/integrations`, `/reports` | "Em breve" (próximos blocos) |
| `/admin` | Super Admin (somente quem está em `platform_admins`) |

## Papéis e permissões

Papéis do PRD §22: Proprietário, Administrador, Gestor, Operador, Usuário, Visualizador e
Financeiro. As permissões ficam na tabela `role_permissions` (dados, não código) e o front
consulta `my_permissions` para esconder ações. Toda escrita sensível é validada no banco.

Regras garantidas pelo banco e cobertas pelos testes:

- um cliente não vê nada de outro (organizações, membros, perfis, auditoria);
- só quem tem `members.manage` convida, altera e remove membros;
- só Proprietário convida/altera outro Proprietário; o último Proprietário não sai nem é rebaixado;
- convite só é aceito pelo e-mail convidado e expira em 7 dias;
- ninguém insere associações direto nem apaga auditoria;
- anônimo não lê nada.

## Configuração de autenticação no Supabase

Aplicada em 03/10/2026 com `npx supabase config push` (`supabase/config.toml`, seção `[auth]`):

- **Site URL:** `https://mdsign.lovable.app` (trocar pelo domínio de produção depois)
- **Redirect URLs:** `http://localhost:5188/**`, `https://mdsign.lovable.app/**` e os dois
  endereços de preview do Lovable.

O `config.toml` foi alinhado ao que já estava no projeto (confirmação de e-mail ligada, MFA TOTP,
pooler, storage). Antes de qualquer `config push`, rode `npx supabase config diff` e confira que
só mudam os itens desejados. Para produção, configurar SMTP próprio (Authentication → Emails): o envio
padrão do Supabase tem limite baixo de e-mails por hora.

Super Admin: incluir o usuário em `public.platform_admins` (SQL Editor:
`insert into platform_admins (user_id) select id from auth.users where email = '...';`).

## Senhas

- Tela (cadastro e troca de senha): mínimo de 8 caracteres, 1 número e 1 caractere especial,
  com campo "Confirmar senha" e lista de requisitos que atualiza enquanto a pessoa digita
  (`src/app/password.tsx`).
- Servidor (Supabase): `minimum_password_length = 8` e `password_requirements = "letters_digits"`
  (o mais próximo sem exigir maiúsculas/minúsculas; o caractere especial é exigido na tela).

## Perfil e CPF

O CPF é **obrigatório**: o motor de assinatura exige o `identifier` (CPF) de cada signatário, e o
"Só eu assino" usa o CPF da própria pessoa. Quem entra sem nome ou sem CPF vê "Confirme seu
perfil" antes de seguir, mesmo já tendo organização. O primeiro acesso e as Configurações também
exigem CPF válido. No banco, um CPF só pode estar em uma conta
(`20261004180000_profiles_cpf_unico.sql`).

Observação para EN/ES: o motor aceita como `identifier` o CPF (Brasil) ou a Cédula de Identidad
(Equador/Paraguai). Signatários estrangeiros sem esses documentos precisam de uma decisão de
produto antes do Bloco 2.

## Fora do Bloco 1

Convites ainda não enviam e-mail (o link é copiado na tela); envio entra com as notificações
(Bloco 3). Assinatura e documentos dependem da correção do incidente na instância SignDoc
(`docs/incidente-signdoc-api-criacao-documento.md`).
