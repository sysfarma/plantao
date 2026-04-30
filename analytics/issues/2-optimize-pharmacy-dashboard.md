# Issue 2: Otimização do Painel da Farmácia

## Descrição
O painel do dono da farmácia utiliza listeners em tempo real pesados e carrega dados históricos excessivos.

## Tarefas
- [ ] Substituir `onSnapshot` por chamadas de API (`GET`) para as coleções de cliques e audit_logs em `src/pages/pharmacy/Dashboard.tsx`.
- [ ] Implementar filtro temporal padrão para buscar apenas métricas dos últimos 30 dias.
- [ ] Adicionar paginação para o histórico de operações/logs da farmácia.

## Arquivos Afetados
- `src/pages/pharmacy/Dashboard.tsx`
- `server.ts` (novos endpoints de métricas por farmácia)
