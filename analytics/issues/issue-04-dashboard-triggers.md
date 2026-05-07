# Issue: Eliminar Recovery Scan no Dashboard [CONCLUÍDA]
**Data e Hora (Brasília):** 05/05/2026 16:18

**Status:** Implementado em 05/05/2026 16:21

**Resumo da Solução:**
- Refatorada a função `updateDashboardStats` para remover o "Recovery Scan" (agregação total de pagamentos e filtragem em memória).
- A função agora utiliza dados incrementais dos documentos `stats_revenue` e `config/stats`.
- Adicionada a chamada de `trackPaymentMetric` na rota de ativação manual por Admin, garantindo que a receita seja contabilizada corretamente.
- Utilizado `Promise.all` para otimizar as leituras de configuração do dashboard.

**Tarefas Realizadas:**
- [x] Implementar atualização incremental em todos os fluxos de pagamento (Pix, Webhook, Admin).
- [x] Remover o loop de varredura (recovery scan) da função `updateDashboardStats`.
- [x] Garantir atomicidade usando `FieldValue.increment`.
- [x] Otimizar leitura de contadores usando `.count()` nativo.
