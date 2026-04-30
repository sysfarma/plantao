# Issue 1: Refatoração do Painel Administrativo

## Descrição
O Painel Administrativo atual realiza leituras diretas do Firestore e não trata adequadamente erros de infraestrutura.

## Tarefas
- [ ] Eliminar todas as chamadas `getDoc`, `getDocs` e `query` do Firestore SDK no arquivo `src/pages/admin/Dashboard.tsx`.
- [ ] Migrar todas as buscas de dados (farmácias, logs, estatísticas) para chamadas aos endpoints `/api/admin/*`.
- [ ] Implementar tratamento de erro amigável para falhas de cota (`Quota exceeded`) e limites de taxa (`Rate exceeded`).
- [ ] Adicionar Skeletons de carregamento para as tabelas paginadas.

## Arquivos Afetados
- `src/pages/admin/Dashboard.tsx`
