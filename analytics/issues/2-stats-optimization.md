# Issue 2: Otimização de Estatísticas Financeiras
**Data de Geração:** 30/04/2026 09:02:00 (Horário de Brasília)

## Descrição
A função `updateDashboardStats` recalcula todo o histórico anual a cada acesso, causando lentidão e consumo de cotas.

## Requisitos
- **Local:** `server.ts` -> Função `updateDashboardStats`
- Criar a coleção `system_stats` no Firestore.
- Implementar lógica de "Contagem Incremental": ao aprovar um pagamento, atualizar o documento do mês correspondente na `system_stats` (ex: `stats/2026_04`).
- O dashboard deve ler este documento consolidado em vez de processar todos os pagamentos.
