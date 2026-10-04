-- Um CPF por conta: o CPF identifica o signatário no motor de assinatura (campo `identifier`
-- do SignDoc). Duas contas com o mesmo CPF assinariam com a mesma identidade.
-- O CPF é obrigatório para usar o app (exigido na tela "Confirme seu perfil"), mas a coluna
-- continua aceitando nulo porque o perfil nasce no cadastro, antes do CPF ser informado.
create unique index profiles_cpf_unique on public.profiles (cpf) where cpf is not null;
