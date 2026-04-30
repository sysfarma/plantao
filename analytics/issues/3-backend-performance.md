# Issue 3: Performance do Backend e Gestão de Cotas

## Descrição
O servidor realiza filtragem em memória e sofre com picos de operações no Firestore disparados por webhooks.

## Tarefas
- [ ] Reestruturar queries no `server.ts` para usar filtros nativos do Firestore (`where('city', '==', ...)`).
- [ ] Implementar paginação real (limit/offset ou cursor) em todos os endpoints de listagem.
- [ ] Refatorar `updateDashboardStats` para usar um cache (ex: 5 minutos) em vez de recalcular tudo a cada webhook.
- [ ] Paralelizar buscas de farmácias na rota de plantão usando `Promise.all`.

## Arquivos Afetados
- `server.ts`
