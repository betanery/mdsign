# Teste de carga do MDSign (sem o motor de assinatura)

Auditoria 16/10/2026, Fase 5. Executado em 17/10/2026 às 01h38 UTC (22h38 em Brasília), horário
de pouco uso. **Só leituras**: nada foi criado no SignDoc nem gravado no funil.

## Método

20 usuários simultâneos, 30 segundos por alvo, a partir de uma máquina no Brasil.

| Alvo | Requisições | Por segundo | Mediana | p95 | p99 | Erros |
|---|---:|---:|---:|---:|---:|---:|
| Landing `/pt` (Lovable/Cloudflare) | 4.450 | 148 | 88 ms | 374 ms | 686 ms | 0 |
| Página do Cedro `/pt/assinar-gratis` | 8.088 | 270 | 67 ms | 114 ms | 238 ms | 0 |
| Link público: carregar formulário (função + banco) | 797 | 27 | 692 ms | 1.082 ms | 3.653 ms | 0 |
| Link seguro inválido (função + banco) | 1.592 | 53 | 326 ms | 640 ms | 1.843 ms | 0 (404 esperado) |

Consultas pesadas no banco (média de várias execuções, conta real, só leitura):

| Consulta | Tempo |
|---|---:|
| Busca global | 18 ms |
| Relatório de 90 dias | 26 ms |
| Funil do Super Admin | 4 ms |
| Saúde da plataforma | 158 ms |

## Conclusões

- Nenhum erro em 14.927 requisições.
- O site estático aguenta folgado; as funções do servidor ficam entre 0,3 e 0,7 s de mediana
  (inclui a ida aos EUA — deve cair com o banco em São Paulo).
- A saúde da plataforma era a mais lenta por causa do histórico das rotinas (16.748 linhas em 12
  dias, sem limpeza). **Corrigido**: limpeza diária mantendo 14 dias (`mdsign-cron-cleanup`).

## O que falta

- Carga com o motor (criação e assinatura de documentos, envio em massa de 1.000 linhas): só no
  ambiente de homologação separado, depois da migração para São Paulo.
