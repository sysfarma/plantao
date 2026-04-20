# Issue 07: Tratamento Avançado de Webhooks (Estorno e Cancelamento)

## Descrição
Melhorar a resiliência do sistema de assinaturas para reagir a eventos externos (como chargeback ou cancelamento no MP).

## Tarefas
- [ ] Atualizar handler `/api/webhooks/payment` no `server.ts`.
- [ ] Adicionar suporte a eventos de `refunded`.
- [ ] Adicionar suporte a eventos de `cancelled` (PreApproval).
- [ ] Lógica: Setar `is_active: 0` e `subscription_active: false` na farmácia ao detectar inadimplência/cancelamento.
- [ ] Notificação: Integrar envio de e-mail automático via `emailService`.

## Critérios de Aceite
- O app remove o acesso premium da farmácia assim que o webhook de cancelamento é recebido e validado.
