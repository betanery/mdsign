-- Idioma em que o lead preencheu o formulário (PRD 27: pt, en, es).
alter table public.leads
  add column idioma text check (idioma in ('pt', 'en', 'es'));
