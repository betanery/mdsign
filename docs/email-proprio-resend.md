# E-mail próprio do MDSign (Resend)

Objetivo: convites, lembretes e respostas saírem do MDSign, sem depender do e-mail do SignDoc
(que atrasou convites de aprovador e lembretes por API). Decisão de 17/10/2026: Resend.

## O que a Roberta faz (uma vez)

1. Criar a conta em resend.com (plano gratuito: até 3.000 e-mails por mês e 100 por dia).
2. **Domains → Add Domain**: usar um subdomínio de envio, por exemplo
   `mail.mundodigitaltech.com.br` (ou o domínio definitivo do MDSign, quando existir).
3. Cadastrar no DNS do domínio os registros que o Resend mostrar:
   - **SPF** (TXT) e **DKIM** (TXT ou CNAME): obrigatórios para não cair no spam;
   - **DMARC** (TXT em `_dmarc`), recomendado: `v=DMARC1; p=none; rua=mailto:contato@mundodigitaltech.com.br`.
4. Esperar o Resend marcar o domínio como **Verified**.
5. **API Keys → Create**, permissão "Sending access", só para esse domínio.
6. No terminal do projeto: `bash scripts/resend-key.sh` (cola a chave sem ela aparecer e informa
   o remetente, ex.: `MDSign <nao-responda@mail.mundodigitaltech.com.br>`).

## O que o Claude faz depois

1. Módulo de envio com tempo limite e registro em `notifications` (canal `email`).
2. Modelos de e-mail em pt/en/es (convite, lembrete, documento concluído, resposta ao titular),
   com o link seguro do MDSign (o mesmo do WhatsApp) e sem conteúdo do documento.
3. Chave por organização em Organização → Notificações: "Enviar e-mails pelo MDSign". Ligada,
   o MDSign envia e pede ao SignDoc para não enviar (`disablePendingActionNotifications`).
4. Teste real com a conta de demonstração antes de ligar para clientes.
5. Atualizar a Política de Privacidade (Resend como fornecedor de envio de e-mail).
