# MDSign — PDF como modelo e PDF com vários documentos

Duas funções diferentes sobre o mesmo motor de assinatura (`createDocument` → SignDoc).

## 1. Usar um PDF pronto como modelo
**Modelos → Novo modelo → Usar um PDF pronto.**
Etapas: Documento → Participantes → Campos → Testar → Salvar.

- O PDF fica em bucket privado (`templates`, sem políticas para usuários). Só a função
  `templates-pdf` mexe nos arquivos (enviar, ver por URL assinada de 10 min, duplicar, excluir).
- **Campos**: paleta (Nome, CPF, CNPJ, E-mail, Telefone, Data, Cidade, Empresa, Cargo, Texto,
  Número, Checkbox, personalizado). Cada campo tem uma variável `{{chave}}`, uma origem (manual,
  signatário, remetente, contato, planilha, API, HCM) e uma ou mais posições. Campos de
  formulário que o PDF já traz (AcroForm) são detectados e preenchidos.
- **Papéis** (ex.: Colaborador, Gestor, RH): ordem, assina/aprova, autenticação, lembretes e
  mensagem padrão. Por papel: **Assinatura**, **Rubrica**, **Data e carimbo** (marcas do
  SignDoc, `prePositionedMarks`) e **Nome do signatário** (preenchido com quem ocupa o papel).
  A data da assinatura só existe depois de assinar: ela vem no carimbo do SignDoc.
- **Testar modelo**: dados fictícios → prévia gerada no servidor, com as posições de
  assinatura desenhadas. Nada é enviado nem consumido do plano.
- **Uso**: envio individual (uma pessoa por papel), link público (quem responde ocupa o
  1º papel; os demais são pessoas fixas do link) e envio em massa (cada linha ocupa o 1º papel).
- O editor visual pede tela de pelo menos 1024 px. Usar o modelo funciona no celular.

## 2. Tenho um PDF com vários documentos
**Envio em massa → Novo → Tenho um PDF com vários documentos**, ou o atalho
**Contracheques / documentos por colaborador** (separação pelo conteúdo + matrícula).
Etapas: Enviar → Separar → Identificar → Conferir → Assinatura → Revisar → Enviar.

- O PDF original (até 50 MB / 1.000 páginas) é lido e **separado no navegador**. O texto de
  cada página é extraído com pdf.js, e cada parte (o arquivo exato que a pessoa vai receber)
  vai para o bucket privado `bulk-sources` por URL de upload assinada. Assim o servidor não
  precisa abrir um PDF de 500 páginas a cada envio (as Edge Functions têm limite de CPU).
- **Separação**: uma página por pessoa, N páginas por pessoa, pelo conteúdo, ou intervalos
  manuais (`1-2, 3, 4-6`).
  - Pelo conteúdo: um novo documento começa quando aparece o identificador de outra pessoa,
    ou, numa página sem identificador, o nome completo de outra pessoa conhecida.
  - Uma página nunca é anexada em silêncio ao documento de outra pessoa.
- **Identificação** (planilha opcional; sem ela, os Contatos): CPF (com dígito verificador)
  → matrícula → e-mail → identificador configurado (rótulo + valor). O nome só sugere.
  - 🟢 Identificado: um identificador verificável aponta para exatamente uma pessoa, sem
    conflito, e todas as páginas estão ligadas a ela.
  - 🟡 Requer confirmação: só nome, várias pessoas possíveis, identificadores de pessoas
    diferentes, ou páginas sem identificação.
  - 🔴 Não identificado.
- **Conferência**: na tabela, clicar abre o PDF da parte e os dados.
  - Ações: Confirmar, Trocar destinatário (planilha/contatos ou digitado), Excluir do lote,
    Separar a partir de uma página.
  - "Enviar todos" fica bloqueado enquanto houver amarelo ou vermelho sem tratamento.
- **Servidor** (`bulk-jobs`):
  - `create-pdf` recusa associação insegura (`unsafe_association`), parte inexistente,
    páginas sobrepostas e destinatário inválido.
  - **Antes de enviar cada documento identificado automaticamente**, extrai o texto da parte
    (unpdf) e confirma que o CPF/matrícula/e-mail associado aparece nela. Se não aparecer, o
    item vira `identity_mismatch` e não é enviado.
  - Itens confirmados manualmente pulam essa checagem, com registro de quem confirmou e quando.
- **Revisão**: "Visualizar amostra" (obrigatório antes de liberar) e "Enviar teste para mim".
- **Processamento**: item a item; um erro não cancela os outros.
  - Status por documento: Pronto, Enviando, Enviado, Aguardando assinatura, Assinado, Erro.
  - Central de erros: reenviar só os com erro e corrigir o destinatário (auditado).
- **Processos MDSign** (`/app/processes`): "Salvar como Processo MDSign" grava separação,
  identificação, autenticação, posição da assinatura, mensagem e lembretes. "Fazer de novo"
  abre o assistente já configurado; só falta trocar o PDF e a planilha.

## Auditoria
- `bulk.created`: arquivo, SHA-256 do original, páginas, regra de separação e
  identificação, totais por método e quantas confirmações manuais.
- `bulk.items_confirmed`: linhas confirmadas manualmente.
- `bulk.item_reassigned`: troca de destinatário, de/para.
- `bulk.retried`: reenvio de itens com erro.
- Além do status de cada envio na timeline do documento.

## Limites e fora desta entrega
- PDF escaneado sem texto: sem OCR. A separação funciona, mas a associação é manual.
- PDF de modelo com páginas giradas (/Rotate) pode deslocar as posições: use PDFs em retrato.
- **Conferir no primeiro envio real**: o SignDoc mede as marcas (`topLeftX/Y`) a partir do
  canto superior esquerdo da página, segundo a documentação. A primeira assinatura posicionada
  deve ser conferida no documento final.
- API e HCM Connect: as origens `api`/`hcm` dos campos já ficam gravadas para as próximas fases.

## Banco
- `20261005190000_modelos_pdf.sql`: buckets privados, `templates.kind/file_path/page_count/
  participants/flow/marks`.
- `20261005195000_papeis_links.sql`: `forms.role_people`.
- `20261005200000_massa_pdf_processos.sql`: `bulk_jobs.source/source_folder/source_sha256/
  source_pages/split`, `bulk_items.page_from/page_to/match`, tabela `processes`.

## Posição da assinatura, testemunhas, observadores e edição após o envio
- **Posicionar assinatura, rubrica e carimbo** (componente `MarksEditor`) em todos os fluxos:
  - **Só eu assino**: opcional, antes de assinar.
  - **Enviar para assinatura**: nova etapa "Assinaturas".
  - **Usar modelo**: sobre a prévia, quando o modelo não tem posições próprias.
  - **Envio em massa por modelo**: primeira ou última página de cada documento.
  - **PDF com vários documentos** e **modelos PDF**: já tinham.

  Link público com modelo de texto: posição automática do SignDoc (ou use um modelo PDF com
  posições).
- **Testemunha**: papel próprio no MDSign. No SignDoc é um signatário com o título
  "Testemunha" (o motor não tem um tipo "testemunha"). Pode ter autenticação e posição.
- **Observadores**: acompanham e recebem as notificações do SignDoc, sem assinar.
  - Disponíveis no envio, no envio por modelo, no envio em massa e no Só eu assino.
  - Se o observador tiver conta MDSign, ele vê o documento (`document_observers` +
    `can_view_document`).
- **Editar depois de enviado** (documento pendente; quem criou ou `documents.manage`):
  - **Editar participantes**: trocar e-mail/celular de quem ainda não assinou, remover,
    incluir participante ou testemunha (entram depois do último passo), incluir ou remover
    observadores (`POST /documents/{id}/flow`).
  - **Substituir documento**: nova versão do PDF, com posições opcionais. O SignDoc reinicia
    o fluxo e todos assinam a nova versão (`POST /documents/{id}/versions`).
  - Tudo vai para a timeline (`participant.added/removed/updated`, `observer.added/removed`,
    `document.version_added`) e para a auditoria (`document.flow_edited`,
    `document.version_added`).
