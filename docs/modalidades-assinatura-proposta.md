# Proposta para o jurídico: nomes das modalidades de assinatura

Auditoria de 16/10/2026, Fase 2 item 8. **Proposta, não aplicada.** Os nomes na tela só mudam
depois da aprovação do jurídico.

## Como está hoje

O MDSign oferece níveis de autenticação que o motor (SignDoc/Lacuna) executa. Os nomes na tela
não usam as categorias da Lei nº 14.063/2020 (simples, avançada, qualificada), mas os Termos de
Uso (seção 6) usam. Os níveis só aparecem quando o método está contratado no motor.

| Código | Nome na tela hoje | O que o motor exige | Disponível hoje |
|---|---|---|---|
| `basic` | Padrão (e-mail) | Link de assinatura enviado ao e-mail do signatário | Sim |
| `reinforced` | Reforçada (código por SMS) | Código por SMS ao celular | Depende do contrato |
| `reinforced_whatsapp` | Reforçada (código por WhatsApp) | Código por WhatsApp | Depende do contrato |
| `identity` | Identidade (selfie) | Selfie | Depende do contrato |
| `identity_datavalid` | Identidade (Datavalid / base do governo) | Biometria facial conferida na base do governo | Depende do contrato |
| `high` | Alta (prova de vida) | Prova de vida | Depende do contrato |
| `qualified` | Certificado digital ICP-Brasil | Certificado ICP-Brasil (assinatura eletrônica desligada) | Sim |

## Proposta de correspondência (a validar)

| Código | Categoria proposta (Lei 14.063/2020, art. 4º) | Nome sugerido na tela |
|---|---|---|
| `basic` | Assinatura eletrônica **simples** | Simples — confirmação por e-mail |
| `reinforced`, `reinforced_whatsapp` | **Simples** com fator adicional (avaliar se atinge **avançada**) | Simples com código por SMS / WhatsApp |
| `identity`, `identity_datavalid`, `high` | Assinatura eletrônica **avançada** (avaliar, depende dos requisitos do art. 4º, II) | Avançada — validação de identidade (selfie / Datavalid / prova de vida) |
| `qualified` | Assinatura eletrônica **qualificada** (certificado ICP-Brasil, MP 2.200-2/2001) | Qualificada — certificado ICP-Brasil |

## Perguntas para o jurídico

1. A confirmação por e-mail com código por SMS ou WhatsApp é simples ou pode ser apresentada como
   avançada?
2. Selfie, Datavalid e prova de vida atendem aos requisitos da assinatura avançada (vinculação
   unívoca ao signatário, controle exclusivo e detecção de alterações)? Isso depende também das
   evidências geradas pelo motor (ver item P1-01 da auditoria).
3. Devemos mostrar, ao lado de cada opção, um aviso curto de quando ela é exigida (ex.: atos com
   órgãos públicos, imóveis)?

Com as respostas, a mudança no app é pequena: trocar os rótulos em `src/i18n/app/*.ts`
(`participants.levels`) e incluir um texto de ajuda por opção.
