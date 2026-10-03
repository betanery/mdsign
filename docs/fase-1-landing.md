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

O formulário envia `POST` JSON para `VITE_LEAD_ENDPOINT` (backend ou Edge Function, nunca a
API SignDoc direto do navegador). Sem endpoint, abre o WhatsApp da Mundo Digital Tech com a
mensagem preenchida.

## Eventos de analytics

`cta_comece_gratis`, `cta_conheca_planos`, `cta_conheca_plataforma`, `plan_select`,
`cta_assinar_plano`, `cta_fale_especialista`, `cta_documentacao_api`, `cta_entrar`,
`form_submit`, `faq_open`. Todos levam as UTMs da sessão. Para ativar, defina `VITE_GTM_ID`.

## Pendências antes de publicar (marcadas com `VALIDAR` no código)

- [ ] Logo oficial da Mundo Digital Tech (o rodapé usa o nome em texto até lá).
- [ ] Endpoint e campos do exemplo da API: confirmar com a documentação real do SignDoc.
- [ ] Texto final dos depoimentos (Magic Colors e Abrace) e se os cargos podem aparecer.
- [ ] Respostas do FAQ: revisão da MDTech.
- [ ] Formas de autenticação do signatário efetivamente habilitadas (seção Segurança).
- [ ] Links "Quem somos" e "Blog" do rodapé.
- [ ] Definir `VITE_SITE_URL` e as demais URLs no ambiente de produção.

## Preparação para as Fases 2 e 3

- `/entrar` e `/desenvolvedores` já existem e redirecionam quando as URLs forem definidas.
- A landing não chama o motor SignDoc nem o gateway de pagamento: os CTAs só apontam para URLs
  configuráveis. A aplicação e o billing entram por trás de backend/Edge Functions.
- Planos e preços ficam em um único arquivo (`src/content/landing.ts`) e podem passar a vir do
  backend de billing sem mudar os componentes.
