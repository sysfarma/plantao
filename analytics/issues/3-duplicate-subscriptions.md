# Issue 3: Bloqueio de Assinaturas Duplicadas
**Data de Geração:** 30/04/2026 09:02:00 (Horário de Brasília)

## Descrição
Evitar que uma farmácia tenha múltiplas assinaturas ativas geradas por falhas de processamento de webhooks repetidos.

## Requisitos
- **Local:** `server.ts` -> Lógica de processamento de pagamentos/webhooks.
- Antes de registrar uma nova `subscription`, verificar se já existe um documento com o mesmo `mp_preapproval_id` ou se a farmácia já possui uma assinatura com status `active` para evitar redundância.
