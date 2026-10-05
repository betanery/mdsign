-- MDSign Fase 2 — níveis de autenticação por método (PRD §10): SMS e WhatsApp (reforçada),
-- selfie e Datavalid (identidade), prova de vida (alta).
alter table public.document_participants drop constraint document_participants_auth_level_check;
alter table public.document_participants add constraint document_participants_auth_level_check
  check (auth_level in ('basic', 'reinforced', 'reinforced_whatsapp', 'identity',
                        'identity_datavalid', 'high', 'qualified'));
alter table public.forms add constraint forms_auth_level_check
  check (auth_level in ('basic', 'reinforced', 'reinforced_whatsapp', 'identity',
                        'identity_datavalid', 'high', 'qualified'));
