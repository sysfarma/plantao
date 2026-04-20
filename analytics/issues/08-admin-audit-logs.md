# Issue 08: Logs de Auditoria Administrativa

## Descrição
Registrar alterações manuais feitas pelo Admin para segurança e histórico de suporte.

## Tarefas
- [ ] Criar coleção `audit_logs` no Firestore.
- [ ] Implementar interceptor ou lógica no backend para salvar logs em cada `PUT` ou `DELETE` administrativo.
- [ ] Informações: `admin_id`, `resource_type`, `resource_id`, `action`, `timestamp`.
- [ ] (Opcional) Aba de Visualização de Logs no Admin Master.

## Critérios de Aceite
- Cada alteração manual de status de assinatura gera um rastro de auditoria permanente.
