# MDSign — Fase 1 (landing comercial)

Implementação do PRD "MDSign — Fase 1 — Landing Page Comercial".

## Onde fica cada coisa

| Caminho | Conteúdo |
| --- | --- |
| `src/content/landing.ts` | Todos os textos, planos, FAQ, depoimentos e o exemplo da API |
| `src/config/site.ts` | Contatos e URLs configuráveis (variáveis `VITE_*`, ver `.env.example`) |
| `src/lib/analytics.ts` | Eventos de conversão (`dataLayer`/GTM) e captura de UTM |
| `src/components/landing/` | Seções da página e componentes reutilizáveis (`Cta`, `Logo`, formulário de lead) |
| `src/routes/` | `/`, `/desenvolvedores` (API), `/entrar` (app), `sitemap.xml`, `robots.txt` |
| `src/assets/` | Logo oficial (extraída do PDF), fotos das árvores e logos dos clientes |

## Como os CTAs se comportam

Os rótulos seguem o PRD (seção 18). O destino vem da configuração:

| CTA | Com a variável definida | Sem a variável |
| --- | --- | --- |
| Comece grátis | `VITE_SIGNUP_URL` (ou `VITE_APP_URL`) | abre o formulário com o plano Cedro |
| Assinar plano | `VITE_CHECKOUT_URL?plano=<id>` | abre o formulário com o plano escolhido |
| Fale com um especialista | — | abre o formulário |
| Entrar | `VITE_APP_URL` | página `/entrar` |
| Documentação da API | `VITE_API_DOCS_URL` | página `/desenvolvedores` |

O formulário envia `POST` JSON para a Edge Function `lead-submit` do Supabase (nunca para a API
SignDoc direto do navegador), que grava o contato na tabela `leads`.

## Eventos de analytics

`cta_comece_gratis`, `cta_conheca_planos`, `cta_conheca_plataforma`, `plan_select`,
`cta_assinar_plano`, `cta_fale_especialista`, `cta_documentacao_api`, `cta_entrar`,
`form_submit`, `faq_open`. Todos levam as UTMs da sessão. Para ativar, defina `VITE_GTM_ID`.

## Pendências antes de publicar

- [ ] Definir `VITE_SITE_URL` (endereço de produção) e as demais URLs do ambiente.
- [ ] Incluir o domínio de produção (e o do preview do Lovable, se for testar por lá) em
      `ALLOWED_ORIGINS`: `npx supabase secrets set ALLOWED_ORIGINS=http://localhost:5188,https://<dominio>`.
- [ ] Links "Quem somos" e "Blog" do rodapé (hoje aparecem como texto, sem link).

## Banco de dados (Supabase)

Projeto Supabase próprio do MDSign: `vrksxqbopteeyeovdwpu` (já configurado: tabela criada,
função publicada, `ALLOWED_ORIGINS=http://localhost:5188`). Estrutura em `supabase/`:

- `migrations/20261003210000_leads.sql`: tabela `public.leads`, com RLS ligado e sem acesso público.
- `functions/lead-submit`: Edge Function que recebe o formulário, valida os campos, bloqueia
  robôs (campo-armadilha), limita a 5 envios por IP a cada 10 minutos e grava com a service role.
  Aceita apenas os domínios listados no segredo `ALLOWED_ORIGINS`.

Para configurar outro projeto do zero:

```bash
npx supabase login
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push
npx supabase secrets set ALLOWED_ORIGINS=http://localhost:5188
npx supabase functions deploy lead-submit
```

O front já aponta para a função deste projeto por padrão; para usar outra, defina
`VITE_LEAD_ENDPOINT=https://<ref-do-projeto>.supabase.co/functions/v1/lead-submit`.
Quando o domínio de produção existir, inclua-o em `ALLOWED_ORIGINS` (separado por vírgula).

Os leads ficam em **Table Editor → leads** no painel do Supabase. A coluna `status` serve para
acompanhar o atendimento (`novo`, `em_contato`, `convertido`, `descartado`).

## Fonte da API

O exemplo de código, os eventos de webhook e a página `/desenvolvedores` seguem a documentação
oficial: https://sign.signdocmd.com.br/swagger/index.html (SignDoc MD v2.9.0).

## Preparação para as Fases 2 e 3

- `/entrar` e `/desenvolvedores` já existem e redirecionam quando as URLs forem definidas.
- A landing não chama o motor SignDoc nem o gateway de pagamento: os CTAs só apontam para URLs
  configuráveis. A aplicação e o billing entram por trás de backend/Edge Functions.
- Planos e preços ficam em um único arquivo (`src/content/landing.ts`) e podem passar a vir do
  backend de billing sem mudar os componentes.
