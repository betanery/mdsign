-- MDSign — E-mail próprio (Resend): convites e lembretes saem do MDSign, com a marca e o nome de
-- quem enviou, em vez do e-mail do motor. Desligado por padrão; liga por organização em
-- Organização → Notificações. Não remove nada.

-- 1. Chave por organização.
alter table public.notification_settings
  add column email_enabled boolean not null default false;

-- 2. Cada documento guarda como foi criado: se o MDSign envia os e-mails dele (e o motor não) e
--    em que idioma. Mudar a chave depois não deixa documento sem convite nem com convite dobrado.
alter table public.documents
  add column own_email boolean not null default false,
  add column email_locale text not null default 'pt' check (email_locale in ('pt', 'en', 'es'));

-- 3. Ritmo do e-mail (o plano gratuito do Resend aceita 100 por dia e 3.000 por mês).
insert into public.policies (id, description, config) values
  ('email_rate', 'Limite de e-mails do MDSign por execução e por dia (toda a plataforma)',
   '{"per_run": 30, "per_day": 90}')
on conflict (id) do nothing;
