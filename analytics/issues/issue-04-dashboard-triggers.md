# Issue: Eliminar Recovery Scan no Dashboard
**Data e Hora (Brasília):** 05/05/2026 16:06

**Descrição:**
O backend recalcula estatísticas anuais percorrendo todos os pagamentos quando um documento não é encontrado. Isso é ineficiente.

**Tarefas:**
- Implementar atualização incremental dos documentos de `dashboard_stats` sempre que um novo pagamento for confirmado.
- Remover o loop de varredura (recovery scan) da função `updateDashboardStats`.
- Garantir atomicidade nas atualizações de contadores e somatórios.
