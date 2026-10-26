-- MDSign — linha do tempo mais completa para quem enviou: e-mail entregue/aberto (avisos do
-- Resend) e "abriu o documento". Só acréscimos.
-- O motor de assinatura não informa leitura nem abertura; isso só existe para convites enviados
-- pelo MDSign (e-mail próprio/WhatsApp) e para quem abre a assinatura pelo MDSign.

alter table public.notifications add column if not exists opened_at timestamptz;
comment on column public.notifications.opened_at is
  'Primeira abertura do e-mail informada pelo provedor (Resend). Depende do rastreio de abertura do provedor; nem todo leitor de e-mail avisa.';
create index if not exists notifications_provider_message_idx
  on public.notifications (provider_message_id) where provider_message_id is not null;
