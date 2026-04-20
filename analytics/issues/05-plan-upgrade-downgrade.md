# Issue 05: Lógica de Upgrade e Downgrade de Planos

## Descrição
Permitir que uma farmácia mude de plano sem precisar cancelar manualmente a assinatura atual.

## Tarefas
- [ ] Criar rota backend `PUT /api/subscriptions/update`.
- [ ] Implementar lógica: Cancelar `preapproval_id` antigo no Mercado Pago via API.
- [ ] Gerar novo `init_point` para o novo plano.
- [ ] Frontend: Detectar se já existe assinatura ativa e mudar label do botão para "Trocar Plano".

## Critérios de Aceite
- O fluxo de troca não deixa o cliente com duas assinaturas ativas simultaneamente.
- Histórico de pagamentos reflete o novo plano.
